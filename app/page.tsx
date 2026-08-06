import React from 'react';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import LandingPageClient from './landing-page-client';

async function checkDatabaseConnection() {
  try {
    // Run a count query to verify database connectivity
    await prisma.tenant.count();
    return { connected: true, error: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to connect to the database.';
    return { connected: false, error: message };
  }
}

export default async function Home() {
  const session = await getServerSession(authOptions);
  const dbStatus = await checkDatabaseConnection();

  return (
    <LandingPageClient 
      session={session} 
      dbConnected={dbStatus.connected} 
      dbError={dbStatus.error} 
    />
  );
}
