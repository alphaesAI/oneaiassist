import { getTenantPrisma, prisma } from '@/lib/db';
import { retrieve } from '@/lib/rag/retrieve';
import { getTenantAIClient } from '@/lib/ai/client';
import { IInsuranceAgent, AgentContext, AgentResponse } from './types';
import { FieldValidator } from './FieldValidator';
import { RecommendationEngine } from './RecommendationEngine';
import { DynamicIntakeQuestion } from '@prisma/client';

export class NewCustomerAgent implements IInsuranceAgent {
  readonly name = 'NewCustomerAgent' as const;

  async canHandle(context: AgentContext): Promise<boolean> {
    // Handles prospects and new quote inquiries
    return context.identity.type === 'PROSPECT';
  }

  async handle(context: AgentContext): Promise<AgentResponse> {
    const { tenantId, rawMessage, senderPhone, identity, io, conversationId } = context;
    const db = getTenantPrisma(tenantId, 'ADMIN');
    const displayName = identity.displayName || 'there';

    // 1. Fetch active intake questions for tenant (ordered by stepOrder)
    let questions = await db.dynamicIntakeQuestion.findMany({
      where: {
        tenantId,
        isActive: true,
      },
      orderBy: { stepOrder: 'asc' },
    });

    // Fallback default questions if tenant hasn't configured any
    if (questions.length === 0) {
      questions = [
        {
          id: 'def-age',
          tenantId,
          stepOrder: 1,
          fieldKey: 'age',
          questionPrompt: 'To find the best rates in your area, what is your current age?',
          validationType: 'NUMBER',
          isMandatory: true,
          isSkippable: false,
          options: null,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'def-state',
          tenantId,
          stepOrder: 2,
          fieldKey: 'state',
          questionPrompt: 'Which US state do you reside in (e.g. TX, CA, NY)?',
          validationType: 'US_STATE',
          isMandatory: true,
          isSkippable: false,
          options: null,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'def-family',
          tenantId,
          stepOrder: 3,
          fieldKey: 'family_size',
          questionPrompt: 'How many family members (including yourself) should this policy cover?',
          validationType: 'NUMBER',
          isMandatory: true,
          isSkippable: false,
          options: null,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'def-budget',
          tenantId,
          stepOrder: 4,
          fieldKey: 'budget',
          questionPrompt: 'What is your target monthly budget for health coverage (e.g. $150 or $250/mo)?',
          validationType: 'CURRENCY',
          isMandatory: true,
          isSkippable: false,
          options: null,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'def-conditions',
          tenantId,
          stepOrder: 5,
          fieldKey: 'conditions',
          questionPrompt: 'Do you or any covered members have pre-existing conditions?',
          validationType: 'ENUM',
          isMandatory: true,
          isSkippable: false,
          options: ['None', 'Diabetes', 'Hypertension', 'Other'],
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
    }

    // 2. Resolve or create Customer, Lead, and IntakeSession
    let customer = identity.customer;
    if (!customer) {
      customer = await db.customer.findFirst({
        where: { tenantId, primaryPhone: senderPhone },
      });
      if (!customer) {
        customer = await db.customer.create({
          data: {
            tenantId,
            displayName,
            primaryPhone: senderPhone,
          },
        });
      }
    }

    let lead = await db.lead.findFirst({
      where: { tenantId, customerId: customer.id },
      orderBy: { createdAt: 'desc' },
    });

    if (!lead) {
      lead = await db.lead.create({
        data: {
          tenantId,
          customerId: customer.id,
          source: 'WhatsApp Inbound',
          status: 'NEW',
        },
      });
    }

    let session = await db.intakeSession.findUnique({
      where: { leadId: lead.id },
    });

    if (!session) {
      session = await db.intakeSession.create({
        data: {
          tenantId,
          leadId: lead.id,
          customerId: customer.id,
          flowId: 'dynamic-intake-v1',
          flowVersion: '1.0',
          status: 'IN_PROGRESS',
          currentFieldKey: questions[0].fieldKey,
          collectedFields: {},
          interruptionCount: 0,
        },
      });

      // Send initial welcome greeting and first question
      const firstQ = questions[0];
      const initialGreeting = `Hello ${displayName}! 👋 Welcome to our insurance assistant. I can help you find and compare top health plans in minutes.\n\n${firstQ.questionPrompt}`;
      return {
        replyText: initialGreeting,
        agentName: 'NewCustomerAgent',
        confidenceScore: 1.0,
        actionTaken: 'INTAKE_COLLECTED',
        leadStageUpdated: 'NEW_LEAD',
        isComplete: false,
      };
    }

    // If session is already completed, run recommendation engine or ask if they want to review
    if (session.isComplete) {
      const collectedData = (session.collectedFields as Record<string, any>) || {};
      const recResult = await RecommendationEngine.generateRecommendation({
        tenantId,
        intakeData: collectedData,
        customerPhone: senderPhone,
        leadId: lead.id,
        io,
      });

      return {
        replyText: recResult.replyText,
        agentName: 'NewCustomerAgent',
        confidenceScore: 0.95,
        actionTaken: recResult.status === 'PROPOSAL_SENT' ? 'RECOMMENDATION_SENT' : 'HUMAN_ESCALATED',
        leadStageUpdated: recResult.status === 'PROPOSAL_SENT' ? 'PROPOSAL_SENT' : 'QUALIFIED',
        isComplete: true,
      };
    }

    // Determine current active question
    const currentFieldKey = session.currentFieldKey || questions[0].fieldKey;
    const currentQuestionIndex = questions.findIndex((q) => q.fieldKey === currentFieldKey);
    const currentQuestion = currentQuestionIndex >= 0 ? questions[currentQuestionIndex] : questions[0];

    const collectedFields = (session.collectedFields as Record<string, any>) || {};

    // 3. Validation-First Strategy
    const valResult = FieldValidator.validate(currentQuestion, rawMessage);

    if (valResult.isValid) {
      // Input is valid for current question!
      collectedFields[currentQuestion.fieldKey] = valResult.normalizedValue;

      // Find next unanswered question
      const nextQuestion = questions.find(
        (q, idx) => idx > currentQuestionIndex && collectedFields[q.fieldKey] === undefined
      );

      if (nextQuestion) {
        // Advance currentFieldKey to next question atomically
        await this.atomicSessionUpdate({
          tenantId,
          sessionId: session.id,
          leadId: lead.id,
          currentFieldKey: nextQuestion.fieldKey,
          collectedFields,
          interruptionCount: 0,
          isComplete: false,
          io,
        });

        let replyPrompt = nextQuestion.questionPrompt;
        if (nextQuestion.validationType === 'ENUM' && nextQuestion.options) {
          const opts = Array.isArray(nextQuestion.options)
            ? nextQuestion.options
            : JSON.parse(String(nextQuestion.options));
          replyPrompt += `\n(Options: ${opts.join(', ')})`;
        }

        return {
          replyText: replyPrompt,
          agentName: 'NewCustomerAgent',
          confidenceScore: 0.95,
          actionTaken: 'INTAKE_COLLECTED',
          leadStageUpdated: 'IN_PROGRESS',
          isComplete: false,
        };
      } else {
        // All intake questions completed!
        await this.atomicSessionUpdate({
          tenantId,
          sessionId: session.id,
          leadId: lead.id,
          currentFieldKey: null,
          collectedFields,
          interruptionCount: 0,
          isComplete: true,
          io,
        });

        // Trigger Two-Stage Recommendation Engine
        const recResult = await RecommendationEngine.generateRecommendation({
          tenantId,
          intakeData: collectedFields,
          customerPhone: senderPhone,
          leadId: lead.id,
          io,
        });

        return {
          replyText: recResult.replyText,
          agentName: 'NewCustomerAgent',
          confidenceScore: 0.98,
          actionTaken: recResult.status === 'PROPOSAL_SENT' ? 'RECOMMENDATION_SENT' : 'HUMAN_ESCALATED',
          leadStageUpdated: recResult.status === 'PROPOSAL_SENT' ? 'PROPOSAL_SENT' : 'QUALIFIED',
          isComplete: true,
        };
      }
    }

    // 4. Input was not valid for the active field -> Check for Interruption vs Re-prompt
    const isInterruption = this.checkInquiryIntent(rawMessage);

    if (isInterruption) {
      const currentInterruptions = session.interruptionCount || 0;

      // Interruption Guard: Max 3 consecutive interruptions
      if (currentInterruptions >= 3) {
        return {
          replyText:
            `I'd be happy to answer all your policy questions once we finish your quick quote! 📋\n\n` +
            `👉 Let's get your details first: ${currentQuestion.questionPrompt}`,
          agentName: 'NewCustomerAgent',
          confidenceScore: 0.9,
          actionTaken: 'INFO_REPLIED',
          isComplete: false,
        };
      }

      // Increment interruption counter
      await db.intakeSession.update({
        where: { id: session.id },
        data: { interruptionCount: currentInterruptions + 1 },
      });

      // Perform Brochure RAG across tenant catalog
      const ragResults = await retrieve(tenantId, {}, rawMessage, 2);
      let ragAnswer = '';

      if (ragResults.length > 0) {
        try {
          const ai = await getTenantAIClient(tenantId, true);
          ragAnswer = await ai.generateChat([
            {
              role: 'system',
              content:
                'You are an insurance advisor. Answer the user question in 1-2 concise, clear sentences based strictly on the provided context.',
            },
            {
              role: 'user',
              content: `CONTEXT:\n${ragResults.map((r) => r.text).join('\n---\n')}\n\nQUESTION: ${rawMessage}`,
            },
          ]);
        } catch {
          ragAnswer = ragResults[0].text.slice(0, 200) + '...';
        }
      } else {
        ragAnswer =
          'We partner with top-rated insurance providers offering full in-network medical, preventive, and emergency coverage with flexible deductibles.';
      }

      const responseText = `${ragAnswer.trim()}\n\n👉 *Returning to your quote:* ${currentQuestion.questionPrompt}`;

      return {
        replyText: responseText,
        agentName: 'NewCustomerAgent',
        confidenceScore: 0.9,
        actionTaken: 'INFO_REPLIED',
        sourcesUsed: ragResults.map((r) => `Page ${r.pageNumber}`),
        isComplete: false,
      };
    }

    // 5. Plain Invalid Input -> Re-prompt with Help Text
    const helpMsg = valResult.errorMessage || `Please provide a valid answer for this step: ${currentQuestion.questionPrompt}`;
    return {
      replyText: helpMsg,
      agentName: 'NewCustomerAgent',
      confidenceScore: 0.75,
      actionTaken: 'INFO_REPLIED',
      isComplete: false,
    };
  }

  private checkInquiryIntent(text: string): boolean {
    const lower = (text || '').toLowerCase().trim();
    if (lower.includes('?') || lower.startsWith('what') || lower.startsWith('how') || lower.startsWith('why') || lower.startsWith('do you') || lower.startsWith('can i') || lower.startsWith('is there') || lower.startsWith('tell me')) {
      return true;
    }
    const inquiryKeywords = ['cover', 'cost', 'price', 'pricing', 'deductible', 'copay', 'carrier', 'insurance', 'doctor', 'network', 'benefit', 'dental', 'vision', 'prescription', 'hospital'];
    return inquiryKeywords.some((k) => lower.includes(k));
  }

  private async atomicSessionUpdate(params: {
    tenantId: string;
    sessionId: string;
    leadId: string;
    currentFieldKey: string | null;
    collectedFields: Record<string, any>;
    interruptionCount: number;
    isComplete: boolean;
    io?: any;
  }) {
    const { tenantId, sessionId, leadId, currentFieldKey, collectedFields, interruptionCount, isComplete, io } = params;

    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.current_tenant_id', $1, true), set_config('app.current_user_role', 'ADMIN', true);`,
        tenantId
      );

      // Update IntakeSession
      await tx.intakeSession.update({
        where: { id: sessionId },
        data: {
          currentFieldKey,
          collectedFields,
          interruptionCount,
          isComplete,
          status: isComplete ? 'COMPLETED' : 'IN_PROGRESS',
          completedAt: isComplete ? new Date() : undefined,
        },
      });

      // Synchronize individual Lead columns
      const updatedLead = await tx.lead.update({
        where: { id: leadId },
        data: {
          status: isComplete ? 'QUALIFIED' : 'NEW',
          intakeAge: collectedFields.age ? Number(collectedFields.age) : undefined,
          intakeState: collectedFields.state ? String(collectedFields.state).toUpperCase() : undefined,
          intakeBudgetMax: collectedFields.budget ? Number(collectedFields.budget) * 100 : undefined,
          intakeFamilySize: collectedFields.family_size ? Number(collectedFields.family_size) : undefined,
          intakeHealthConditions: collectedFields.conditions || undefined,
          intakeAnswers: collectedFields,
        },
      });

      if (io) {
        io.to(`tenant:${tenantId}`).emit('intake_updated', {
          sessionId,
          leadId,
          currentFieldKey,
          isComplete,
          lead: updatedLead,
        });
      }
    });
  }
}
