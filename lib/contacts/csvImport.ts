import { prisma } from '@/lib/db';
import { normalizePhoneNumber } from '@/whatsapp-engine/agents/IdentityResolver';

export const MAX_CSV_IMPORT_ROWS = Number(process.env.MAX_CSV_IMPORT_ROWS || 10000);
const CHUNK_SIZE = 500;

export const CONTACT_PUBLIC_SELECT = {
  id: true,
  tenantId: true,
  displayName: true,
  primaryPhone: true,
  email: true,
  tags: true,
  location: true,
  otpVerified: true,
  optedIn: true,
  optedInAt: true,
  optedOutAt: true,
  emailConsentStatus: true,
  emailConsentSource: true,
  emailConsentTimestamp: true,
  emailConsentProof: true,
  customFields: true,
  createdAt: true,
} as const;

export function parseCsv(text: string): { headers: string[]; rows: Array<Record<string, string>> } {
  const lines: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field.trim());
      field = '';
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field.trim());
      if (row.some((cell) => cell.length > 0)) lines.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field.trim());
    if (row.some((cell) => cell.length > 0)) lines.push(row);
  }

  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = lines[0].map((h) => h.trim().toLowerCase());
  const rows = lines.slice(1).map((cells) => {
    const record: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      if (headers[c]) record[headers[c]] = cells[c] ?? '';
    }
    return record;
  });
  return { headers, rows };
}

/**
 * Claims and processes one PENDING ContactImportJob using bare prisma client.
 */
export async function processNextImportJob(): Promise<{ jobId: string; status: string } | null> {
  const candidate = await prisma.contactImportJob.findFirst({
    where: { status: 'PENDING' },
    orderBy: { createdAt: 'asc' },
    select: { id: true, tenantId: true },
  });
  if (!candidate) return null;

  const { count } = await prisma.contactImportJob.updateMany({
    where: { id: candidate.id, tenantId: candidate.tenantId, status: 'PENDING' },
    data: { status: 'PROCESSING' },
  });
  if (count !== 1) return null;

  return processContactImportJob(candidate.id, candidate.tenantId);
}

