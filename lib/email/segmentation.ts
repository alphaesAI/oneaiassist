import { getTenantPrisma, prisma } from '@/lib/db';

export type RuleCondition = 'AND' | 'OR';

export interface TagRule {
  field: 'tag';
  operator: 'equals' | 'not_equals' | 'contains' | 'in' | 'not_in';
  value: string | string[];
}

export interface ListRule {
  field: 'list';
  operator: 'in' | 'not_in';
  value: string | string[]; // listId or array of listIds
}

export interface CustomFieldRule {
  field: 'custom_field';
  key: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'gt' | 'gte' | 'lt' | 'lte' | 'exists' | 'not_exists';
  value?: any;
}

export interface ConsentRule {
  field: 'consent';
  operator: 'equals' | 'not_equals' | 'in';
  value: string | string[];
}

export interface ActivityRule {
  field: 'activity';
  activityType: 'OPENED_LAST_N_DAYS' | 'CLICKED_CAMPAIGN' | 'NEVER_OPENED' | 'NEVER_BOUNCED';
  days?: number;
  campaignId?: string;
}

export type SegmentRule = TagRule | ListRule | CustomFieldRule | ConsentRule | ActivityRule;

export interface SegmentRuleGroup {
  condition: RuleCondition; // 'AND' | 'OR'
  rules: Array<SegmentRule | SegmentRuleGroup>;
}

export interface UnifiedSegmentFilter {
  type: 'all' | 'tag' | 'stage' | 'date_range' | 'email_engagement' | 'channel_consent' | 'rules';
  value?: any;
  emailActivity?: 'OPENED_LAST_30_DAYS' | 'CLICKED_ANY' | 'NEVER_BOUNCED';
  channelConsent?: 'EMAIL_SUBSCRIBED' | 'WHATSAPP_OPTED_IN';
  rules?: SegmentRuleGroup;
}

export class SegmentationService {
  /**
   * Helper to check if an object is a SegmentRuleGroup.
   */
  static isRuleGroup(obj: any): obj is SegmentRuleGroup {
    return Boolean(obj && typeof obj === 'object' && ('condition' in obj) && Array.isArray(obj.rules));
  }

  /**
   * Compiles a single SegmentRule into a Prisma filter condition.
   */
  static compileSingleRule(rule: SegmentRule, tenantId: string): any {
    switch (rule.field) {
      case 'tag': {
        const rawVals = Array.isArray(rule.value) ? rule.value : [rule.value];
        const variants = Array.from(new Set(
          rawVals.flatMap((v) => {
            const str = String(v).trim();
            return [
              str,
              str.toUpperCase(),
              str.toLowerCase(),
              str.charAt(0).toUpperCase() + str.slice(1).toLowerCase(),
            ];
          })
        ));

        if (rule.operator === 'not_in' || rule.operator === 'not_equals') {
          return { NOT: { tags: { hasSome: variants } } };
        }
        return { tags: { hasSome: variants } };
      }

      case 'list': {
        const listIds = Array.isArray(rule.value) ? rule.value : [rule.value];
        if (rule.operator === 'not_in') {
          return {
            listMemberships: {
              none: { listId: { in: listIds }, tenantId },
            },
          };
        }
        return {
          listMemberships: {
            some: { listId: { in: listIds }, tenantId },
          },
        };
      }

      case 'custom_field': {
        const key = rule.key;
        if (!key) return {};

        if (rule.operator === 'exists') {
          return {
            NOT: {
              customFields: {
                path: [key],
                equals: null,
              },
            },
          };
        }

        if (rule.operator === 'not_exists') {
          return {
            OR: [
              { customFields: { equals: {} } },
              { customFields: { path: [key], equals: null } },
            ],
          };
        }

        if (rule.operator === 'equals') {
          return { customFields: { path: [key], equals: rule.value } };
        }

        if (rule.operator === 'not_equals') {
          return {
            NOT: {
              customFields: { path: [key], equals: rule.value },
            },
          };
        }

        if (rule.operator === 'contains') {
          return {
            customFields: { path: [key], string_contains: String(rule.value) },
          };
        }

        if (rule.operator === 'gt') {
          return { customFields: { path: [key], gt: rule.value } };
        }
        if (rule.operator === 'gte') {
          return { customFields: { path: [key], gte: rule.value } };
        }
        if (rule.operator === 'lt') {
          return { customFields: { path: [key], lt: rule.value } };
        }
        if (rule.operator === 'lte') {
          return { customFields: { path: [key], lte: rule.value } };
        }

        return {};
      }

      case 'consent': {
        const vals = Array.isArray(rule.value) ? rule.value : [rule.value];
        if (rule.operator === 'not_equals') {
          return { emailConsentStatus: { notIn: vals as any } };
        }
        if (rule.operator === 'in') {
          return { emailConsentStatus: { in: vals as any } };
        }
        return { emailConsentStatus: vals[0] as any };
      }

      case 'activity': {
        if (rule.activityType === 'OPENED_LAST_N_DAYS') {
          const days = Math.max(1, Number(rule.days || 30));
          const dateThreshold = new Date();
          dateThreshold.setDate(dateThreshold.getDate() - days);
          return {
            emailEvents: {
              some: {
                eventType: 'OPEN',
                createdAt: { gte: dateThreshold },
              },
            },
          };
        }

        if (rule.activityType === 'CLICKED_CAMPAIGN') {
          return {
            emailEvents: {
              some: {
                eventType: 'CLICK',
                ...(rule.campaignId ? { campaignId: rule.campaignId } : {}),
              },
            },
          };
        }

        if (rule.activityType === 'NEVER_OPENED') {
          return {
            emailEvents: {
              none: {
                eventType: 'OPEN',
              },
            },
          };
        }

        if (rule.activityType === 'NEVER_BOUNCED') {
          return {
            emailEvents: {
              none: {
                eventType: { in: ['BOUNCE_HARD', 'BOUNCE_SOFT'] },
              },
            },
          };
        }

        return {};
      }

      default:
        return {};
    }
  }

