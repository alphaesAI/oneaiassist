import { prisma } from '../../lib/db';
import crypto from 'crypto';

export interface EnqueueInboundParams {
  tenantId: string;
  wamId: string;
  senderPhone: string;
  recipientId?: string;
  payload?: any;
}

export interface EnqueueResult {
  accepted: boolean;
  jobId?: string;
  isDuplicate: boolean;
}

/**
 * Atomic deduplicating ingestion service.
 * Enforces PostgreSQL DB-level unique constraint (tenantId, wamId) via ON CONFLICT DO NOTHING.
 * Returns accepted: true if a new job was enqueued, or accepted: false, isDuplicate: true if already received.
 */
export async function enqueueInboundJob(params: {
  tenantId: string;
  wamId: string;
  senderPhone: string;
  recipientId?: string;
  payload?: any;
}): Promise<EnqueueResult> {
  const { tenantId, wamId, senderPhone, recipientId, payload } = params;

  if (!tenantId || !wamId) {
    throw new Error('tenantId and wamId are required for atomic job enqueueing');
  }

  const newId = 'job_' + crypto.randomUUID().replace(/-/g, '');
  const payloadJson = payload ? JSON.stringify(payload) : null;

  try {
    const rows: any[] = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.current_tenant_id', $1, true), set_config('app.current_user_role', 'ADMIN', true);`,
        tenantId
      );
      return (await tx.$queryRawUnsafe(
        `
        INSERT INTO "InboundMessageJob" (
          "id", "tenantId", "wamId", "senderPhone", "recipientId", "payload", "status", "attempts", "createdAt", "updatedAt"
        ) VALUES (
          $1, $2, $3, $4, $5, $6::jsonb, 'RECEIVED', 0, NOW(), NOW()
        )
        ON CONFLICT ("tenantId", "wamId") DO NOTHING
        RETURNING "id";
        `,
        newId,
        tenantId,
        wamId,
        senderPhone || null,
        recipientId || null,
        payloadJson
      )) as any[];
    });

    if (rows && rows.length > 0) {
      return {
        accepted: true,
        jobId: rows[0].id,
        isDuplicate: false,
      };
    } else {
      // 0 rows returned indicates ON CONFLICT DO NOTHING triggered (atomic duplicate)
      return {
        accepted: false,
        isDuplicate: true,
      };
    }
  } catch (err: any) {
    // If unique constraint violation error 23505 is caught as fallback
    if (err?.code === 'P2002' || err?.message?.includes('23505') || err?.message?.includes('unique constraint')) {
      return {
        accepted: false,
        isDuplicate: true,
      };
    }
    console.error(`[IngressService] Failed to enqueue job for wamId ${wamId}:`, err);
    throw err;
  }
}