export async function processContactImportJob(
  jobId: string,
  tenantId: string
): Promise<{ jobId: string; status: string }> {
  const job = await prisma.contactImportJob.findFirst({
    where: { id: jobId, tenantId },
  });
  if (!job) throw new Error(`Import job not found: ${jobId}`);

  try {
    const { headers, rows } = parseCsv(job.csvContent);
    if (rows.length > MAX_CSV_IMPORT_ROWS) {
      throw new Error(`CSV exceeds maximum row limit of ${MAX_CSV_IMPORT_ROWS}`);
    }

    const standardKeys = new Set([
      'name',
      'displayname',
      'fullname',
      'first_name',
      'last_name',
      'email',
      'mail',
      'phone',
      'primaryphone',
      'mobile',
      'tags',
      'location',
    ]);
    const customKeys = headers.filter((h) => h && !standardKeys.has(h));

    const hasExplicitConsent = Boolean(job.consentSource && job.consentSource.trim().length > 0);
    const consentSource = hasExplicitConsent ? job.consentSource!.trim() : null;
    const consentProof = hasExplicitConsent && job.consentProof ? job.consentProof.trim() : null;
    const now = new Date();

    let importedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    const errors: Array<{ row: number; error: string }> = [];
    const seenEmailsInCsv = new Set<string>();
    const seenPhonesInCsv = new Set<string>();

    // Verify list belongs to tenant if provided
    let validListId: string | null = null;
    if (job.listId) {
      const list = await prisma.contactList.findFirst({
        where: { id: job.listId, tenantId },
        select: { id: true },
      });
      if (list) validListId = list.id;
    }

    for (let start = 0; start < rows.length; start += CHUNK_SIZE) {
      const chunk = rows.slice(start, start + CHUNK_SIZE);

      interface ParsedRow {
        rowIndex: number;
        email: string | null;
        phone: string;
        displayName: string;
        tags: string[];
        location: string | null;
        customFields: Record<string, string>;
      }

      const validChunk: ParsedRow[] = [];
      for (let i = 0; i < chunk.length; i++) {
        const r = chunk[i];
        const rowNum = start + i + 2; // +1 header, +1 1-indexed
        const emailRaw = (r.email || r.mail || '').trim().toLowerCase();
        const email = emailRaw && emailRaw.includes('@') ? emailRaw : null;
        const phoneRaw = (r.phone || r.primaryphone || r.mobile || '').trim();

        if (!email && !phoneRaw) {
          skippedCount++;
          if (errors.length < 50) errors.push({ row: rowNum, error: 'Missing email and phone' });
          continue;
        }

        if (email) {
          if (seenEmailsInCsv.has(email)) {
            skippedCount++;
            continue;
          }
          seenEmailsInCsv.add(email);
        } else if (phoneRaw) {
          if (seenPhonesInCsv.has(phoneRaw)) {
            skippedCount++;
            continue;
          }
          seenPhonesInCsv.add(phoneRaw);
        }

        const fullName =
          r.name ||
          r.displayname ||
          r.fullname ||
          [r.first_name, r.last_name].filter(Boolean).join(' ').trim();
        const displayName = fullName || (email ? email.split('@')[0] : `Contact ${phoneRaw.slice(-4)}`);
        const phone = phoneRaw
          ? normalizePhoneNumber(phoneRaw)
          : `imp_${job.id.slice(-6)}_${start + i}`;
        const tags = r.tags
          ? r.tags
              .split(/[;|,]/)
              .map((t) => t.trim())
              .filter(Boolean)
          : [];
        const customFields: Record<string, string> = {};
        for (const ck of customKeys) {
          if (r[ck] !== undefined && r[ck] !== '') customFields[ck] = r[ck];
        }

        validChunk.push({
          rowIndex: rowNum,
          email,
          phone,
          displayName,
          tags,
          location: r.location || null,
          customFields,
        });
      }

      if (validChunk.length === 0) continue;

      const chunkEmails = validChunk.map((v) => v.email).filter((e): e is string => Boolean(e));
      const existingByEmail = chunkEmails.length > 0
        ? await prisma.customer.findMany({
            where: { tenantId, email: { in: chunkEmails } },
            select: {
              id: true,
              email: true,
              displayName: true,
              tags: true,
              customFields: true,
              emailConsentStatus: true,
              emailConsentSource: true,
              emailConsentTimestamp: true,
              emailConsentProof: true,
            },
          })
        : [];

      const existingMap = new Map(
        existingByEmail.filter((c) => c.email).map((c) => [c.email!.toLowerCase(), c])
      );

      const toInsert: ParsedRow[] = [];
      const toUpdate: Array<{ existing: (typeof existingByEmail)[number]; incoming: ParsedRow }> = [];

      for (const item of validChunk) {
        const match = item.email ? existingMap.get(item.email) : undefined;
        if (match) {
          toUpdate.push({ existing: match, incoming: item });
        } else {
          toInsert.push(item);
        }
      }

      if (toInsert.length > 0) {
        await prisma.customer.createMany({
          data: toInsert.map((item) => ({
            tenantId,
            displayName: item.displayName,
            primaryPhone: item.phone,
            email: item.email,
            tags: item.tags,
            location: item.location,
            customFields: item.customFields,
            optedIn: hasExplicitConsent,
            optedInAt: hasExplicitConsent ? now : null,
            emailConsentStatus: hasExplicitConsent ? 'SUBSCRIBED' : 'PENDING',
            emailConsentSource: consentSource,
            emailConsentTimestamp: hasExplicitConsent ? now : null,
            emailConsentProof: consentProof,
          })),
        });
        importedCount += toInsert.length;
      }

      for (const { existing, incoming } of toUpdate) {
        const mergedTags = Array.from(new Set([...(existing.tags || []), ...incoming.tags]));
        const existingCf =
          existing.customFields && typeof existing.customFields === 'object' && !Array.isArray(existing.customFields)
            ? (existing.customFields as Record<string, unknown>)
            : {};
        const mergedCf = { ...existingCf, ...incoming.customFields };

        // Never override UNSUBSCRIBED/BOUNCED/COMPLAINED; only upgrade PENDING if explicit consentSource provided
        const canUpgradeToSubscribed =
          hasExplicitConsent && existing.emailConsentStatus === 'PENDING';

        await prisma.customer.updateMany({
          where: { id: existing.id, tenantId },
          data: {
            displayName: existing.displayName || incoming.displayName,
            tags: mergedTags,
            customFields: mergedCf as any,
            ...(canUpgradeToSubscribed
              ? {
                  optedIn: true,
                  optedInAt: now,
                  emailConsentStatus: 'SUBSCRIBED',
                  emailConsentSource: consentSource,
                  emailConsentTimestamp: now,
                  emailConsentProof: consentProof,
                }
              : {}),
          },
        });
        updatedCount++;
      }

      if (validListId && chunkEmails.length > 0) {
        const chunkCustomerIds = await prisma.customer.findMany({
          where: { tenantId, email: { in: chunkEmails } },
          select: { id: true },
        });
        if (chunkCustomerIds.length > 0) {
          await prisma.contactListMember.createMany({
            data: chunkCustomerIds.map((c) => ({
              tenantId,
              listId: validListId!,
              customerId: c.id,
            })),
            skipDuplicates: true,
          });
        }
      }
    }

    await prisma.contactImportJob.updateMany({
      where: { id: job.id, tenantId },
      data: {
        status: 'COMPLETED',
        totalRows: rows.length,
        importedCount,
        updatedCount,
        skippedCount,
        errors: errors.length > 0 ? (errors as any) : undefined,
        csvContent: '', // free DB space after processing
        completedAt: new Date(),
      },
    });

    return { jobId: job.id, status: 'COMPLETED' };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Import failed';
    await prisma.contactImportJob.updateMany({
      where: { id: job.id, tenantId },
      data: {
        status: 'FAILED',
        lastError: msg,
        csvContent: '',
        completedAt: new Date(),
      },
    });
    return { jobId: job.id, status: 'FAILED' };
  }
}