  /**
   * Recursively compiles a SegmentRuleGroup into a Prisma query object.
   */
  static compileRuleGroup(group: SegmentRuleGroup, tenantId: string): any {
    if (!group.rules || group.rules.length === 0) {
      return {};
    }

    const compiledRules = group.rules
      .map((r) => {
        if (SegmentationService.isRuleGroup(r)) {
          return SegmentationService.compileRuleGroup(r, tenantId);
        }
        return SegmentationService.compileSingleRule(r, tenantId);
      })
      .filter((c) => Object.keys(c).length > 0);

    if (compiledRules.length === 0) return {};
    if (compiledRules.length === 1) return compiledRules[0];

    if (group.condition === 'OR') {
      return { OR: compiledRules };
    }
    return { AND: compiledRules };
  }

  /**
   * Builds a unified Prisma `where` clause that applies to WhatsApp, Instagram, and Email.
   * Supports both legacy UnifiedSegmentFilter and modern SegmentRuleGroup.
   */
  static async buildUnifiedCustomerFilter(
    tenantId: string,
    filterOrGroup: UnifiedSegmentFilter | SegmentRuleGroup,
    targetChannel: 'EMAIL' | 'WHATSAPP' | 'INSTAGRAM' = 'EMAIL'
  ): Promise<any> {
    const where: any = { tenantId, optedOutAt: null };

    // 1. Channel Consent Requirements
    if (targetChannel === 'EMAIL') {
      where.email = { not: null };
      where.emailConsentStatus = 'SUBSCRIBED';
    } else if (targetChannel === 'WHATSAPP') {
      where.primaryPhone = { not: '' };
      where.optedIn = true;
    }

    // 2. Modern SegmentRuleGroup
    if (SegmentationService.isRuleGroup(filterOrGroup)) {
      const groupWhere = SegmentationService.compileRuleGroup(filterOrGroup, tenantId);
      if (Object.keys(groupWhere).length > 0) {
        where.AND = [groupWhere];
      }
      return where;
    }

    // 3. Nested rules within legacy filter
    if (filterOrGroup.rules && SegmentationService.isRuleGroup(filterOrGroup.rules)) {
      const groupWhere = SegmentationService.compileRuleGroup(filterOrGroup.rules, tenantId);
      if (Object.keys(groupWhere).length > 0) {
        where.AND = [groupWhere];
      }
      return where;
    }

    // 4. Legacy UnifiedSegmentFilter (Tags, Stage, Date Range)
    const filter = filterOrGroup as UnifiedSegmentFilter;
    if (filter.type === 'tag' && filter.value) {
      const v = String(filter.value).trim();
      const variants = Array.from(new Set([
        v,
        v.toUpperCase(),
        v.toLowerCase(),
        v.charAt(0).toUpperCase() + v.slice(1).toLowerCase(),
      ]));
      where.tags = { hasSome: variants };
    } else if (filter.type === 'stage' && filter.value) {
      where.leads = {
        some: {
          status: filter.value,
        },
      };
    } else if (filter.type === 'date_range' && filter.value) {
      const { start, end } = typeof filter.value === 'object' ? filter.value : { start: '', end: '' };
      let gte: Date | undefined;
      let lte: Date | undefined;
      if (start && start.trim()) gte = new Date(start.includes('T') ? start : `${start}T00:00:00`);
      if (end && end.trim()) lte = new Date(end.includes('T') ? end : `${end}T23:59:59.999`);
      if (gte || lte) {
        const dateCond: any = {};
        if (gte) dateCond.gte = gte;
        if (lte) dateCond.lte = lte;
        where.createdAt = dateCond;
      }
    }

    // 5. Email-specific behavioral filters
    if (filter.emailActivity) {
      if (filter.emailActivity === 'OPENED_LAST_30_DAYS') {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        where.emailEvents = {
          some: {
            eventType: 'OPEN',
            createdAt: { gte: thirtyDaysAgo },
          },
        };
      } else if (filter.emailActivity === 'CLICKED_ANY') {
        where.emailEvents = {
          some: {
            eventType: 'CLICK',
          },
        };
      } else if (filter.emailActivity === 'NEVER_BOUNCED') {
        where.emailEvents = {
          none: {
            eventType: { in: ['BOUNCE_HARD', 'BOUNCE_SOFT'] },
          },
        };
      }
    }

    return where;
  }

  /**
   * Preview total audience count and opted-out count for a given filter or rule group.
   */
  static async countSegmentAudience(
    tenantId: string,
    filterOrGroup: UnifiedSegmentFilter | SegmentRuleGroup,
    targetChannel: 'EMAIL' | 'WHATSAPP' | 'INSTAGRAM' = 'EMAIL',
    client?: any
  ): Promise<{ audienceCount: number; optedOutCount: number }> {
    const db = client || getTenantPrisma(tenantId, 'ADMIN');
    const where = await this.buildUnifiedCustomerFilter(tenantId, filterOrGroup, targetChannel);

    const audienceCount = await db.customer.count({ where });

    let optedOutWhere: any = { tenantId };
    if (targetChannel === 'EMAIL') {
      optedOutWhere.OR = [
        { emailConsentStatus: { in: ['UNSUBSCRIBED', 'BOUNCED', 'COMPLAINED'] } },
        { NOT: { optedOutAt: null } },
      ];
    } else {
      optedOutWhere.NOT = { optedOutAt: null };
    }

    const optedOutCount = await db.customer.count({ where: optedOutWhere });

    return { audienceCount, optedOutCount };
  }
}

