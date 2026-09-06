import { NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/tenant';
import { getTenantPrisma } from '@/lib/db';

export async function GET() {
  try {
    const { tenantId, role } = await getTenantContext();
    const db = getTenantPrisma(tenantId, role);

    const waNumber = await db.whatsAppNumber.findUnique({
      where: { tenantId },
    });

    return NextResponse.json({
      provider: waNumber?.provider || 'BAILEYS',
      metaPhoneNumberId: waNumber?.metaPhoneNumberId || '',
      metaWabaId: waNumber?.metaWabaId || '',
      metaAccessToken: waNumber?.metaAccessToken ? '••••••••••••••••' : '',
      metaVerifyToken: waNumber?.metaVerifyToken || '',
      status: waNumber?.status || 'DISCONNECTED',
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unauthorized';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { tenantId, role, userId } = await getTenantContext();
    const db = getTenantPrisma(tenantId, role);

    const body = await req.json();
    const { provider, metaPhoneNumberId, metaWabaId, metaAccessToken, metaVerifyToken } = body;

    const dataToUpdate: any = {
      provider: provider === 'META_CLOUD_API' ? 'META_CLOUD_API' : 'BAILEYS',
      status: provider === 'META_CLOUD_API' ? 'CONNECTED' : 'DISCONNECTED',
    };

    if (metaPhoneNumberId !== undefined) dataToUpdate.metaPhoneNumberId = metaPhoneNumberId;
    if (metaWabaId !== undefined) dataToUpdate.metaWabaId = metaWabaId;
    if (metaVerifyToken !== undefined) dataToUpdate.metaVerifyToken = metaVerifyToken;
    if (metaAccessToken && !metaAccessToken.includes('••••')) {
      dataToUpdate.metaAccessToken = metaAccessToken;
    }

    const updated = await db.whatsAppNumber.upsert({
      where: { tenantId },
      create: {
        tenantId,
        sessionData: 'meta_cloud_config',
        ...dataToUpdate,
      },
      update: dataToUpdate,
    });

    await db.auditLog.create({
      data: {
        userId,
        tenantId,
        action: 'WHATSAPP_PROVIDER_UPDATED',
        metadata: { provider: updated.provider, metaPhoneNumberId: updated.metaPhoneNumberId },
      },
    });

    return NextResponse.json({
      success: true,
      provider: updated.provider,
      metaPhoneNumberId: updated.metaPhoneNumberId,
      status: updated.status,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to update Meta Cloud API configuration';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
