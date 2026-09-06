import { AgentRegistry } from './AgentRegistry';
import { HardComplianceGate } from './HardComplianceGate';
import { IdentityResolver } from './IdentityResolver';
import { NewCustomerAgent } from './NewCustomerAgent';
import { ExistingCustomerAgent } from './ExistingCustomerAgent';
import { AgentContext, AgentResponse } from './types';

// Register core agents on module load
AgentRegistry.register(new NewCustomerAgent());
AgentRegistry.register(new ExistingCustomerAgent());

export class AgentRouter {
  /**
   * Main dispatch entry point for all inbound customer messages.
   * Evaluates compliance gate -> resolves identity -> routes to specialized agent.
   */
  static async dispatchMessage(params: {
    tenantId: string;
    conversationId: string;
    rawMessage: string;
    wamId: string;
    senderPhone: string;
    io?: any;
  }): Promise<AgentResponse> {
    const { tenantId, conversationId, rawMessage, wamId, senderPhone, io } = params;

    // 1. Stage 1: Fail-Closed Compliance Gate
    const complianceResult = HardComplianceGate.evaluate(rawMessage);
    if (complianceResult.isViolation) {
      await HardComplianceGate.executeEscalation({
        tenantId,
        conversationId,
        senderPhone,
        result: complianceResult,
        io,
      });

      return {
        replyText:
          complianceResult.holdingMessage ||
          'Your request has been escalated to a licensed supervisor. An agent will contact you shortly.',
        agentName: 'ComplianceSupervisor',
        confidenceScore: 1.0,
        actionTaken: 'HUMAN_ESCALATED',
        isComplete: true,
      };
    }

    // 2. Stage 2: Identity & Dependent Resolution
    const identity = await IdentityResolver.resolve(tenantId, senderPhone);

    // 3. Stage 3: Build Agent Context
    const context: AgentContext = {
      tenantId,
      conversationId,
      rawMessage,
      wamId,
      senderPhone,
      identity,
      io,
    };

    // 4. Stage 4: Route to Target Agent
    const agent = await AgentRegistry.resolveAgent(context);
    if (agent) {
      console.log(`[AgentRouter] Routing message to agent: ${agent.name} for ${senderPhone} (${identity.type})`);
      return await agent.handle(context);
    }

    // 5. Fallback if no agent matches
    console.warn(`[AgentRouter] No matching agent found for identity type ${identity.type}. Using fallback.`);
    return {
      replyText: `Hello! We received your message. How can our insurance team help you today?`,
      agentName: 'FallbackAgent',
      confidenceScore: 0.5,
      actionTaken: 'INFO_REPLIED',
    };
  }
}
