import { NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/tenant';
import { getTenantPrisma } from '@/lib/db';

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { tenantId, role } = await getTenantContext();
    const db = getTenantPrisma(tenantId, role);

    const template = await db.template.findUnique({
      where: { id: params.id },
    });

    if (!template || template.tenantId !== tenantId) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    if (template.status !== 'DRAFT' && template.status !== 'REJECTED') {
      return NextResponse.json(
        { error: `Cannot submit template in "${template.status}" state.` },
        { status: 400 }
      );
    }

    // =========================================================================
    // TODO: Meta WhatsApp Business API Integration
    // Replace stub with live Graph API call:
    //
    // const res = await fetch(`https://graph.facebook.com/v18.0/${WABA_ID}/message_templates`, {
    //   method: 'POST',
    //   headers: {
    //     'Authorization': `Bearer ${META_ACCESS_TOKEN}`,
    //     'Content-Type': 'application/json',
    //   },
    //   body: JSON.stringify({
    //     name: template.name,
    //     category: template.category,
    //     language: template.language,
    //     components: [
    //       template.headerType !== 'NONE' ? { type: 'HEADER', format: template.headerType, text: template.header } : null,
    //       { type: 'BODY', text: template.body },
    //       template.footer ? { type: 'FOOTER', text: template.footer } : null,
    //       template.ctaButtons ? { type: 'BUTTONS', buttons: template.ctaButtons } : null
    //     ].filter(Boolean),
    //   }),
    // });
    // =========================================================================

    console.log(`[META SUBMISSION STUB] Template "${template.name}" submitted for approval to Meta.`);

    const updated = await db.template.update({
      where: { id: params.id },
      data: {
        status: 'PENDING',
      },
    });

    return NextResponse.json({
      success: true,
      template: updated,
      message: 'Template submitted for approval to WhatsApp Meta services.',
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unauthorized';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
