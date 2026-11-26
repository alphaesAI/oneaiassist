import { NextResponse } from 'next/server';
import { EmailTrackingService } from '@/lib/email/tracking';

function isValidRedirectUrl(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const decoded = EmailTrackingService.decodeTrackingPayload(searchParams.get('token'), 'click');

    // The destination comes only from a token we signed, so this cannot be used as an open redirect.
    if (!decoded.valid || !decoded.data?.targetUrl || !isValidRedirectUrl(decoded.data.targetUrl)) {
      return NextResponse.redirect(new URL('/', req.url));
    }

    const { tenantId, campaignId, customerId, email, targetUrl } = decoded.data;

    // Recorded in the background so the redirect is not delayed
    EmailTrackingService.recordEmailEvent({
      tenantId,
      email: email || '',
      eventType: 'CLICK',
      customerId,
      campaignId,
      url: targetUrl,
      ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || undefined,
      userAgent: req.headers.get('user-agent') || undefined,
    }).catch((err) => console.error('[Tracking Click] Event log error:', err));

    if (customerId) {
      import('@/lib/email/journeyEngine').then(({ CrossChannelJourneyEngine }) => {
        CrossChannelJourneyEngine.handleTrigger(tenantId, 'EMAIL_LINK_CLICKED', {
          customerId,
          campaignId,
          url: targetUrl,
        }).catch((err) => console.error('[Journey Trigger] EMAIL_LINK_CLICKED error:', err));
      }).catch(() => {});
    }

    return NextResponse.redirect(targetUrl);
  } catch (err) {
    console.error('[Tracking Click] Error:', err);
    return NextResponse.redirect(new URL('/', req.url));
  }
}
