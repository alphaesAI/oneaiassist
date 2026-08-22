import { NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/tenant';
import { getTenantPrisma } from '@/lib/db';
import { decrypt, encrypt } from '@/lib/encryption';

export async function GET(req: Request) {
  try {
    const { tenantId, role } = await getTenantContext();
    const db = getTenantPrisma(tenantId, role);

    const { searchParams } = new URL(req.url);
    const agentId = searchParams.get('agentId');
    const source = searchParams.get('source');
    const startDateStr = searchParams.get('startDate');
    const endDateStr = searchParams.get('endDate');
    const searchQuery = searchParams.get('query');

    // Build Prisma query filters
    const whereClause: {
      tenantId: string;
      assignedAgentId?: string;
      source?: { equals: string; mode: 'insensitive' };
      createdAt?: { gte?: Date; lte?: Date };
    } = { tenantId };

    if (agentId && agentId !== 'ALL') {
      whereClause.assignedAgentId = agentId;
    }

    if (source && source !== 'ALL') {
      whereClause.source = {
        equals: source,
        mode: 'insensitive',
      };
    }

    if (startDateStr || endDateStr) {
      whereClause.createdAt = {};
      if (startDateStr) {
        whereClause.createdAt.gte = new Date(startDateStr);
      }
      if (endDateStr) {
        whereClause.createdAt.lte = new Date(endDateStr);
      }
    }

    const leads = await db.lead.findMany({
      where: whereClause,
      include: {
        customer: true,
        assignedAgent: {
          select: {
            id: true,
            email: true,
            role: true,
          },
        },
        intakeSession: true,
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    // Post-process list to decrypt phone numbers and apply search + formatting
    const formatted = leads
      .map((lead) => {
        let phone = 'Unknown';
        try {
          phone = decrypt(lead.customer.primaryPhone);
        } catch {
          // Ignore decryption error
        }

        // Calculate days in current stage
        const diffMs = Date.now() - new Date(lead.updatedAt).getTime();
        const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        const daysText = days === 0 ? 'Entered stage today' : `${days} day${days > 1 ? 's' : ''} in stage`;

        // Format agent display details
        const agentName = lead.assignedAgent
          ? lead.assignedAgent.email.split('@')[0]
          : 'Unassigned';

        return {
          id: lead.id,
          status: lead.status,
          source: lead.source,
          lostReason: lead.lostReason,
          intakeBudgetMin: lead.intakeBudgetMin,
          intakeBudgetMax: lead.intakeBudgetMax,
          dealValue: lead.intakeBudgetMax ? lead.intakeBudgetMax / 100 : 1500, // Fallback default $1500
          daysInStage: daysText,
          updatedAt: lead.updatedAt,
          createdAt: lead.createdAt,
          customer: {
            id: lead.customer.id,
            displayName: lead.customer.displayName,
            phone,
          },
          assignedAgent: lead.assignedAgent
            ? {
                id: lead.assignedAgent.id,
                name: agentName.charAt(0).toUpperCase() + agentName.slice(1),
                email: lead.assignedAgent.email,
              }
            : null,
          intakeSession: lead.intakeSession,
        };
      })
      .filter((lead) => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return (
          lead.customer.displayName.toLowerCase().includes(q) ||
          lead.customer.phone.includes(q) ||
          lead.source.toLowerCase().includes(q) ||
          lead.dealValue.toString().includes(q)
        );
      });

    return NextResponse.json(formatted);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unauthorized';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { tenantId, role, userId } = await getTenantContext();
    const db = getTenantPrisma(tenantId, role);

    const { displayName, phone, source, dealValue, agentId } = await req.json();

    if (!displayName || !phone || !source) {
      return NextResponse.json({ error: 'displayName, phone, and source are required.' }, { status: 400 });
    }

    // Encrypt phone number for privacy
    const encryptedPhone = encrypt(phone);

    // Check if customer already exists for this tenant
    const allCustomers = await db.customer.findMany({ where: { tenantId } });
    let customer = allCustomers.find((c) => {
      if (c.primaryPhone === phone || c.primaryPhone === encryptedPhone) return true;
      try {
        return decrypt(c.primaryPhone) === phone;
      } catch {
        return false;
      }
    });

    if (!customer) {
      customer = await db.customer.create({
        data: {
          tenantId,
          displayName,
          primaryPhone: encryptedPhone,
          otpVerified: true,
        },
      });
    }

    // Create the lead record (stored in cents)
    const budgetMaxCents = dealValue ? Math.round(parseFloat(dealValue) * 100) : 150000; // Default $1500
    const lead = await db.lead.create({
      data: {
        tenantId,
        customerId: customer.id,
        status: 'NEW',
        source,
        intakeBudgetMax: budgetMaxCents,
        assignedAgentId: agentId || null,
      },
    });

    // Write to audit logs safely (resolving a valid tenant user if userId is null)
    let auditUserId: string | undefined = userId;
    if (!auditUserId) {
      const tenantUser = await db.user.findFirst({ where: { tenantId } });
      if (tenantUser) auditUserId = tenantUser.id;
    }

    if (auditUserId) {
      await db.auditLog.create({
        data: {
          userId: auditUserId,
          tenantId,
          action: 'LEAD_CREATED',
          metadata: { leadId: lead.id, customerName: displayName },
        },
      });
    }

    return NextResponse.json({ success: true, leadId: lead.id, customerId: customer.id });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to create lead';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const { tenantId, role, userId } = await getTenantContext();
    const db = getTenantPrisma(tenantId, role);

    const { leadId, status, lostReason } = await req.json();

    if (!leadId || !status) {
      return NextResponse.json({ error: 'leadId and status are required' }, { status: 400 });
    }

    // Update lead stage in DB
    const updated = await db.lead.update({
      where: { id: leadId, tenantId },
      data: {
        status,
        lostReason: status === 'LOST' ? lostReason || 'No reason specified' : null,
      },
    });

    // Write audit log entry safely
    let auditUserId: string | undefined = userId;
    if (!auditUserId) {
      const tenantUser = await db.user.findFirst({ where: { tenantId } });
      if (tenantUser) auditUserId = tenantUser.id;
    }

    if (auditUserId) {
      await db.auditLog.create({
        data: {
          userId: auditUserId,
          tenantId,
          action: 'LEAD_STAGE_UPDATED',
          metadata: { leadId, previousStatus: updated.status, currentStatus: status },
        },
      });
    }

    return NextResponse.json({ success: true, lead: updated });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to update lead status';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
