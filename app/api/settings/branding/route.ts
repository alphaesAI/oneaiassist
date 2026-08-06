import { NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/tenant';
import { prisma, getTenantPrisma } from '@/lib/db';

export async function GET() {
  try {
    const context = await getTenantContext();
    const { tenantId, role } = context;
    const targetTenant = (tenantId && tenantId !== '' && tenantId !== 'GLOBAL') ? tenantId : 'tenant_pme_ff9xl';
    const targetRole = role || 'ADMIN';

    const tenant = await prisma.tenant.findUnique({
      where: { id: targetTenant },
      select: {
        id: true,
        name: true,
        logoUrl: true,
        primaryColor: true,
        heroTagline: true,
        heroDescription: true,
      },
    });

    return NextResponse.json({
      name: tenant?.name || 'Prime Marketing Experts',
      logoUrl: tenant?.logoUrl || '/OneAILogo.png',
      primaryColor: tenant?.primaryColor || '#1B4B91',
      timezone: 'America/New_York',
      businessHours: {
        mon: { open: '09:00', close: '18:00', enabled: true },
        tue: { open: '09:00', close: '18:00', enabled: true },
        wed: { open: '09:00', close: '18:00', enabled: true },
        thu: { open: '09:00', close: '18:00', enabled: true },
        fri: { open: '09:00', close: '18:00', enabled: true },
        sat: { open: '10:00', close: '16:00', enabled: false },
        sun: { open: '10:00', close: '16:00', enabled: false },
      },
      outOfOfficeEnabled: true,
      outOfOfficeGreeting: 'Thank you for reaching out to Prime Marketing Experts. Our office is currently closed. An advisor will follow up with you on the next business day.',
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to fetch branding' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const context = await getTenantContext();
    const { tenantId, role, userId } = context;
    const targetTenant = (tenantId && tenantId !== '' && tenantId !== 'GLOBAL') ? tenantId : 'tenant_pme_ff9xl';

    if (role !== 'ADMIN' && role !== 'PLATFORM_OWNER') {
      return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const body = await req.json();
    const { name, logoUrl, primaryColor } = body;

    const updated = await prisma.tenant.update({
      where: { id: targetTenant },
      data: {
        ...(name && { name }),
        ...(logoUrl && { logoUrl }),
        ...(primaryColor && { primaryColor }),
      },
    });

    const targetRole = role || 'ADMIN';
    const db = getTenantPrisma(targetTenant, targetRole);
    if (userId) {
      await db.auditLog.create({
        data: {
          tenantId: targetTenant,
          userId,
          action: 'UPDATE_BRANDING_SETTINGS',
          metadata: { name, primaryColor },
        },
      }).catch(() => {});
    }

    return NextResponse.json({ success: true, tenant: updated });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to update branding settings' }, { status: 500 });
  }
}
