import { NextResponse } from 'next/server';
import { EmailTrackingService } from '@/lib/email/tracking';

// Transparent 1x1 GIF tracking pixel bytes
const TRANSPARENT_GIF_BUFFER = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

const RESPONSE_HEADERS = {
  'Content-Type': 'image/gif',
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
  Pragma: 'no-cache',
  Expires: '0',
};

function pixel() {
  return new NextResponse(TRANSPARENT_GIF_BUFFER, { status: 200, headers: RESPONSE_HEADERS });
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const decoded = EmailTrackingService.decodeTrackingPayload(searchParams.get('token'), 'open');

    if (decoded.valid && decoded.data) {
      const { tenantId, campaignId, customerId, email } = decoded.data;

      // Recorded in the background so the image is served immediately
      EmailTrackingService.recordEmailEvent({
        tenantId,
        email: email || '',
        eventType: 'OPEN',
        customerId,
        campaignId,
        ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || undefined,
        userAgent: req.headers.get('user-agent') || undefined,
      }).catch((err) => console.error('[Tracking Open] Event log error:', err));

      if (customerId) {
        import('@/lib/email/journeyEngine')
          .then(({ CrossChannelJourneyEngine }) =>
            CrossChannelJourneyEngine.handleTrigger(tenantId, 'EMAIL_OPENED', { customerId, campaignId })
          )
          .catch((err) => console.error('[Journey Trigger] EMAIL_OPENED error:', err));
      }
    }
  } catch (err) {
    console.error('[Tracking Open] Error:', err);
  }

  // Always answer with the image so a mail client never shows a broken picture
  return pixel();
}
