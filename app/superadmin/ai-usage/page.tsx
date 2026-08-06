import React from 'react';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import AiUsageClient from './ai-usage-client';

export const revalidate = 0;
export const dynamic = 'force-dynamic';

export default async function SuperAdminAiUsagePage() {
  const session = await getServerSession(authOptions);

  // Security gate check: platform owner only
  if (!session || session.user.role !== 'PLATFORM_OWNER') {
    redirect('/dashboard');
  }

  return <AiUsageClient userEmail={session.user.email || 'Super Admin'} />;
}
