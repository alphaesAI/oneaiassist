import { NextResponse } from 'next/server';
import { EmailSuppressionService } from '@/lib/email/suppression';
import { EmailTrackingService, type DecodedTrackingData } from '@/lib/email/tracking';
import { prisma } from '@/lib/db';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderErrorPage(message: string, status = 400) {
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Invalid Unsubscribe Request</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f8fafc; color: #1e293b; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 16px; }
    .card { background: white; padding: 40px; border-radius: 16px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); max-width: 460px; width: 100%; text-align: center; border: 1px solid #e2e8f0; }
    h1 { font-size: 20px; font-weight: 700; color: #b91c1c; margin-top: 16px; margin-bottom: 8px; }
    p { font-size: 14px; color: #64748b; line-height: 1.5; margin: 0; }
    .icon { font-size: 44px; color: #ef4444; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">⚠️</div>
    <h1>Invalid Request</h1>
    <p>${escapeHtml(message)}</p>
  </div>
</body>
</html>`;
  return new NextResponse(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

function renderConfirmationPage(params: { token: string; email: string; tenantName: string }) {
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Confirm Unsubscribe</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f8fafc; color: #1e293b; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 16px; }
    .card { background: white; padding: 40px; border-radius: 16px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); max-width: 480px; width: 100%; text-align: center; border: 1px solid #e2e8f0; }
    h1 { font-size: 20px; font-weight: 700; color: #0f172a; margin-top: 16px; margin-bottom: 8px; }
    p { font-size: 14px; color: #64748b; line-height: 1.5; margin-bottom: 24px; }
    .btn { display: inline-block; background: #dc2626; color: white; border: none; padding: 12px 28px; font-size: 14px; font-weight: 600; border-radius: 8px; cursor: pointer; text-decoration: none; transition: background 0.2s; }
    .btn:hover { background: #b91c1c; }
    .icon { font-size: 44px; color: #64748b; }
    .email-badge { background: #f1f5f9; padding: 4px 8px; border-radius: 6px; font-family: monospace; font-size: 13px; color: #0f172a; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">✉️</div>
    <h1>Confirm Unsubscribe</h1>
    <p>Are you sure you want to unsubscribe <span class="email-badge">${escapeHtml(params.email)}</span> from marketing communications sent by <strong>${escapeHtml(params.tenantName)}</strong>?</p>
    <form method="POST" action="/api/channels/email/unsubscribe">
      <input type="hidden" name="token" value="${escapeHtml(params.token)}" />
      <button type="submit" class="btn">Confirm Unsubscribe</button>
    </form>
  </div>
</body>
</html>`;
  return new NextResponse(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

function renderSuccessPage(email: string) {
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Unsubscribed Successfully</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f8fafc; color: #1e293b; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 16px; }
    .card { background: white; padding: 40px; border-radius: 16px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); max-width: 460px; width: 100%; text-align: center; border: 1px solid #e2e8f0; }
    h1 { font-size: 20px; font-weight: 700; color: #0f172a; margin-top: 16px; margin-bottom: 8px; }
    p { font-size: 14px; color: #64748b; line-height: 1.5; margin: 0; }
    .icon { font-size: 48px; color: #10b981; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">✓</div>
    <h1>You have been unsubscribed</h1>
    <p>The email address <strong>${escapeHtml(email)}</strong> has been removed from marketing communications immediately.</p>
  </div>
</body>
</html>`;
  return new NextResponse(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

/**
 * Resolves the address a verified unsubscribe token refers to.
 */
async function resolveRecipient(data: DecodedTrackingData): Promise<string | undefined> {
  if (data.email) return data.email.trim().toLowerCase();
  if (!data.customerId) return undefined;
  const customer = await prisma.customer.findFirst({
    where: { id: data.customerId, tenantId: data.tenantId },
    select: { email: true },
  });
  return customer?.email?.trim().toLowerCase() || undefined;
}

/**
 * Unsubscribe endpoint (SEC-18, SEC-19, RFC 8058).
 * GET shows a confirmation page and changes nothing, so link scanners and mail
 * pre-fetchers cannot unsubscribe someone by accident.
 * POST performs the unsubscribe. It serves both the confirmation form and the
 * one-click POST that mail clients send to the List-Unsubscribe URL.
 */
export async function GET(req: Request) {
  try {
    const token = new URL(req.url).searchParams.get('token');
    if (!token) {
      return renderErrorPage('This unsubscribe link is incomplete.');
    }

    const decoded = EmailTrackingService.decodeTrackingPayload(token, 'unsub');
    if (!decoded.valid || !decoded.data) {
      return renderErrorPage('This unsubscribe link is not valid.', 403);
    }

    const resolvedEmail = await resolveRecipient(decoded.data);
    if (!resolvedEmail) {
      return renderErrorPage('We could not find the address for this unsubscribe link.', 400);
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: decoded.data.tenantId },
      select: { name: true },
    });

    return renderConfirmationPage({
      token,
      email: resolvedEmail,
      tenantName: tenant?.name || 'this sender',
    });
  } catch (err: unknown) {
    console.error('[Unsubscribe GET] Error:', err);
    return renderErrorPage('Something went wrong. Please try again later.', 500);
  }
}

export async function POST(req: Request) {
  const contentType = req.headers.get('content-type') || '';
  const wantsJson = contentType.includes('application/json');
  const fail = (message: string, status: number) =>
    wantsJson ? NextResponse.json({ error: message }, { status }) : renderErrorPage(message, status);

  try {
    // One-click requests carry the token in the URL; the confirmation form carries it in the body.
    let token = new URL(req.url).searchParams.get('token');

    if (wantsJson) {
      const body = await req.json().catch(() => ({}));
      if (typeof body?.token === 'string') token = body.token;
    } else if (
      contentType.includes('application/x-www-form-urlencoded') ||
      contentType.includes('multipart/form-data')
    ) {
      const formData = await req.formData().catch(() => null);
      const formToken = formData?.get('token')?.toString();
      if (formToken) token = formToken;
    }

    if (!token) return fail('Missing unsubscribe token.', 400);

    const decoded = EmailTrackingService.decodeTrackingPayload(token, 'unsub');
    if (!decoded.valid || !decoded.data) return fail('This unsubscribe link is not valid.', 403);

    const { tenantId, customerId, campaignId } = decoded.data;
    const resolvedEmail = await resolveRecipient(decoded.data);
    if (!resolvedEmail) return fail('We could not find the address for this unsubscribe link.', 400);

    // Repeating the request (a double click, a mail client retry) must not record a second unsubscribe.
    const existing = await EmailSuppressionService.isEmailSuppressed(tenantId, resolvedEmail);
    if (!existing.suppressed) {
      // recordEmailEvent adds the suppression and updates the contact's consent status.
      await EmailTrackingService.recordEmailEvent({
        tenantId,
        email: resolvedEmail,
        customerId,
        campaignId,
        eventType: 'UNSUBSCRIBE',
      });
    }

    if (wantsJson) {
      return NextResponse.json({ success: true, unsubscribed: true, email: resolvedEmail });
    }
    return renderSuccessPage(resolvedEmail);
  } catch (err: unknown) {
    console.error('[Unsubscribe POST] Error:', err);
    return fail('Something went wrong. Please try again later.', 500);
  }
}
