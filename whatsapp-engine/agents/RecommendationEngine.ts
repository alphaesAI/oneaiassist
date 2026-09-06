import { getTenantPrisma, prisma } from '@/lib/db';
import { getTenantAIClient } from '@/lib/ai/client';
import { PolicyCatalogItem } from '@prisma/client';

export interface IntakeQualificationData {
  age?: number;
  state?: string;
  budgetMax?: number;
  budgetMin?: number;
  familySize?: number;
  healthConditions?: string[];
  [key: string]: any;
}

export interface RecommendationResult {
  replyText: string;
  status: 'PROPOSAL_SENT' | 'HUMAN_ESCALATED';
  recommendedPolicyIds: string[];
  candidateCount: number;
}

export class RecommendationEngine {
  /**
   * Evaluates qualification parameters and generates a strictly grounded policy recommendation.
   * Enforces 0 / 1 / >1 match branching logic.
   */
  static async generateRecommendation(params: {
    tenantId: string;
    intakeData: IntakeQualificationData;
    customerPhone: string;
    leadId?: string;
    io?: any;
  }): Promise<RecommendationResult> {
    const { tenantId, intakeData, customerPhone, leadId, io } = params;
    const db = getTenantPrisma(tenantId, 'ADMIN');

    const userState = (intakeData.state || '').toUpperCase().trim();
    const budgetMaxDollars = intakeData.budgetMax || 500;
    const budgetMaxCents = budgetMaxDollars * 100;

    // Stage 1: Deterministic SQL Candidate Filtering
    const allActivePolicies = await db.policyCatalogItem.findMany({
      where: {
        tenantId,
        active: true,
      },
    });

    // Filter by state and budget ceiling
    const candidates = allActivePolicies.filter((policy) => {
      // Check state availability (if policy.states is empty, it is national/all states)
      const matchesState =
        !userState ||
        !policy.states ||
        policy.states.length === 0 ||
        policy.states.map((s) => s.toUpperCase().trim()).includes(userState);

      // Check premium budget (policy minimum premium must fit within the user's budget max)
      const matchesBudget = policy.premiumMin <= budgetMaxCents;

      return matchesState && matchesBudget;
    });

    console.log(
      `[RecommendationEngine] Found ${candidates.length} candidate policies for state '${userState}' and budget max $${budgetMaxDollars}`
    );

    // Branch 1: Zero Matches -> Bypasses LLM, Escalates to Human Specialist
    if (candidates.length === 0) {
      const stateDisplay = userState ? `in ${userState}` : '';
      const replyText =
        `Thank you for providing your details! 📋\n\n` +
        `We currently don't have an automated off-the-shelf policy ${stateDisplay} with premiums starting under $${budgetMaxDollars}/mo. ` +
        `I have forwarded your profile to our licensed insurance specialists to check for special underwritten or subsidized plans. ` +
        `An advisor will contact you directly to help you find the best coverage.`;

      // Update lead if available
      if (leadId) {
        await this.syncLeadRecord({
          tenantId,
          leadId,
          intakeData,
          recommendedPolicyIds: [],
          status: 'QUALIFIED',
          io,
        });
      }

      return {
        replyText,
        status: 'HUMAN_ESCALATED',
        recommendedPolicyIds: [],
        candidateCount: 0,
      };
    }

    // Branch 2: Exactly 1 Match -> Format Directly (Zero LLM Latency / Hallucination)
    if (candidates.length === 1) {
      const p = candidates[0];
      const minDollars = (p.premiumMin / 100).toFixed(0);
      const maxDollars = (p.premiumMax / 100).toFixed(0);
      const sumInsuredDollars = (p.sumInsured / 100).toLocaleString('en-US');

      const replyText =
        `🎉 Great news! Based on your criteria, here is our top recommended health plan:\n\n` +
        `🏆 *${p.name}* (by ${p.insurerName})\n` +
        `• *Monthly Premium:* $${minDollars} - $${maxDollars} / mo\n` +
        `• *Max Sum Insured:* $${sumInsuredDollars}\n` +
        `• *Coverage Highlights:* ${p.extractedSummary || 'Comprehensive medical, emergency, and specialist coverage.'}\n\n` +
        `Would you like me to reserve this quote for you or connect you with an advisor to finalize your enrollment?`;

      if (leadId) {
        await this.syncLeadRecord({
          tenantId,
          leadId,
          intakeData,
          recommendedPolicyIds: [p.id],
          status: 'QUALIFIED',
          io,
        });
      }

      return {
        replyText,
        status: 'PROPOSAL_SENT',
        recommendedPolicyIds: [p.id],
        candidateCount: 1,
      };
    }

    // Branch 3: Multiple (>1) Matches -> Stage 2 Grounded LLM Ranking
    const sortedCandidates = candidates.sort((a, b) => a.premiumMin - b.premiumMin).slice(0, 3);
    const candidateWhitelist = sortedCandidates.map((c) => ({
      id: c.id,
      name: c.name,
      insurer: c.insurerName,
      monthlyPremiumMin: `$${(c.premiumMin / 100).toFixed(0)}`,
      monthlyPremiumMax: `$${(c.premiumMax / 100).toFixed(0)}`,
      sumInsured: `$${(c.sumInsured / 100).toLocaleString('en-US')}`,
      summary: c.extractedSummary,
    }));

    let replyText = '';
    try {
      const ai = await getTenantAIClient(tenantId, true);
      const prompt = `You are an expert, licensed health insurance advisor. Recommend the top matching insurance policies for this prospect based on their collected profile.

PROSPECT PROFILE:
- Age: ${intakeData.age || 'Not specified'}
- State: ${userState || 'Not specified'}
- Monthly Budget: Up to $${budgetMaxDollars}/mo
- Family Size: ${intakeData.familySize || 1}
- Conditions: ${Array.isArray(intakeData.healthConditions) ? intakeData.healthConditions.join(', ') : 'None'}

ALLOWED POLICY CANDIDATES (STRICT WHITELIST - DO NOT INVENT OR ALTER ANY POLICY NAMES, PRICES, OR CARRIERS):
${JSON.stringify(candidateWhitelist, null, 2)}

INSTRUCTIONS:
1. Present the top 2 candidate options (e.g. Option A: Best Value vs Option B: Maximum Coverage).
2. Clearly list Policy Name, Insurer, Monthly Premium Range, and Max Sum Insured.
3. Keep the tone friendly, professional, and clear for WhatsApp chat.
4. Conclude with a clear Call to Action (e.g., "Which option would you like to explore, or shall I have an agent call you to assist?").
5. DO NOT mention policies outside the provided whitelist.`;

      replyText = await ai.generateChat([
        {
          role: 'system',
          content: 'You are a professional WhatsApp health insurance assistant. Ground all recommendations strictly in the supplied policy list.',
        },
        { role: 'user', content: prompt },
      ]);
    } catch (err) {
      console.error('[RecommendationEngine] LLM generation failed, falling back to deterministic template:', err);
      // Deterministic fallback if LLM is unavailable
      const optionA = sortedCandidates[0];
      const optionB = sortedCandidates[1];
      replyText =
        `🎉 Based on your profile, here are your top 2 matched insurance plans:\n\n` +
        `1️⃣ *${optionA.name}* (Best Value - ${optionA.insurerName})\n` +
        `• Premium: $${(optionA.premiumMin / 100).toFixed(0)} - $${(optionA.premiumMax / 100).toFixed(0)} / mo\n` +
        `• Coverage: $${(optionA.sumInsured / 100).toLocaleString()}\n\n` +
        `2️⃣ *${optionB.name}* (Comprehensive - ${optionB.insurerName})\n` +
        `• Premium: $${(optionB.premiumMin / 100).toFixed(0)} - $${(optionB.premiumMax / 100).toFixed(0)} / mo\n` +
        `• Coverage: $${(optionB.sumInsured / 100).toLocaleString()}\n\n` +
        `Which option fits best for you?`;
    }

    const recommendedIds = sortedCandidates.map((c) => c.id);

    if (leadId) {
      await this.syncLeadRecord({
        tenantId,
        leadId,
        intakeData,
        recommendedPolicyIds: recommendedIds,
        status: 'QUALIFIED',
        io,
      });
    }

    return {
      replyText,
      status: 'PROPOSAL_SENT',
      recommendedPolicyIds: recommendedIds,
      candidateCount: candidates.length,
    };
  }

