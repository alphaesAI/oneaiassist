import { prisma, getTenantPrisma } from '../../lib/db';
import { ComplianceGateResult, HardComplianceIntent } from './types';

interface ComplianceRule {
  intent: HardComplianceIntent;
  regex: RegExp;
  description: string;
  holdingTemplate: string;
}

const COMPLIANCE_RULES: ComplianceRule[] = [
  {
    intent: 'LEGAL_THREAT',
    regex: /\b(lawsuit|attorney|lawyer|sue\s+(?:you|the\s+company|us)|legal\s+action|litigation|court\s+(?:summons|case)|subpoena|retained\s+counsel)\b/i,
    description: 'Threat of legal action or attorney involvement',
    holdingTemplate:
      'We have logged your communication regarding legal representation. Your conversation has been immediately transferred to our Compliance and Legal Supervision team. A representative will contact you directly.',
  },
  {
    intent: 'REGULATORY_COMPLAINT',
    regex: /\b(insurance\s+commissioner|department\s+of\s+insurance|doi\s+complaint|state\s+regulator|cfpb|naic|consumer\s+protection\s+bureau|ombudsman)\b/i,
    description: 'Regulatory or governmental complaint notice',
    holdingTemplate:
      'We take regulatory inquiries very seriously. This matter has been escalated to our Senior Compliance Officer for immediate formal review and follow-up.',
  },
  {
    intent: 'CLAIM_DISPUTE',
    regex: /\b(claim\s+(?:was\s+|is\s+|got\s+)?(?:denied|rejected|disputed?|appealed?|refused|withheld)|claim\s+(?:dispute|appeal|denial)|wrongful\s+denial|bad\s+faith|unpaid\s+claim|appeal\s+(?:the\s+|my\s+)?(?:rejected\s+|denied\s+)?claim)\b/i,
    description: 'Adverse claim determination dispute or bad faith claim allegation',
    holdingTemplate:
      'We understand you are disputing a recent claim determination. To ensure full compliance with state claims settlement guidelines, your file is now assigned to a Licensed Claims Supervisor who will review the adjudication details.',
  },
  {
    intent: 'GRIEVANCE',
    regex: /\b(formal\s+complaint|grievance|fraud|scam|unauthorized\s+charge|report\s+you|illegal\s+practice)\b/i,
    description: 'Formal consumer grievance or fraud report',
    holdingTemplate:
      'Your formal grievance has been registered. Our Quality & Compliance team is reviewing your account history and will reach out promptly.',
  },
  {
    intent: 'POLICY_CANCELLATION',
    regex: /\b(cancel\s+(?:my\s+)?(?:policy|plan|coverage|insurance)|surrender\s+(?:my\s+)?policy|terminate\s+(?:my\s+)?(?:coverage|policy)|stop\s+my\s+insurance)\b/i,
    description: 'Policy cancellation or surrender request',
    holdingTemplate:
      'We have received your policy cancellation request. A licensed retention specialist has been assigned to assist you with the necessary termination documentation and statutory notice period requirements.',
  },
];

export class HardComplianceGate {
  /**
   * Deterministically evaluates message text against hard compliance rules.
   * Returns isViolation: true if triggered, with holding message and intent.
   * Fails closed: any error during evaluation defaults to isViolation: true.
   */
  static evaluate(messageText: string): ComplianceGateResult {
    if (!messageText || typeof messageText !== 'string') {
      return { isViolation: false, recommendedAction: 'PROCEED' };
    }

    try {
      const cleanText = messageText.trim();

      for (const rule of COMPLIANCE_RULES) {
        const match = cleanText.match(rule.regex);
        if (match) {
          return {
            isViolation: true,
            intent: rule.intent,
            triggerPhrase: match[0],
            recommendedAction: 'ESCALATE_HUMAN',
            holdingMessage: rule.holdingTemplate,
          };
        }
      }

      return {
        isViolation: false,
        recommendedAction: 'PROCEED',
      };
    } catch (err) {
      console.error('[HardComplianceGate] Evaluation error - failing closed to human escalation:', err);
      // Fail-closed guarantee
      return {
        isViolation: true,
        intent: 'GRIEVANCE',
        triggerPhrase: 'SYSTEM_EVALUATION_ERROR',
        recommendedAction: 'ESCALATE_HUMAN',
        holdingMessage:
          'Your inquiry has been transferred to a licensed support specialist. An agent will assist you shortly.',
      };
    }
  }

  /**
   * Executes the fail-closed compliance escalation procedure:
   * 1. Sets conversation status to HUMAN_AGENT / needsEscalation
   * 2. Writes a compliance audit log entry
   * 3. Emits a real-time compliance alert to dashboard inbox via Socket.io
   */
  static async executeEscalation(params: {
    tenantId: string;
    conversationId: string;
    senderPhone: string;
    result: ComplianceGateResult;
    io?: any;
  }): Promise<void> {
    const { tenantId, conversationId, senderPhone, result, io } = params;

    try {
      const db = getTenantPrisma(tenantId, 'ADMIN');

      // 1. Update Conversation
      await db.conversation.update({
        where: { id: conversationId },
        data: {
          status: 'OPEN',
          needsEscalation: true,
          escalationReason: `COMPLIANCE_${result.intent || 'FLAG'}: ${result.triggerPhrase || 'Violating phrase detected'}`,
          automationEnabled: false,
          lastMessageAt: new Date(),
        },
      });

      // 2. Fetch admin user for audit log
      const adminUser = await db.user.findFirst({
        where: { tenantId },
        orderBy: { createdAt: 'asc' },
      });

      if (adminUser) {
        await db.auditLog.create({
          data: {
            tenantId,
            userId: adminUser.id,
            action: 'COMPLIANCE_ESCALATION_TRIGGERED',
            metadata: {
              conversationId,
              senderPhone,
              intent: result.intent,
              triggerPhrase: result.triggerPhrase,
              severity: 'CRITICAL',
              timestamp: new Date().toISOString(),
            },
          },
        });
      }

      // 3. Emit real-time compliance alert dossier to /dashboard/inbox
      if (io) {
        io.to(`tenant_${tenantId}`).emit('compliance_alert', {
          conversationId,
          senderPhone,
          intent: result.intent,
          triggerPhrase: result.triggerPhrase,
          reason: `Automated bot halted due to compliance policy [${result.intent}]. Human agent required.`,
          timestamp: new Date().toISOString(),
        });

        io.to(`tenant_${tenantId}`).emit('conversation_updated', {
          conversationId,
          status: 'HUMAN_AGENT',
          needsEscalation: true,
          escalationReason: `COMPLIANCE_${result.intent}`,
        });
      }

      console.log(
        `🚨 [HardComplianceGate] Escalated conversation ${conversationId} for tenant ${tenantId} due to intent: ${result.intent}`
      );
    } catch (err) {
      console.error('[HardComplianceGate] Error executing compliance escalation:', err);
    }
  }
}
