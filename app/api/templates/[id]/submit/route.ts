import { NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/tenant';
import { WhatsAppTemplateError, WhatsAppTemplateService } from '@/lib/whatsapp/templateService';

/** Sends a WhatsApp template to Meta for review. */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const { tenantId } = await getTenantContext();
    if (!tenantId) return NextResponse.json({ error: 'No account selected.' }, { status: 400 });

    const template = await WhatsAppTemplateService.submit(tenantId, params.id);
    return NextResponse.json({
      success: true,
      template,
      message:
        template.status === 'APPROVED'
          ? 'Meta approved the template.'
          : template.status === 'REJECTED'
          ? 'Meta rejected the template.'
          : 'Submitted to Meta. It is now waiting for review.',
    });
  } catch (err: unknown) {
    if (err instanceof WhatsAppTemplateError) {
      return NextResponse.json({ error: err.message, problems: err.problems }, { status: err.status });
    }
    const msg = err instanceof Error ? err.message : '';
    const unauthorized = msg.startsWith('Unauthorized');
    if (!unauthorized) console.error('[Template submit]', msg);
    return NextResponse.json(
      { error: unauthorized ? msg : 'The template could not be submitted.' },
      { status: unauthorized ? 401 : 500 }
    );
  }
}
