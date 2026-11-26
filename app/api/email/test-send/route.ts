import { NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/tenant';
import { TestSendService } from '@/lib/email/testSendService';

export async function POST(req: Request) {
  try {
    const { tenantId } = await getTenantContext();
    const body = await req.json();

    const host = req.headers.get('host') || 'localhost:3000';
    const protocol = host.startsWith('localhost') ? 'http' : 'https';
    const appOrigin = `${protocol}://${host}`;

    const result = await TestSendService.executeTestSend({
      tenantId,
      recipientEmail: body.recipientEmail,
      subject: body.subject,
      htmlBody: body.htmlBody,
      previewText: body.previewText,
      templateId: body.templateId,
      appOrigin,
    });

    if (!result.success) {
      return NextResponse.json(result, { status: result.httpStatus });
    }

    return NextResponse.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
