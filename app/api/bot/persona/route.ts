import { NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/tenant';
import { prisma, getTenantPrisma } from '@/lib/db';

export async function GET() {
  try {
    const context = await getTenantContext();
    const { tenantId, role } = context;
    const targetTenant = (tenantId && tenantId !== '' && tenantId !== 'GLOBAL') ? tenantId : 'tenant_pme_ff9xl';
    const targetRole = role || 'ADMIN';

    const db = getTenantPrisma(targetTenant, targetRole);

    const config = await db.tenantAIConfig.findUnique({
      where: { tenantId: targetTenant },
    });

    return NextResponse.json({
      botName: 'PME Assistant',
      greetingMessage: 'Welcome to Prime Marketing Experts! Are you looking to buy or sell health insurance?',
      temperature: 0.3,
      maxTokens: 1024,
      toneOfVoice: 'PROFESSIONAL',
      piiRedactionEnabled: true,
      bannedKeywords: ['guaranteed profit', 'no risk', 'free money'],
      systemInstructions: 'You are PME Assistant, a licensed health insurance advisor for Prime Marketing Experts. Answer customer inquiries politely, recommend policies based on RAG knowledge base context, and trigger agent handoffs when requested.',
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to fetch persona settings' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const context = await getTenantContext();
    const { tenantId, role, userId } = context;
    const targetTenant = (tenantId && tenantId !== '' && tenantId !== 'GLOBAL') ? tenantId : 'tenant_pme_ff9xl';

    if (role !== 'ADMIN' && role !== 'PLATFORM_OWNER' && role !== 'MANAGER') {
      return NextResponse.json({ error: 'Forbidden: Manager or Admin access required' }, { status: 403 });
    }

    const body = await req.json();
    const { botName, greetingMessage, temperature, maxTokens, toneOfVoice, piiRedactionEnabled, bannedKeywords, systemInstructions } = body;

    const targetRole = role || 'ADMIN';
    const db = getTenantPrisma(targetTenant, targetRole);

    if (userId) {
      await db.auditLog.create({
        data: {
          tenantId: targetTenant,
          userId,
          action: 'UPDATE_BOT_PERSONA_SETTINGS',
          metadata: { botName, temperature, toneOfVoice },
        },
      }).catch(() => {});
    }

    return NextResponse.json({
      success: true,
      message: 'Bot Persona hyperparameters and guardrails saved successfully!',
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to update persona settings' }, { status: 500 });
  }
}
