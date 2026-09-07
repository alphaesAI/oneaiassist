import { NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/tenant';

interface SequenceStep {
  id: string;
  type: 'DELAY' | 'SEND_TEMPLATE' | 'WAIT_REPLY' | 'ASSIGN_TAG';
  delayDays?: number;
  templateName?: string;
  tagName?: string;
}

interface Sequence {
  id: string;
  name: string;
  description: string;
  trigger: string;
  status: 'ACTIVE' | 'PAUSED' | 'DRAFT';
  stepsCount: number;
  enrolledCount: number;
  completedCount: number;
  createdAt: string;
  steps: SequenceStep[];
}

// In-memory tenant sequence store for demonstration & management
const mockSequencesStore: Record<string, Sequence[]> = {
  default: [
    {
      id: 'seq-1',
      name: 'New Health Lead Onboarding',
      description: 'Automated 3-step follow-up for leads interested in individual and family health plans.',
      trigger: 'Lead Created',
      status: 'ACTIVE',
      stepsCount: 3,
      enrolledCount: 142,
      completedCount: 98,
      createdAt: new Date(Date.now() - 7 * 86400000).toISOString(),
      steps: [
        { id: 's1', type: 'SEND_TEMPLATE', templateName: 'welcome_quote_summary' },
        { id: 's2', type: 'DELAY', delayDays: 2 },
        { id: 's3', type: 'SEND_TEMPLATE', templateName: 'advisor_checkin_reminder' },
      ],
    },
    {
      id: 'seq-2',
      name: 'Quote Expiration Nudge',
      description: 'Re-engages leads whose custom premium quotes expire within 48 hours.',
      trigger: 'Quote Issued (+3 days)',
      status: 'ACTIVE',
      stepsCount: 2,
      enrolledCount: 64,
      completedCount: 45,
      createdAt: new Date(Date.now() - 14 * 86400000).toISOString(),
      steps: [
        { id: 's1', type: 'DELAY', delayDays: 3 },
        { id: 's2', type: 'SEND_TEMPLATE', templateName: 'quote_discount_warning' },
      ],
    },
    {
      id: 'seq-3',
      name: 'Post-Enrollment Policy Welcome',
      description: 'Delivers policy schedule PDF and onboarding checklist after checkout.',
      trigger: 'Checkout Completed',
      status: 'PAUSED',
      stepsCount: 4,
      enrolledCount: 210,
      completedCount: 205,
      createdAt: new Date(Date.now() - 30 * 86400000).toISOString(),
      steps: [
        { id: 's1', type: 'SEND_TEMPLATE', templateName: 'policy_issued_confirmation' },
        { id: 's2', type: 'ASSIGN_TAG', tagName: 'Active Insured' },
        { id: 's3', type: 'DELAY', delayDays: 7 },
        { id: 's4', type: 'SEND_TEMPLATE', templateName: 'claim_portal_guide' },
      ],
    },
  ],
};

export async function GET() {
  try {
    const { tenantId } = await getTenantContext();
    const sequences = mockSequencesStore[tenantId] || mockSequencesStore.default;
    return NextResponse.json({ success: true, sequences });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch sequences';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { tenantId } = await getTenantContext();
    const body = await req.json();
    const { name, description, trigger } = body;

    if (!name || !trigger) {
      return NextResponse.json({ error: 'Sequence name and trigger are required' }, { status: 400 });
    }

    const newSeq: Sequence = {
      id: `seq-${Date.now()}`,
      name,
      description: description || '',
      trigger,
      status: 'ACTIVE',
      stepsCount: 2,
      enrolledCount: 0,
      completedCount: 0,
      createdAt: new Date().toISOString(),
      steps: [
        { id: 's1', type: 'SEND_TEMPLATE', templateName: 'welcome_template' },
        { id: 's2', type: 'DELAY', delayDays: 1 },
      ],
    };

    if (!mockSequencesStore[tenantId]) {
      mockSequencesStore[tenantId] = [...mockSequencesStore.default];
    }
    mockSequencesStore[tenantId].unshift(newSeq);

    return NextResponse.json({ success: true, sequence: newSeq });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to create sequence';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const { tenantId } = await getTenantContext();
    const body = await req.json();
    const { id, status } = body;

    if (!id || !status) {
      return NextResponse.json({ error: 'Sequence ID and status are required' }, { status: 400 });
    }

    const list = mockSequencesStore[tenantId] || mockSequencesStore.default;
    const seq = list.find((s) => s.id === id);
    if (seq) {
      seq.status = status;
    }

    return NextResponse.json({ success: true, sequence: seq });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to update sequence';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
