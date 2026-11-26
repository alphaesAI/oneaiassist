import { NextResponse } from 'next/server';
import { tick as tickSocialPublisher } from '@/lib/marketing/publisher';

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const authHeader = req.headers.get('authorization');
    const urlSecret = new URL(req.url).searchParams.get('secret');
    if (authHeader !== `Bearer ${secret}` && urlSecret !== secret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  // Process due scheduled Social Marketing posts (email campaigns are handled by the worker)
  const socialResult = await tickSocialPublisher();

  return NextResponse.json({
    ok: true,
    social: socialResult,
  });
}

export async function GET(req: Request) {
  return POST(req);
}
