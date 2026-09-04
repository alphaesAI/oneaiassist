import { prisma, getTenantPrisma } from '../../lib/db';
import { CustomerIdentityResolution } from './types';

export function normalizePhoneNumber(rawPhone: string): string {
  if (!rawPhone) return '';
  // Strip all non-numeric characters except leading +
  let cleaned = rawPhone.trim().replace(/[^\d+]/g, '');
  if (!cleaned.startsWith('+')) {
    // If it has 10 digits (US format without country code), prepend +1
    if (cleaned.length === 10) {
      cleaned = '+1' + cleaned;
    } else if (cleaned.length === 11 && cleaned.startsWith('1')) {
      cleaned = '+' + cleaned;
    } else {
      cleaned = '+' + cleaned;
    }
  }
  return cleaned;
}

export class IdentityResolver {
  /**
   * Resolves customer identity from normalized phone number.
   * Classifies into: PRIMARY_POLICYHOLDER, DEPENDENT, or PROSPECT.
   */
  static async resolve(tenantId: string, rawPhone: string): Promise<CustomerIdentityResolution> {
    const normalized = normalizePhoneNumber(rawPhone);
    const digitsOnly = normalized.replace(/\D/g, '');
    const db = getTenantPrisma(tenantId, 'ADMIN');

    // 1. Search for customer via primaryPhone or CustomerChannel
    let customer = await db.customer.findFirst({
      where: {
        tenantId,
        OR: [
          { primaryPhone: normalized },
          { primaryPhone: digitsOnly },
          {
            customerChannels: {
              some: {
                tenantId,
                channelIdentifier: { in: [normalized, digitsOnly, rawPhone] },
              },
            },
          },
        ],
      },
      include: {
        primaryCustomer: {
          include: {
            policies: true,
          },
        },
        policies: true,
        intakeSessions: {
          where: { isComplete: false },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        leads: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    // 2. Case A: Customer not found -> PROSPECT
    if (!customer) {
      return {
        type: 'PROSPECT',
        normalizedPhone: normalized,
        displayName: 'Prospective Client',
        policies: [],
        intakeSession: null,
      };
    }

    // 3. Case B: Customer is a DEPENDENT (primaryCustomerId is set)
    if (customer.primaryCustomerId) {
      const primary =
        customer.primaryCustomer ||
        (await db.customer.findUnique({
          where: { id: customer.primaryCustomerId },
          include: { policies: true },
        }));

      const familyPolicies =
        primary?.policies && primary.policies.length > 0
          ? primary.policies
          : await db.policy.findMany({ where: { customerId: customer.primaryCustomerId } });

      return {
        type: 'DEPENDENT',
        customer,
        primaryCustomer: primary || undefined,
        leadId: customer.leads?.[0]?.id,
        policies: familyPolicies,
        intakeSession: customer.intakeSessions?.[0] || null,
        normalizedPhone: normalized,
        displayName: customer.displayName || 'Family Member',
      };
    }

    // Fetch customer's own policies
    const customerPolicies =
      customer.policies && customer.policies.length > 0
        ? customer.policies
        : await db.policy.findMany({ where: { customerId: customer.id } });

    // 4. Case C: Customer has active policies -> PRIMARY_POLICYHOLDER
    if (customerPolicies.length > 0) {
      return {
        type: 'PRIMARY_POLICYHOLDER',
        customer,
        leadId: customer.leads?.[0]?.id,
        policies: customerPolicies,
        intakeSession: customer.intakeSessions?.[0] || null,
        normalizedPhone: normalized,
        displayName: customer.displayName || 'Valued Policyholder',
      };
    }

    // 5. Case D: Customer exists in CRM but has no active policies -> PROSPECT / LEAD
    return {
      type: 'PROSPECT',
      customer,
      leadId: customer.leads?.[0]?.id,
      policies: [],
      intakeSession: customer.intakeSessions?.[0] || null,
      normalizedPhone: normalized,
      displayName: customer.displayName || 'Prospective Client',
    };
  }
}
