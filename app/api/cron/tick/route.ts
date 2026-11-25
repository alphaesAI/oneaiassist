import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { tick as tickSocialPublisher } from '@/lib/marketing/publisher';
import { dispatchEmailCampaign } from '@/lib/email/dispatchCampaign';

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const authHeader = req.headers.get('authorization');
    const urlSecret = new URL(req.url).searchParams.get('secret');
    if (authHeader !== `Bearer ${secret}` && urlSecret !== secret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const now = new Date();
  const appOrigin =
    process.env.NEXTAUTH_URL ||
    `${req.headers.get('x-forwarded-proto') || 'http'}://${req.headers.get('host') || 'localhost:3000'}`;

  // 1. Process due scheduled Social Marketing posts
  const socialResult = await tickSocialPublisher();

  // 2. Claim & dispatch due scheduled Email Broadcast campaigns
  const dueCampaigns = await prisma.broadcastCampaign.findMany({
    where: {
      channel: 'EMAIL',
      status: 'QUEUED',
      scheduledAt: { lte: now },
    },
    take: 5,
    select: { id: true, tenantId: true },
  });

  const emailResults: Array<{ id: string; delivered: number; failed: number }> = [];
  for (const camp of dueCampaigns) {
    const { count } = await prisma.broadcastCampaign.updateMany({
      where: { id: camp.id, status: 'QUEUED' },
      data: { status: 'SENDING' },
    });
    if (count === 1) {
      const res = await dispatchEmailCampaign({
        campaignId: camp.id,
        tenantId: camp.tenantId,
        appOrigin,
      });
      emailResults.push({ id: camp.id, ...res });
    }
  }

  return NextResponse.json({
    ok: true,
    social: socialResult,
    emailCampaignsProcessed: emailResults.length,
    emailResults,
  });
}

export async function GET(req: Request) {
  return POST(req);
}
