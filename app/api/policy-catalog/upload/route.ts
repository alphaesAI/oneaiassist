import { NextResponse } from 'next/server';
import { getTenantPrisma } from '@/lib/db';
import { getTenantContext } from '@/lib/tenant';
import { processAndIndexPolicy } from '@/lib/rag';

export async function POST(req: Request) {
  try {
    const { tenantId, role } = await getTenantContext();
    if (role !== 'ADMIN' && role !== 'PLATFORM_OWNER') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const formData = await req.formData();
    const policyCatalogId = formData.get('id') as string;
    const file = formData.get('file') as File;

    if (!policyCatalogId || !file) {
      return NextResponse.json({ error: 'policyCatalogId and file are required' }, { status: 400 });
    }

    const db = getTenantPrisma(tenantId, 'ADMIN');

    // Verify catalog entry exists
    const catalogItem = await db.policyCatalogItem.findUnique({
      where: { id: policyCatalogId },
    });

    if (!catalogItem) {
      return NextResponse.json({ error: 'Policy Catalog entry not found.' }, { status: 404 });
    }

    // Extract file bytes into buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Call RAG PDF indexing pipeline
    console.log(`[RAG Upload] Indexing document for policy catalog ID ${policyCatalogId}...`);
    const indexResult = await processAndIndexPolicy(tenantId, buffer, {
      policyCatalogId,
    });

    // Update Catalog entry with generated AI summary and fake/real PDF URL path
    const updatedCatalog = await db.policyCatalogItem.update({
      where: { id: policyCatalogId },
      data: {
        extractedSummary: indexResult.extractedSummary,
        pdfUrl: `/uploads/${tenantId}/${file.name}`,
      },
    });

    return NextResponse.json({
      success: true,
      extractedSummary: indexResult.extractedSummary,
      chunkCount: indexResult.chunkCount,
      policy: updatedCatalog,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Upload and index failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
