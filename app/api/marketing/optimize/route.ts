import { NextResponse } from 'next/server';
import { getTenantAIClient } from '@/lib/ai/client';

export async function POST(request: Request) {
  try {
    const { caption, platform, campaignType } = await request.json();

    if (!caption || typeof caption !== 'string' || !caption.trim()) {
      return NextResponse.json({ error: 'Valid caption text is required for AI optimization' }, { status: 400 });
    }

    try {
      const aiClient = await getTenantAIClient('tenant_pme_ff9xl', true);
      const response = await aiClient.generateChat([
        {
          role: 'system',
          content: 'You are a digital marketing copywriter specializing in healthcare and health insurance campaigns. Rewrite captions for maximum conversion, compliance, and engagement. Return ONLY the rewritten text with relevant emojis and disclaimers.',
        },
        {
          role: 'user',
          content: `Platform: ${platform || 'Social Media'}, Type: ${campaignType || 'ORGANIC'}\nOriginal Caption:\n"${caption}"`,
        },
      ]);

      if (response && response.trim()) {
        return NextResponse.json({ optimizedCaption: response.trim() });
      }
    } catch (aiErr) {
      console.warn('[AI Caption Optimize Fallback]:', aiErr);
    }

    const fallback = `🚀 ${caption.trim()}

✨ Key Benefits:
• Comprehensive health coverage tailored to your needs & family budget
• $0 preventive care & competitive deductible plans
• Fast 24/7 digital enrollment via WhatsApp

💬 Reply "INFO" or click the bio link to consult a licensed advisor today!
*Disclaimers apply. Plan availability varies by state. NPN #19402851.*`;

    return NextResponse.json({ optimizedCaption: fallback });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to optimize caption';
    console.error('[API /api/marketing/optimize Error]:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
