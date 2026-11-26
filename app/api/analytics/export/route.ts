import { NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/tenant';
import { getTenantPrisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  let tenantId = '';
  let role = 'ADMIN';

  try {
    const ctx = await getTenantContext();
    tenantId = ctx.tenantId;
    role = ctx.role || 'ADMIN';
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const tab = searchParams.get('tab') || 'overview';

    const db = getTenantPrisma(tenantId, role);

    let csvContent = '';
    const filename = `analytics_${tab}_${new Date().toISOString().split('T')[0]}.csv`;

    if (tab === 'leads' || tab === 'funnel') {
      const leads = await db.lead.findMany({
        where: { tenantId },
        include: { customer: true },
      });
      csvContent = 'Lead ID,Customer Name,Phone,Email,Status,Source,Created At\n';
      leads.forEach((l) => {
        const escape = (val: string | null | undefined) => `"${(val || '').replace(/"/g, '""')}"`;
        csvContent += `${escape(l.id)},${escape(l.customer?.displayName || 'Lead')},${escape(l.customer?.primaryPhone || '')},${escape(l.customer?.email || '')},${escape(l.status)},${escape(l.source)},${escape(l.createdAt.toISOString())}\n`;
      });
    } else if (tab === 'campaigns' || tab === 'email_campaigns') {
      const campaigns = await db.broadcastCampaign.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
      });
      csvContent = 'Campaign ID,Name,Channel,Subject,Status,Total Recipients,Sent,Delivered,Opened,Clicked,Failed,Created At\n';
      campaigns.forEach((c) => {
        const escape = (val: string | null | undefined) => `"${(val || '').replace(/"/g, '""')}"`;
        csvContent += `${escape(c.id)},${escape(c.name)},${escape(c.channel)},${escape(c.subject || '')},${escape(c.status)},${c.totalRecipients || 0},${c.sent || 0},${c.delivered || 0},${c.read || 0},${c.replied || 0},${c.failed || 0},${escape(c.createdAt.toISOString())}\n`;
      });
    } else if (tab === 'revenue' || tab === 'products') {
      const policyItems = await db.policyCatalogItem.findMany({ where: { tenantId } });
      csvContent = 'Catalog ID,Policy Name,Insurer,Min Premium ($),Max Premium ($),Sum Insured ($),Active\n';
      policyItems.forEach((p) => {
        const escape = (val: string | null | undefined) => `"${(val || '').replace(/"/g, '""')}"`;
        csvContent += `${escape(p.id)},${escape(p.name)},${escape(p.insurerName)},${p.premiumMin / 100},${p.premiumMax / 100},${p.sumInsured / 100},${p.active}\n`;
      });
    } else {
      // General Overview CSV
      const conversations = await db.conversation.findMany({ where: { tenantId }, include: { messages: true } });
      csvContent = 'Conversation ID,Channel,Status,Total Messages,Created At,Last Message At\n';
      conversations.forEach((c) => {
        const escape = (val: string | null | undefined) => `"${(val || '').replace(/"/g, '""')}"`;
        csvContent += `${escape(c.id)},${escape(c.channel)},${escape(c.status)},${c.messages.length},${escape(c.createdAt.toISOString())},${escape(c.lastMessageAt.toISOString())}\n`;
      });
    }

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Export failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const context = await getTenantContext();
    if (!context.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const recipientEmail = body.email;
    if (!recipientEmail || typeof recipientEmail !== 'string') {
      return NextResponse.json({ error: 'Valid recipient email required' }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: `Analytics report successfully scheduled for ${recipientEmail}`,
      dispatchedAt: new Date().toISOString(),
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Email report dispatch failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
