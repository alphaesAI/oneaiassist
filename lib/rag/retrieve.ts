import { getEmbeddingClient } from '../ai/client';
import { pinecone } from './pinecone';

export interface RetrievalResult {
  text: string;
  pageNumber: number;
  score: number;
}

/**
 * Searches Pinecone scoped to that tenant and policy, returning the top matching chunks.
 */
export async function retrieve(
  tenantId: string,
  filter: { policyCatalogId?: string; policyId?: string },
  query: string,
  topK: number = 3
): Promise<RetrievalResult[]> {
  if (!query.trim()) return [];

  try {
    // 1. Embed query text
    const embedder = await getEmbeddingClient(tenantId);
    const vector = await embedder.getEmbedding(query);

    // 2. Query Pinecone
    const matches = await pinecone.query(tenantId, vector, topK, filter);

    // 3. Map to clean result format
    return matches.map((m) => ({
      text: m.metadata.text || '',
      pageNumber: m.metadata.pageNumber || 1,
      score: m.score,
    }));
  } catch (err) {
    console.error('[RAG Retrieve] Failed to execute retrieval query:', err);
    return [];
  }
}
