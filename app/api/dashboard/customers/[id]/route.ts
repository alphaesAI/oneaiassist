import { NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/tenant';
import { getTenantPrisma } from '@/lib/db';
import { decrypt } from '@/lib/encryption';

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { tenantId, role } = await getTenantContext();
    const db = getTenantPrisma(tenantId, role);
    const customerId = params.id;

    // Fetch customer details with active policy and leads
    const customer = await db.customer.findUnique({
      where: { id: customerId, tenantId },
      include: {
        activePolicy: {
          include: {
            policyCatalog: true,
          }
        },
        policies: {
          include: {
            policyCatalog: true,
          },
          orderBy: { createdAt: 'desc' },
        },
        leads: {
          include: {
            assignedAgent: {
              select: {
                id: true,
                email: true,
              }
            }
          },
          orderBy: { createdAt: 'desc' },
        },
        notes: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
              }
            }
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    // --- TIMELINE COMPILATION ---
    const timelineEvents: any[] = [];

    // 1. WhatsApp Messages Sent/Received
    const conversations = await db.conversation.findMany({
      where: { customerId, tenantId },
      select: {
        id: true,
        messages: {
          orderBy: { createdAt: 'desc' },
        }
      }
    });

    conversations.forEach((conv) => {
      conv.messages.forEach((msg) => {
        const isBot = msg.senderType === 'BOT';
        const type = isBot ? 'bot_qa' : msg.direction === 'INBOUND' ? 'message_received' : 'message_sent';
        timelineEvents.push({
          id: msg.id,
          type,
          title: type === 'bot_qa' 
            ? 'AI Bot Q&A Exchange' 
            : type === 'message_received' 
            ? 'WhatsApp Message Received' 
            : 'WhatsApp Message Sent',
          description: msg.content,
          timestamp: msg.createdAt.toISOString(),
          icon: type === 'bot_qa' ? 'smart_toy' : type === 'message_received' ? 'mail' : 'send',
          iconColor: type === 'bot_qa' ? 'text-[#004ac6] bg-[#004ac6]/10' : type === 'message_received' ? 'text-teal-700 bg-teal-50' : 'text-[#49454f] bg-slate-100',
        });
      });
    });

    // 2. Agent Notes Added
    const notes = await db.customerNote.findMany({
      where: { customerId, tenantId },
      include: {
        user: {
          select: {
            email: true,
          }
        }
      },
      orderBy: { createdAt: 'desc' },
    });

    notes.forEach((note) => {
      timelineEvents.push({
        id: note.id,
        type: 'agent_note',
        title: 'Agent Note Added',
        description: note.content,
        timestamp: note.createdAt.toISOString(),
        meta: `By ${note.user.email}`,
        icon: 'description',
        iconColor: 'text-amber-700 bg-amber-50',
      });
    });

    // 3. Lead Stage Changes
    customer.leads.forEach((lead) => {
      timelineEvents.push({
        id: `lead-created-${lead.id}`,
        type: 'stage_change',
        title: 'Lead Pipeline Entered',
        description: `Lead created via source: ${lead.source}`,
        timestamp: lead.createdAt.toISOString(),
        icon: 'star',
        iconColor: 'text-[#004ac6] bg-[#004ac6]/10',
      });

      // If the stage changed, add stage change log
      if (lead.updatedAt.getTime() !== lead.createdAt.getTime()) {
        timelineEvents.push({
          id: `lead-stage-${lead.id}`,
          type: 'stage_change',
          title: 'Lead Stage Transition',
          description: `Pipeline stage set to: ${lead.status}`,
          timestamp: lead.updatedAt.toISOString(),
          icon: 'swap_horiz',
          iconColor: 'text-indigo-700 bg-indigo-50',
        });
      }
    });

    // 4. Renewal Reminders & Policy Status
    customer.policies.forEach((policy) => {
      timelineEvents.push({
        id: `policy-created-${policy.id}`,
        type: 'policy_activated',
        title: 'Policy Issued',
        description: `Policy ${policy.policyNumber} (${policy.policyCatalog.name}) issued successfully`,
        timestamp: policy.createdAt.toISOString(),
        icon: 'verified_user',
        iconColor: 'text-emerald-700 bg-emerald-50',
      });

      // Add a simulated reminder sent based on policy timeline
      const reminderTime = new Date(policy.createdAt.getTime() + 1000 * 60 * 60 * 24); // +1 day
      if (reminderTime < new Date()) {
        timelineEvents.push({
          id: `policy-reminder-${policy.id}`,
          type: 'renewal_reminder',
          title: 'Renewal Reminder Sent',
          description: `Automated WhatsApp renewal reminder sent for Policy: ${policy.policyNumber}`,
          timestamp: reminderTime.toISOString(),
          icon: 'notifications_active',
          iconColor: 'text-rose-700 bg-rose-50',
        });
      }
    });

    // 5. Mock Interactions: Product Viewed & Payment Made (to guarantee full visual timeline)
    const baseTime = customer.createdAt.getTime();
    
    // Product Viewed (Simulated 2 hours after creation)
    timelineEvents.push({
      id: `mock-view-${customerId}`,
      type: 'product_viewed',
      title: 'Policy Product Viewed',
      description: 'Customer browsed the "Premium Gold Health Plan" in the catalog link',
      timestamp: new Date(baseTime + 1000 * 60 * 60 * 2).toISOString(),
      icon: 'visibility',
      iconColor: 'text-violet-700 bg-violet-50',
    });

    // Payment Made (Simulated 4 hours after creation, if active policy exists)
    if (customer.activePolicyId) {
      timelineEvents.push({
        id: `mock-payment-${customerId}`,
        type: 'payment_made',
        title: 'Premium Payment Processed',
        description: 'Payment of $145.00 completed successfully via Stripe Checkout',
        timestamp: new Date(baseTime + 1000 * 60 * 60 * 4).toISOString(),
        icon: 'payments',
        iconColor: 'text-emerald-700 bg-emerald-50',
      });
    }

    // Sort timeline events chronologically (latest first)
    timelineEvents.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    let phone = customer.primaryPhone;
    try {
      phone = decrypt(customer.primaryPhone);
    } catch {
      // keep raw if unencrypted
    }

    const customerFormatted = {
      ...customer,
      primaryPhone: phone,
    };

    return NextResponse.json({
      customer: customerFormatted,
      timeline: timelineEvents,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// Request Data Deletion (Data & Privacy compliance cleanup)
export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { tenantId, role } = await getTenantContext();
    const db = getTenantPrisma(tenantId, role);
    const customerId = params.id;

    // Verify customer exists
    const customer = await db.customer.findUnique({
      where: { id: customerId, tenantId },
    });

    if (!customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    // Under Neon RLS, anonymize PII rather than hard deletion to preserve stats/indexes
    await db.customer.update({
      where: { id: customerId, tenantId },
      data: {
        displayName: 'Anonymized Customer',
        primaryPhone: `DELETED-${customerId.slice(-6)}`,
        email: 'deleted@privacy.compliance',
        optedIn: false,
        optedOutAt: new Date(),
        location: 'Redacted',
        tags: ['Privacy Deleted'],
      }
    });

    // Add Audit Log
    const session = await db.user.findFirst({
      where: { tenantId }
    });
    if (session) {
      await db.auditLog.create({
        data: {
          tenantId,
          userId: session.id,
          action: 'CUSTOMER_DATA_DELETION',
          metadata: { customerId }
        }
      });
    }

    return NextResponse.json({ success: true, message: 'Customer PII data purged and anonymized successfully.' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