  private static async syncLeadRecord(params: {
    tenantId: string;
    leadId: string;
    intakeData: IntakeQualificationData;
    recommendedPolicyIds: string[];
    status: 'QUALIFIED' | 'APPLICATION_CAPTURED';
    io?: any;
  }) {
    const { tenantId, leadId, intakeData, recommendedPolicyIds, status, io } = params;

    try {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          `SELECT set_config('app.current_tenant_id', $1, true), set_config('app.current_user_role', 'ADMIN', true);`,
          tenantId
        );

        const updatedLead = await tx.lead.update({
          where: { id: leadId },
          data: {
            status,
            intakeAge: intakeData.age ? Number(intakeData.age) : undefined,
            intakeState: intakeData.state ? String(intakeData.state) : undefined,
            intakeBudgetMax: intakeData.budgetMax ? Number(intakeData.budgetMax) * 100 : undefined,
            intakeFamilySize: intakeData.familySize ? Number(intakeData.familySize) : undefined,
            intakeHealthConditions: intakeData.healthConditions || undefined,
            recommendedPolicyIds,
            intakeAnswers: intakeData as any,
          },
        });

        if (io) {
          io.to(`tenant:${tenantId}`).emit('lead_updated', {
            leadId,
            status,
            lead: updatedLead,
          });
        }
      });
    } catch (err) {
      console.error(`[RecommendationEngine] Failed to sync Lead ${leadId}:`, err);
    }
  }
}
