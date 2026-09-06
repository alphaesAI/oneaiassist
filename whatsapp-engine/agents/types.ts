import { InboundMessageJob, Customer, Policy, IntakeSession, DynamicIntakeQuestion } from '@prisma/client';

export type CustomerType = 'PROSPECT' | 'PRIMARY_POLICYHOLDER' | 'DEPENDENT';

export interface CustomerIdentityResolution {
  type: CustomerType;
  customer?: Customer;
  primaryCustomer?: Customer; // Populated if type === 'DEPENDENT'
  leadId?: string;
  policies?: Policy[];
  intakeSession?: IntakeSession | null;
  normalizedPhone: string;
  displayName: string;
}

export type HardComplianceIntent =
  | 'LEGAL_THREAT'
  | 'REGULATORY_COMPLAINT'
  | 'CLAIM_DISPUTE'
  | 'GRIEVANCE'
  | 'POLICY_CANCELLATION'
  | 'FRAUD_REPORT';

export interface ComplianceGateResult {
  isViolation: boolean;
  intent?: HardComplianceIntent;
  triggerPhrase?: string;
  recommendedAction?: 'ESCALATE_HUMAN' | 'BLOCK' | 'PROCEED';
  holdingMessage?: string;
}

export interface AgentContext {
  tenantId: string;
  conversationId: string;
  rawMessage: string;
  wamId: string;
  senderPhone: string;
  identity: CustomerIdentityResolution;
  io?: any;
}

export interface AgentResponse {
  replyText: string;
  agentName: 'NewCustomerAgent' | 'ExistingCustomerAgent' | 'ComplianceSupervisor' | 'FallbackAgent';
  confidenceScore: number;
  sourcesUsed?: string[];
  actionTaken?: 'INTAKE_COLLECTED' | 'RECOMMENDATION_SENT' | 'POLICY_DETAILS_SENT' | 'HUMAN_ESCALATED' | 'INFO_REPLIED';
  leadStageUpdated?: string;
  isComplete?: boolean;
}

export interface IInsuranceAgent {
  readonly name: string;
  canHandle(context: AgentContext): Promise<boolean>;
  handle(context: AgentContext): Promise<AgentResponse>;
}
