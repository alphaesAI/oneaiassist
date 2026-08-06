import { getTenantPrisma } from '../db';

export interface PineconeVector {
  id: string;
  values: number[];
  metadata: {
    tenantId: string;
    policyCatalogId?: string;
    policyId?: string;
    text: string;
    pageNumber: number;
  };
}

export interface PineconeQueryResult {
  id: string;
  score: number;
  metadata: PineconeVector['metadata'];
}

export class PineconeClient {
  private apiKey: string;
  private host: string;
  private isMock: boolean;

  constructor() {
    this.apiKey = process.env.PINECONE_API_KEY || '';
    // host could look like: my-index-xxx.svc.us-east1-gcp.pinecone.io
    this.host = process.env.PINECONE_HOST || '';
    
    // Auto fallback to mock if keys are missing or mock keys are specified
    this.isMock = !this.apiKey || !this.host || this.apiKey.startsWith('pc-mock');
  }

  async upsert(tenantId: string, vectors: PineconeVector[]): Promise<boolean> {
    if (this.isMock) {
      console.log(`[Mock Pinecone] Upserted ${vectors.length} vectors into namespace "${tenantId}"`);
      return true;
    }

    try {
      // Normalize URL host
      let cleanHost = this.host;
      if (!cleanHost.startsWith('http://') && !cleanHost.startsWith('https://')) {
        cleanHost = `https://${cleanHost}`;
      }

      const res = await fetch(`${cleanHost}/vectors/upsert`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Api-Key': this.apiKey,
        },
        body: JSON.stringify({
          vectors,
          namespace: tenantId, // Tenant isolation namespace
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error('[Pinecone Client] Upsert failed:', errorText);
        return false;
      }
      return true;
    } catch (err) {
      console.error('[Pinecone Client] Upsert error:', err);
      return false;
    }
  }

  async query(
    tenantId: string,
    vector: number[],
    topK: number,
    filter: { policyCatalogId?: string; policyId?: string }
  ): Promise<PineconeQueryResult[]> {
    if (this.isMock) {
      console.log(`[Mock Pinecone] Querying namespace "${tenantId}" with filter:`, filter);
      
      // Fallback search: retrieve actual document chunks from Neon DB for local fidelity
      const db = getTenantPrisma(tenantId, 'ADMIN');
      const dbChunks = await db.policyDocumentChunk.findMany({
        where: {
          tenantId,
          ...(filter.policyCatalogId ? { policyCatalogId: filter.policyCatalogId } : {}),
          ...(filter.policyId ? { policyId: filter.policyId } : {}),
        },
      });

      // Simple mock scoring based on length or index to simulate query sorting
      return dbChunks.map((c, idx) => ({
        id: c.pineconeVectorId,
        score: 0.99 - (idx * 0.05), // Descending dummy scores
        metadata: {
          tenantId: c.tenantId,
          policyCatalogId: c.policyCatalogId || undefined,
          policyId: c.policyId || undefined,
          text: c.chunkText,
          pageNumber: c.pageNumber,
        },
      })).slice(0, topK);
    }

    try {
      let cleanHost = this.host;
      if (!cleanHost.startsWith('http://') && !cleanHost.startsWith('https://')) {
        cleanHost = `https://${cleanHost}`;
      }

      // Add strict filters for safety
      const pineconeFilter: Record<string, { $eq: string }> = {
        tenantId: { $eq: tenantId },
      };
      if (filter.policyCatalogId) {
        pineconeFilter.policyCatalogId = { $eq: filter.policyCatalogId };
      }
      if (filter.policyId) {
        pineconeFilter.policyId = { $eq: filter.policyId };
      }

      const res = await fetch(`${cleanHost}/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Api-Key': this.apiKey,
        },
        body: JSON.stringify({
          vector,
          topK,
          namespace: tenantId, // Query isolated namespace
          filter: pineconeFilter, // Defense-in-depth metadata filter
          includeMetadata: true,
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error('[Pinecone Client] Query failed:', errorText);
        return [];
      }

      const data = await res.json();
      interface MatchPayload {
        id: string;
        score?: number;
        metadata: PineconeVector['metadata'];
      }
      return (data.matches || []).map((match: MatchPayload) => ({
        id: match.id,
        score: match.score || 0,
        metadata: match.metadata,
      }));
    } catch (err) {
      console.error('[Pinecone Client] Query error:', err);
      return [];
    }
  }
}

export const pinecone = new PineconeClient();
