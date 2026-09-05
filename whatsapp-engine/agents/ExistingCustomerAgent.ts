import { getTenantPrisma, prisma } from '@/lib/db';
import { retrieve } from '@/lib/rag/retrieve';
import { getTenantAIClient } from '@/lib/ai/client';
import { IInsuranceAgent, AgentContext, AgentResponse } from './types';

export class ExistingCustomerAgent implements IInsuranceAgent {
  readonly name = 'ExistingCustomerAgent' as const;

  async canHandle(context: AgentContext): Promise<boolean> {
    // Handles verified primary policyholders and family dependents
    return context.identity.type === 'PRIMARY_POLICYHOLDER' || context.identity.type === 'DEPENDENT';
  }

  async handle(context: AgentContext): Promise<AgentResponse> {
    const { tenantId, rawMessage, senderPhone, identity, conversationId, io } = context;
    const db = getTenantPrisma(tenantId, 'ADMIN');

    const isDependent = identity.type === 'DEPENDENT';
    const primaryCustomer = identity.primaryCustomer || identity.customer;
    const customerId = primaryCustomer?.id || identity.customer?.id;

    // 1. Fetch active policies linked to this primary account
    const policies = await db.policy.findMany({
      where: {
        tenantId,
        customerId,
        status: 'ACTIVE',
      },
      include: {
        policyCatalog: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const displayName = identity.displayName || 'Valued Member';
    const primaryHolderName = identity.primaryCustomer?.displayName;

    let greetingPrefix = `Hello ${displayName}! `;
    if (isDependent && primaryHolderName) {
      greetingPrefix += `(Linked Account of ${primaryHolderName}) `;
    }

    // If no active policies found in DB
    if (policies.length === 0) {
      return {
        replyText: `${greetingPrefix}We could not locate an active policy under this number. Would you like to speak with a representative or explore new coverage options?`,
        agentName: 'ExistingCustomerAgent',
        confidenceScore: 0.9,
        actionTaken: 'INFO_REPLIED',
        isComplete: false,
      };
    }

    const activePolicy = policies[0];
    const catalog = activePolicy.policyCatalog;
    const lowerMessage = (rawMessage || '').toLowerCase().trim();

    // 2. Intent Classification

    // A. Premium Amount & Due Date Intent
    if (
      lowerMessage.includes('due date') ||
      lowerMessage.includes('due') ||
      lowerMessage.includes('premium') ||
      lowerMessage.includes('billing') ||
      lowerMessage.includes('next payment') ||
      lowerMessage.includes('how much do i owe') ||
      lowerMessage.includes('pay')
    ) {
      const premiumCents = catalog?.premiumMin || 0;
      const premiumDollars = (premiumCents / 100).toFixed(2);
      
      // Calculate next billing date (1st of next month or based on effectiveDate)
      const now = new Date();
      const nextDue = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      const dueDateFormatted = nextDue.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });

      const replyText =
        `${greetingPrefix}\n\n` +
        `💳 *Billing & Premium Details:*\n` +
        `• *Policy Number:* ${activePolicy.policyNumber}\n` +
        `• *Plan:* ${catalog?.name || 'Standard Care Plan'} (${catalog?.insurerName || 'Insurance Provider'})\n` +
        `• *Monthly Premium:* $${premiumDollars} / mo\n` +
        `• *Next Payment Due Date:* ${dueDateFormatted}\n` +
        `• *Status:* ${activePolicy.status}\n\n` +
        `Let me know if you would like an invoice copy or payment receipt.`;

      return {
        replyText,
        agentName: 'ExistingCustomerAgent',
        confidenceScore: 1.0,
        actionTaken: 'POLICY_DETAILS_SENT',
        isComplete: false,
      };
    }

    // B. Sum Insured & Coverage Limits Intent
    if (
      lowerMessage.includes('sum insured') ||
      lowerMessage.includes('sum') ||
      lowerMessage.includes('coverage limit') ||
      lowerMessage.includes('max limit') ||
      lowerMessage.includes('maximum coverage') ||
      lowerMessage.includes('policy limit')
    ) {
      const sumInsuredCents = catalog?.sumInsured || 0;
      const sumInsuredDollars = (sumInsuredCents / 100).toLocaleString('en-US');

      const replyText =
        `${greetingPrefix}\n\n` +
        `🛡️ *Coverage Limit Details:*\n` +
        `• *Policy Number:* ${activePolicy.policyNumber}\n` +
        `• *Plan:* ${catalog?.name}\n` +
        `• *Total Sum Insured:* $${sumInsuredDollars}\n` +
        `• *Effective Date:* ${new Date(activePolicy.effectiveDate).toLocaleDateString()}\n` +
        `• *Expiry Date:* ${new Date(activePolicy.expiryDate).toLocaleDateString()}\n\n` +
        `Would you like to review specific co-pays or benefits under this plan?`;

      return {
        replyText,
        agentName: 'ExistingCustomerAgent',
        confidenceScore: 1.0,
        actionTaken: 'POLICY_DETAILS_SENT',
        isComplete: false,
      };
    }

    // C. Policy Summary / Status Intent
    if (
      lowerMessage.includes('my policy') ||
      lowerMessage.includes('policy status') ||
      lowerMessage.includes('policy details') ||
      lowerMessage.includes('show my plan') ||
      lowerMessage.includes('active plan')
    ) {
      const replyText =
        `${greetingPrefix}\n\n` +
        `📋 *Your Active Policy Summary:*\n` +
        `• *Policy ID:* ${activePolicy.policyNumber}\n` +
        `• *Insurer:* ${catalog?.insurerName}\n` +
        `• *Plan Name:* ${catalog?.name}\n` +
        `• *Status:* ${activePolicy.status} ✅\n` +
        `• *Coverage Period:* ${new Date(activePolicy.effectiveDate).toLocaleDateString()} to ${new Date(activePolicy.expiryDate).toLocaleDateString()}\n\n` +
        `How can I assist with your policy today? You can ask about covered benefits, claims, or billing.`;

      return {
        replyText,
        agentName: 'ExistingCustomerAgent',
        confidenceScore: 1.0,
        actionTaken: 'POLICY_DETAILS_SENT',
        isComplete: false,
      };
    }

    // D. Human Escalation / Endorsement / Claim / Change Request Intent
    if (
      lowerMessage.includes('claim') ||
      lowerMessage.includes('cancel') ||
      lowerMessage.includes('change address') ||
      lowerMessage.includes('update beneficiary') ||
      lowerMessage.includes('endorsement') ||
      lowerMessage.includes('talk to human') ||
      lowerMessage.includes('representative')
    ) {
      await this.flagEscalation({
        tenantId,
        conversationId,
        reason: `Customer requested servicing action: ${rawMessage.slice(0, 100)}`,
        io,
      });

      return {
        replyText:
          `${greetingPrefix}I have flagged your request for our policy servicing team. ` +
          `A representative will reach out to you directly to assist with your claim/policy update.`,
        agentName: 'ExistingCustomerAgent',
        confidenceScore: 0.95,
        actionTaken: 'HUMAN_ESCALATED',
        isComplete: true,
      };
    }

    // E. Policy-Scoped RAG Intent (Benefits, Deductibles, Network, Co-pays)
    const catalogId = activePolicy.policyCatalogId;
    const ragResults = await retrieve(
      tenantId,
      { policyCatalogId: catalogId },
      rawMessage,
      3
    );

    let answer = '';
    const sourcesUsed: string[] = [];

    if (ragResults.length > 0) {
      sourcesUsed.push(...ragResults.map((r) => `Clause p.${r.pageNumber}`));
      try {
        const ai = await getTenantAIClient(tenantId, true);
        answer = await ai.generateChat([
          {
            role: 'system',
            content: `You are a licensed policy servicing agent. Answer the customer's question strictly using the provided policy clauses.
Cite the relevant section/page number if available. If the answer is not in the context, politely state that you will connect them with an agent.`,
          },
          {
            role: 'user',
            content: `POLICY CLAUSES (Plan: ${catalog?.name}):\n${ragResults.map((r) => `[Page ${r.pageNumber}]: ${r.text}`).join('\n---\n')}\n\nCUSTOMER QUESTION: ${rawMessage}`,
          },
        ]);
      } catch (err) {
        answer = `Under policy ${activePolicy.policyNumber} (${catalog?.name}):\n\n${ragResults[0].text.slice(0, 250)}...`;
      }
    } else {
      answer =
        `For policy ${activePolicy.policyNumber} (${catalog?.name}), comprehensive in-network medical and emergency services are covered according to your plan schedule. ` +
        `For specific specialty authorization or claims questions, an advisor can assist you.`;
    }

    const replyText = `${greetingPrefix}\n\n${answer.trim()}`;

    return {
      replyText,
      agentName: 'ExistingCustomerAgent',
      confidenceScore: 0.92,
      sourcesUsed,
      actionTaken: 'INFO_REPLIED',
      isComplete: false,
    };
  }

  private async flagEscalation(params: {
    tenantId: string;
    conversationId: string;
    reason: string;
    io?: any;
  }) {
    const { tenantId, conversationId, reason, io } = params;
    try {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          `SELECT set_config('app.current_tenant_id', $1, true), set_config('app.current_user_role', 'ADMIN', true);`,
          tenantId
        );

        if (conversationId) {
          const conv = await tx.conversation.findUnique({
            where: { id: conversationId },
          });
          if (conv) {
            await tx.conversation.update({
              where: { id: conversationId },
              data: {
                needsEscalation: true,
                escalationReason: reason,
              },
            });
          }
        }
      });

      if (io) {
        io.to(`tenant:${tenantId}`).emit('conversation_escalated', {
          conversationId,
          reason,
        });
      }
    } catch (err) {
      console.error('[ExistingCustomerAgent] Failed to flag escalation:', err);
    }
  }
}
