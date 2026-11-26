import { NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/tenant';
import { getTenantPrisma } from '@/lib/db';
import { MAX_CSV_IMPORT_ROWS, parseCsv } from '@/lib/contacts/csvImport';

export async function GET() {
  try {
    const { tenantId, role } = await getTenantContext();
    const db = getTenantPrisma(tenantId, role);

    const jobs = await db.contactImportJob.findMany({
      where: { tenantId },
      select: {
        id: true,
        fileName: true,
        listId: true,
        consentSource: true,
        status: true,
        totalRows: true,
        importedCount: true,
        updatedCount: true,
        skippedCount: true,
        lastError: true,
        createdAt: true,
        completedAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return NextResponse.json({ jobs });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to list imports' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { tenantId, role } = await getTenantContext();
    const db = getTenantPrisma(tenantId, role);

    const contentType = req.headers.get('content-type') || '';
    let fileName = 'upload.csv';
    let csvText = '';
    let listId: string | null = null;
    let consentSource: string | null = null;
    let consentProof: string | null = null;

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file');
      if (!file || !(file instanceof File)) {
        return NextResponse.json({ error: 'CSV file is required (field name: "file").' }, { status: 400 });
      }
      fileName = file.name || 'upload.csv';
      csvText = await file.text();
      const rawListId = formData.get('listId');
      const rawSource = formData.get('consentSource');
      const rawProof = formData.get('consentProof');
      listId = typeof rawListId === 'string' && rawListId.trim() ? rawListId.trim() : null;
      consentSource = typeof rawSource === 'string' && rawSource.trim() ? rawSource.trim() : null;
      consentProof = typeof rawProof === 'string' && rawProof.trim() ? rawProof.trim() : null;
    } else {
      const body = await req.json();
      if (typeof body.csv === 'string') {
        csvText = body.csv;
        fileName = typeof body.fileName === 'string' ? body.fileName : 'upload.csv';
      } else if (Array.isArray(body.rows)) {
        // Backward-compatible conversion if JSON rows are posted
        const keys = Array.from(new Set(body.rows.flatMap((r: Record<string, unknown>) => Object.keys(r || {})))) as string[];
        const headerLine = keys.join(',');
        const dataLines = body.rows.map((r: Record<string, unknown>) =>
          keys.map((k) => `"${String(r?.[k] ?? '').replace(/"/g, '""')}"`).join(',')
        );
        csvText = [headerLine, ...dataLines].join('\n');
      }
      listId = typeof body.listId === 'string' && body.listId.trim() ? body.listId.trim() : null;
      consentSource = typeof body.consentSource === 'string' && body.consentSource.trim() ? body.consentSource.trim() : null;
      consentProof = typeof body.consentProof === 'string' && body.consentProof.trim() ? body.consentProof.trim() : null;
    }

    if (!csvText.trim()) {
      return NextResponse.json({ error: 'CSV file is empty.' }, { status: 400 });
    }

    const { rows } = parseCsv(csvText);
    if (rows.length === 0) {
      return NextResponse.json({ error: 'CSV contains no data rows.' }, { status: 400 });
    }
    if (rows.length > MAX_CSV_IMPORT_ROWS) {
      return NextResponse.json(
        { error: `CSV exceeds maximum limit of ${MAX_CSV_IMPORT_ROWS} rows (got ${rows.length}).` },
        { status: 400 }
      );
    }

    if (listId) {
      const list = await db.contactList.findFirst({ where: { id: listId, tenantId }, select: { id: true } });
      if (!list) {
        return NextResponse.json({ error: 'Target contact list not found.' }, { status: 404 });
      }
    }

    const job = await db.contactImportJob.create({
      data: {
        tenantId,
        listId,
        fileName,
        csvContent: csvText,
        consentSource,
        consentProof,
        status: 'PENDING',
        totalRows: rows.length,
      },
      select: {
        id: true,
        fileName: true,
        listId: true,
        consentSource: true,
        status: true,
        totalRows: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ jobId: job.id, ...job }, { status: 202 });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Import failed' }, { status: 500 });
  }
}
