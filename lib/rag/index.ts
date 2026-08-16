/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires */
import { getTenantPrisma } from '../db';
import { getTenantAIClient, getEmbeddingClient } from '../ai/client';
import { pinecone } from './pinecone';

export interface IndexResult {
  extractedSummary: string;
  chunkCount: number;
}

/**
 * Parses a policy PDF, extracts text, chunks it, generates embeddings,
 * upserts chunks to Pinecone (isolated by tenantId namespace) and writes database chunk rows.
 */
export async function processAndIndexPolicy(
  tenantId: string,
  pdfBuffer: Buffer,
  target: { policyCatalogId?: string; policyId?: string }
): Promise<IndexResult> {
  const db = getTenantPrisma(tenantId, 'ADMIN');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pdf = require('pdf-parse');

  // 1. Extract raw text from PDF
  console.log('[RAG Index] Parsing PDF bytes...');
  const parseResult = await pdf(pdfBuffer);
  const fullText = parseResult.text || '';
  console.log(`[RAG Index] Extracted ${fullText.length} characters of raw text.`);

  // 2. Generate a short plain-language summary of the policy
  console.log('[RAG Index] Generating plain-language AI summary...');
  const aiClient = await getTenantAIClient(tenantId, true);
  const previewText = fullText.slice(0, 6000); // Send first 6k chars for token safety

  const prompt = `You are an expert insurance assistant.
Generate a short, plain-language summary explaining the primary coverage benefits, limits, key exclusions, and premiums.
Keep it warm, readable, and under 200 words. Do not use placeholders.

Document content:
${previewText}`;

  const summary = await aiClient.generateChat([
    { role: 'user', content: prompt }
  ]);

  // 3. Chunk the extracted text
  const chunkSize = 1000;
  const overlap = 200;
  const chunks: string[] = [];

  let start = 0;
  while (start < fullText.length) {
    const end = Math.min(start + chunkSize, fullText.length);
    chunks.push(fullText.slice(start, end));
    if (end === fullText.length) break;
    start += (chunkSize - overlap);
  }

  console.log(`[RAG Index] Generated ${chunks.length} text chunks for embedding.`);

  // 4. Generate embeddings and upload to Pinecone + DB
  const embedder = await getEmbeddingClient(tenantId);
  const pineconeVectors: {
    id: string;
    values: number[];
    metadata: {
      tenantId: string;
      policyCatalogId?: string;
      policyId?: string;
      text: string;
      pageNumber: number;
    };
  }[] = [];

  const dbChunksData: {
    tenantId: string;
    policyCatalogId: string | null;
    policyId: string | null;
    chunkText: string;
    pageNumber: number;
    pineconeVectorId: string;
  }[] = [];

  for (let idx = 0; idx < chunks.length; idx++) {
    const chunkText = chunks[idx];
    const vectorId = `${target.policyCatalogId || target.policyId || 'policy'}-chunk-${Date.now()}-${idx}`;
    const pageNumber = Math.floor(start / 3000) + 1; // Basic page-number heuristic estimator

    // Generate embedding vector
    const embedding = await embedder.getEmbedding(chunkText);

    // Pinecone payload
    pineconeVectors.push({
      id: vectorId,
      values: embedding,
      metadata: {
        tenantId,
        policyCatalogId: target.policyCatalogId || undefined,
        policyId: target.policyId || undefined,
        text: chunkText,
        pageNumber,
      },
    });

    // DB payload
    dbChunksData.push({
      tenantId,
      policyCatalogId: target.policyCatalogId || null,
      policyId: target.policyId || null,
      chunkText,
      pageNumber,
      pineconeVectorId: vectorId,
    });
  }

  // 5. Upsert to Pinecone (Namespace is tenantId)
  console.log('[RAG Index] Upserting vectors to Pinecone...');
  const pineconeSuccess = await pinecone.upsert(tenantId, pineconeVectors);
  if (!pineconeSuccess) {
    console.warn('[RAG Index] Warning: Pinecone vector upsert failed. Continuing with database storage.');
  }

  // 6. Write chunks to Database (running inside RLS client)
  console.log('[RAG Index] Saving chunk rows to Database...');
  await db.$transaction(async (tx) => {
    // Clear out any old chunks for this policy before saving new ones (re-indexing protection)
    if (target.policyCatalogId) {
      await tx.policyDocumentChunk.deleteMany({
        where: { policyCatalogId: target.policyCatalogId },
      });
    } else if (target.policyId) {
      await tx.policyDocumentChunk.deleteMany({
        where: { policyId: target.policyId },
      });
    }

    await tx.policyDocumentChunk.createMany({
      data: dbChunksData,
    });
  });

  console.log('✅ RAG Indexing complete.');
  return {
    extractedSummary: summary,
    chunkCount: chunks.length,
  };
}
