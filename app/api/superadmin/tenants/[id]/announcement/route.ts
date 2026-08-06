import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'PLATFORM_OWNER') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { message } = await req.json();
    if (!message || message.trim() === '') {
      return NextResponse.json({ error: 'Message content is required' }, { status: 400 });
    }

    // Add to TenantAnnouncement with RLS bypassed context
    const announcement = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SELECT set_config('app.current_user_role', 'PLATFORM_OWNER', true);`);
      return tx.tenantAnnouncement.create({
        data: {
          tenantId: params.id,
          message: message,
        },
      });
    });

    // Log the announcement in AuditLog
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SELECT set_config('app.current_user_role', 'PLATFORM_OWNER', true);`);
      await tx.auditLog.create({
        data: {
          tenantId: params.id,
          userId: session.user.id,
          action: 'SEND_ANNOUNCEMENT',
          metadata: {
            announcementId: announcement.id,
            message: message.substring(0, 100),
            timestamp: new Date().toISOString()
          }
        }
      });
    });

    return NextResponse.json({ success: true, announcement });
  } catch (error: unknown) {
    console.error('Error sending announcement:', error);
    const msg = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
