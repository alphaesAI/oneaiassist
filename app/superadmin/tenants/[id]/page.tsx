import React from 'react';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { redirect, notFound } from 'next/navigation';
import TenantDetailClient from './tenant-detail-client';

export const revalidate = 0;
export const dynamic = 'force-dynamic';

export default async function TenantDetailPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);

  // Security check: must be PLATFORM_OWNER
  if (!session || session.user.role !== 'PLATFORM_OWNER') {
    redirect('/dashboard');
  }

  // Fetch tenant details (Tenant table has no RLS)
  const tenant = await prisma.tenant.findUnique({
    where: { id: params.id },
  });

  if (!tenant) {
    notFound();
  }

  // Fetch dynamic counts (RLS Bypassed)
  const stats = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SELECT set_config('app.current_user_role', 'PLATFORM_OWNER', true);`);
    
    const messageCount = await tx.message.count({
      where: { tenantId: params.id }
    });

    const leadCount = await tx.lead.count({
      where: { tenantId: params.id }
    });

    const conversations = await tx.conversation.count({
      where: { tenantId: params.id }
    });

    const whatsAppNumber = await tx.whatsAppNumber.findFirst({
      where: { tenantId: params.id }
    });

    const auditLogs = await tx.auditLog.findMany({
      where: { tenantId: params.id },
      orderBy: { createdAt: 'desc' },
      take: 15,
      include: {
        user: {
          select: { email: true }
        }
      }
    });

    const announcements = await tx.tenantAnnouncement.findMany({
      where: { tenantId: params.id },
      orderBy: { createdAt: 'desc' },
      take: 5
    });

    return {
      messageCount,
      leadCount,
      conversations,
      whatsAppNumber: whatsAppNumber ? {
        phoneNumber: whatsAppNumber.phoneNumber,
        status: whatsAppNumber.status,
        lastConnectedAt: whatsAppNumber.lastConnectedAt
      } : null,
      auditLogs: auditLogs.map(log => ({
        id: log.id,
        action: log.action,
        userEmail: log.user.email,
        createdAt: log.createdAt,
        metadata: log.metadata
      })),
      announcements: announcements.map(ann => ({
        id: ann.id,
        message: ann.message,
        createdAt: ann.createdAt
      }))
    };
  });

  return (
    <TenantDetailClient 
      tenant={{
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        status: tenant.status,
        subscriptionPlan: tenant.subscriptionPlan,
        subscriptionStatus: tenant.subscriptionStatus,
        createdAt: tenant.createdAt
      }}
      stats={stats}
    />
  );
}
