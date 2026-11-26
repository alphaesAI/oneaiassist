import { Prisma, type JourneyTriggerType } from '@prisma/client';
import { prisma } from '@/lib/db';
import { EmailSuppressionService } from '@/lib/email/suppression';
import { sendWhatsAppMessage } from '@/lib/whatsapp';

export type JourneyStepType =
  | 'SEND_EMAIL'
  | 'SEND_WHATSAPP'
  | 'SEND_INSTAGRAM'
  | 'WAIT_DELAY'
  | 'BRANCH_CONDITION'
  | 'ADD_TAG'
  | 'REMOVE_TAG'
  | 'UPDATE_ATTRIBUTE'
  | 'HANDOFF_TO_HUMAN';

export interface JourneyStepDefinition {
  id: string;
  type: JourneyStepType;
  channel?: 'EMAIL' | 'WHATSAPP' | 'INSTAGRAM';
  templateId?: string;
  templateName?: string;
  subject?: string;
  delayHours?: number;
  conditionType?: 'WHATSAPP_UNREAD_24H' | 'EMAIL_CLICKED' | 'TAG_PRESENT';
  conditionValue?: string;
  onTrueStepIndex?: number;
  onFalseStepIndex?: number;
  tagName?: string;
  attributeKey?: string;
  attributeValue?: string;
}

export const JOURNEY_BACKOFF_MS = [
  60_000,         // 1 min
  5 * 60_000,     // 5 min
  30 * 60_000,    // 30 min
  2 * 3600_000,   // 2 hours
];

export const MAX_STEP_ATTEMPTS = 3;

/** How long to wait before looking again at an enrollment whose journey is paused. */
export const JOURNEY_INACTIVE_RECHECK_MS = 10 * 60_000;

/** BroadcastCampaign.kind value for the container of one journey email step. */
export const JOURNEY_CAMPAIGN_KIND = 'JOURNEY';

function isValidTimeZone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export class CrossChannelJourneyEngine {
  /**
   * Determine whether current time falls within configured quiet hours
   * evaluated in the tenant's configured time zone (defaults to UTC).
   */
  static isWithinQuietHours(
    quietHoursStart?: string | null,
    quietHoursEnd?: string | null,
    date: Date = new Date(),
    timeZone: string = 'UTC'
  ): { inQuietHours: boolean; resumeAt?: Date } {
    if (!quietHoursStart || !quietHoursEnd) {
      return { inQuietHours: false };
    }

    const [startH, startM] = quietHoursStart.split(':').map(Number);
    const [endH, endM] = quietHoursEnd.split(':').map(Number);

    const validTz = isValidTimeZone(timeZone) ? timeZone : 'UTC';

    // Format hours and minutes in the tenant's timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: validTz,
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    });

    const parts = formatter.formatToParts(date);
    const hStr = parts.find((p) => p.type === 'hour')?.value ?? String(date.getUTCHours());
    const mStr = parts.find((p) => p.type === 'minute')?.value ?? String(date.getUTCMinutes());

    const currentH = Number(hStr) % 24;
    const currentM = Number(mStr);
    const currentMinutes = currentH * 60 + currentM;
    const startMinutes = startH * 60 + (startM || 0);
    const endMinutes = endH * 60 + (endM || 0);

    let inQuietHours = false;
    if (startMinutes > endMinutes) {
      // Overnight quiet hours, e.g. 21:00 to 08:00
      inQuietHours = currentMinutes >= startMinutes || currentMinutes < endMinutes;
    } else {
      // Daytime quiet hours, e.g. 13:00 to 15:00
      inQuietHours = currentMinutes >= startMinutes && currentMinutes < endMinutes;
    }

    if (!inQuietHours) {
      return { inQuietHours: false };
    }

    // Compute resumeAt time: minutes until endMinutes in tenant timezone
    let minutesUntilEnd = 0;
    if (currentMinutes < endMinutes) {
      minutesUntilEnd = endMinutes - currentMinutes;
    } else {
      minutesUntilEnd = 1440 - currentMinutes + endMinutes;
    }

    const resumeAt = new Date(date.getTime() + minutesUntilEnd * 60_000);
    return { inQuietHours: true, resumeAt };
  }

  /**
   * Handles external events and enrolls eligible contacts into matching ACTIVE journeys.
   */
  static async handleTrigger(
    tenantId: string,
    triggerType: JourneyTriggerType,
    payload: {
      customerId: string;
      tag?: string;
      listId?: string;
      formId?: string;
      campaignId?: string;
      url?: string;
    }
  ): Promise<{ enrolledCount: number; journeyIds: string[] }> {
    const activeJourneys = await prisma.crossChannelJourney.findMany({
      where: {
        tenantId,
        status: 'ACTIVE',
        triggerType,
      },
    });

    let enrolledCount = 0;
    const journeyIds: string[] = [];

    for (const journey of activeJourneys) {
      const config = (journey.triggerConfig as Record<string, any>) || {};

      // Match trigger-specific criteria
      if (triggerType === 'TAG_ADDED' && config.tag && config.tag !== payload.tag) {
        continue;
      }
      if (triggerType === 'FORM_SUBMITTED' && config.formId && config.formId !== payload.formId) {
        continue;
      }
      if (triggerType === 'LIST_JOINED' && config.listId && config.listId !== payload.listId) {
        continue;
      }
      if (
        (triggerType === 'EMAIL_OPENED' || triggerType === 'EMAIL_LINK_CLICKED') &&
        config.campaignId &&
        config.campaignId !== payload.campaignId
      ) {
        continue;
      }

      // An event may repeat many times (every open, every click). A contact goes through a
      // journey once per trigger; only a manual enrollment can send them through it again.
      const res = await this.enrollCustomer(tenantId, journey.id, payload.customerId, new Date(), {
        allowReEnroll: false,
      });
      if (res.success) {
        enrolledCount++;
        journeyIds.push(journey.id);
      }
    }

    return { enrolledCount, journeyIds };
  }

  /**
   * Enrolls a customer into an active cross-channel journey.
   */
  static async enrollCustomer(
    tenantId: string,
    journeyId: string,
    customerId: string,
    now: Date = new Date(),
    opts: { allowReEnroll?: boolean } = {}
  ): Promise<{ success: boolean; enrollmentId?: string; reason?: string }> {
    const allowReEnroll = opts.allowReEnroll ?? true;
    const [journey, tenant] = await Promise.all([
      prisma.crossChannelJourney.findUnique({
        where: { id: journeyId, tenantId },
      }),
      prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { id: true, timeZone: true },
      }),
    ]);

    if (!journey || journey.status !== 'ACTIVE') {
      return { success: false, reason: 'Journey is not active or does not exist.' };
    }

    // Check if customer already enrolled and active
    const existing = await prisma.journeyEnrollment.findUnique({
      where: {
        journeyId_customerId: { journeyId, customerId },
      },
    });

    if (existing && existing.status === 'IN_PROGRESS') {
      return { success: false, reason: 'Customer is already active in this journey.' };
    }
    if (existing && !allowReEnroll) {
      return { success: false, reason: 'Customer has already been through this journey.' };
    }

    const customer = await prisma.customer.findUnique({
      where: { id: customerId, tenantId },
    });

    if (!customer) {
      return { success: false, reason: 'Customer not found.' };
    }

    // Check frequency cap across all channels
    if (journey.frequencyCapDays > 0) {
      const minContactInterval = journey.frequencyCapDays * 24 * 3600_000;
      const recentContact = await prisma.journeyEnrollment.findFirst({
        where: {
          tenantId,
          customerId,
          lastContactedAt: { gte: new Date(now.getTime() - minContactInterval) },
        },
      });

      if (recentContact) {
        return {
          success: false,
          reason: `Frequency cap exceeded: Contacted within ${journey.frequencyCapDays} days across channels.`,
        };
      }
    }

    // Compute initial execution time taking quiet hours in tenant timezone into account
    let nextExecutionAt = now;
    const quietCheck = this.isWithinQuietHours(
      journey.quietHoursStart,
      journey.quietHoursEnd,
      nextExecutionAt,
      tenant?.timeZone || 'UTC'
    );
    if (quietCheck.inQuietHours && quietCheck.resumeAt) {
      nextExecutionAt = quietCheck.resumeAt;
    }

    const enrollment = await prisma.journeyEnrollment.upsert({
      where: {
        journeyId_customerId: { journeyId, customerId },
      },
      create: {
        tenantId,
        journeyId,
        customerId,
        currentStepIndex: 0,
        status: 'IN_PROGRESS',
        nextExecutionAt,
        enrolledAt: now,
        attempts: 0,
        lockedAt: null,
        lockedBy: null,
        logs: [
          {
            event: 'ENROLLED',
            timestamp: now.toISOString(),
            journeyName: journey.name,
          },
        ],
      },
      update: {
        currentStepIndex: 0,
        status: 'IN_PROGRESS',
        nextExecutionAt,
        enrolledAt: now,
        attempts: 0,
        lastError: null,
        lockedAt: null,
        lockedBy: null,
        logs: [
          {
            event: 'RE_ENROLLED',
            timestamp: now.toISOString(),
            journeyName: journey.name,
          },
        ],
      },
    });

    await prisma.crossChannelJourney.update({
      where: { id: journeyId, tenantId },
      data: { enrolledCount: { increment: 1 } },
    });

    return { success: true, enrollmentId: enrollment.id };
  }

  /**
   * Queues one journey email for one contact through the E1 sending queue.
   *
   * Each email step of a journey has its own BroadcastCampaign row of kind "JOURNEY". It carries
   * that step's template and subject, and collects that step's opens, clicks and bounces, so every
   * email of an automation gets its own report. The worker never builds an audience for a JOURNEY
   * campaign: the only jobs it has are the ones created here, one contact at a time.
   */
  static async enqueueJourneyEmail(params: {
    tenantId: string;
    journeyId: string;
    journeyName: string;
    stepKey: string;
    stepNumber: number;
    templateId?: string;
    subject?: string;
    customerId: string;
    recipient: string;
    enrolledAt: Date;
    now: Date;
  }): Promise<{ campaignId: string; jobId: string | null }> {
    const { tenantId, journeyId, stepKey, customerId, now } = params;

    if (!params.templateId) {
      throw new Error('This email step has no template selected. Edit the automation and choose an email template.');
    }
    const template = await prisma.template.findFirst({
      where: { id: params.templateId, tenantId, channel: 'EMAIL' },
      select: { id: true, name: true, subject: true },
    });
    if (!template) {
      throw new Error('The email template chosen for this step no longer exists. Edit the automation and choose another template.');
    }

    const subject = (params.subject || template.subject || template.name).trim();
    const name = `[Automation] ${params.journeyName} · Email ${params.stepNumber}`;
    const where = { tenantId, kind: JOURNEY_CAMPAIGN_KIND, journeyId, journeyStepId: stepKey };

    let campaign = await prisma.broadcastCampaign.findFirst({ where });
    if (!campaign) {
      try {
        campaign = await prisma.broadcastCampaign.create({
          data: {
            tenantId,
            name,
            channel: 'EMAIL',
            kind: JOURNEY_CAMPAIGN_KIND,
            journeyId,
            journeyStepId: stepKey,
            templateId: template.id,
            subject,
            status: 'SENDING',
            startedAt: now,
            // Marks the audience as already decided, so nothing can ever build one for this row.
            audienceBuiltAt: now,
          },
        });
      } catch (err) {
        // Another worker created the same step campaign a moment ago.
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          campaign = await prisma.broadcastCampaign.findFirst({ where });
        } else {
          throw err;
        }
      }
    }
    if (!campaign) {
      throw new Error('Could not prepare the email step for sending.');
    }

    // Keep the container in step with the journey definition (template or subject edited, journey renamed).
    // A step campaign someone paused stays paused; any other state must be SENDING for the worker to pick jobs up.
    const nextStatus = campaign.status === 'PAUSED' ? 'PAUSED' : 'SENDING';
    if (
      campaign.templateId !== template.id ||
      campaign.subject !== subject ||
      campaign.name !== name ||
      campaign.status !== nextStatus
    ) {
      campaign = await prisma.broadcastCampaign.update({
        where: { id: campaign.id },
        data: { templateId: template.id, subject, name, status: nextStatus, completedAt: null, lastError: null },
      });
    }

    const jobKey = { campaignId_customerId: { campaignId: campaign.id, customerId } };
    const existing = await prisma.broadcastJob.findUnique({ where: jobKey });

    if (existing) {
      // Same run of the journey (a retried step): the email is already queued or sent, do nothing.
      // A finished job from an earlier run (the contact was manually re-enrolled): send it again.
      const fromEarlierRun = Boolean(existing.processedAt && existing.processedAt < params.enrolledAt);
      if (fromEarlierRun && existing.status !== 'PENDING' && existing.status !== 'PROCESSING') {
        await prisma.broadcastJob.update({
          where: { id: existing.id },
          data: {
            status: 'PENDING',
            recipient: params.recipient,
            attempts: 0,
            scheduledFor: now,
            processedAt: null,
            providerMessageId: null,
            lastError: null,
            lockedAt: null,
            lockedBy: null,
          },
        });
      }
      return { campaignId: campaign.id, jobId: existing.id };
    }

    try {
      const job = await prisma.broadcastJob.create({
        data: {
          tenantId,
          campaignId: campaign.id,
          customerId,
          recipient: params.recipient.trim().toLowerCase(),
          channel: 'EMAIL',
          status: 'PENDING',
          scheduledFor: now,
        },
        select: { id: true },
      });
      return { campaignId: campaign.id, jobId: job.id };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return { campaignId: campaign.id, jobId: null };
      }
      throw err;
    }
  }

  /**
   * Executes the next pending step for an enrollment with:
   * - Validated branch targets
   * - E1 queue dispatch for email steps
   * - Attempt caps (3) and exponential backoff on failure
   * - Exit conditions (opted out, bounced, converted)
   */
  static async executeStep(
    tenantId: string,
    enrollmentId: string,
    deps: { now?: () => Date; workerId?: string } = {}
  ): Promise<{ status: string; message: string }> {
    const nowFn = deps.now || (() => new Date());
    const now = nowFn();

    const enrollment = await prisma.journeyEnrollment.findUnique({
      where: { id: enrollmentId, tenantId },
      include: {
        journey: true,
        customer: {
          include: {
            leads: true,
            emailEvents: { orderBy: { createdAt: 'desc' }, take: 10 },
          },
        },
      },
    });

    if (!enrollment || enrollment.status !== 'IN_PROGRESS') {
      await prisma.journeyEnrollment.updateMany({
        where: { id: enrollmentId, tenantId },
        data: { lockedAt: null, lockedBy: null },
      });
      return { status: 'SKIPPED', message: 'Enrollment is not in progress.' };
    }

    const { journey, customer } = enrollment;
    const steps = (journey.steps as unknown as JourneyStepDefinition[]) || [];

    // 0. A paused or draft journey sends nothing. The enrollment keeps its place and is
    //    looked at again later, so resuming the journey continues where each contact stopped.
    if (journey.status !== 'ACTIVE') {
      const retryAt = new Date(now.getTime() + JOURNEY_INACTIVE_RECHECK_MS);
      await prisma.journeyEnrollment.update({
        where: { id: enrollmentId, tenantId },
        data: { nextExecutionAt: retryAt, lockedAt: null, lockedBy: null },
      });
      return { status: 'POSTPONED', message: `Journey is ${journey.status}; nothing sent.` };
    }

    // 1. Exit Conditions Check
    if (customer.optedOutAt || customer.emailConsentStatus === 'UNSUBSCRIBED') {
      await prisma.journeyEnrollment.update({
        where: { id: enrollmentId, tenantId },
        data: { status: 'EXITED_UNSUBSCRIBED', lockedAt: null, lockedBy: null },
      });
      return { status: 'EXITED', message: 'Contact opted out/unsubscribed.' };
    }

    // Check bounce suppression
    if (customer.email) {
      const suppression = await EmailSuppressionService.isEmailSuppressed(tenantId, customer.email);
      if (suppression.suppressed) {
        await prisma.journeyEnrollment.update({
          where: { id: enrollmentId, tenantId },
          data: { status: 'EXITED_BOUNCED', lockedAt: null, lockedBy: null },
        });
        return { status: 'EXITED', message: `Contact email suppressed (${suppression.reason}).` };
      }
    }

    const exitConditions = (journey.exitConditions as string[]) || [];
    if (exitConditions.includes('CONVERTED')) {
      const isConverted = customer.leads?.some((l) => l.status === 'CONVERTED');
      if (isConverted) {
        await prisma.journeyEnrollment.update({
          where: { id: enrollmentId, tenantId },
          data: { status: 'EXITED_CONVERTED', lockedAt: null, lockedBy: null },
        });
        return { status: 'EXITED', message: 'Customer converted to policyholder.' };
      }
    }

    // 2. Load tenant for timeZone quiet hours check
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { timeZone: true },
    });

    const quietCheck = this.isWithinQuietHours(
      journey.quietHoursStart,
      journey.quietHoursEnd,
      now,
      tenant?.timeZone || 'UTC'
    );
    if (quietCheck.inQuietHours && quietCheck.resumeAt) {
      await prisma.journeyEnrollment.update({
        where: { id: enrollmentId, tenantId },
        data: { nextExecutionAt: quietCheck.resumeAt, lockedAt: null, lockedBy: null },
      });
      return {
        status: 'POSTPONED',
        message: `Postponed until ${quietCheck.resumeAt.toISOString()} due to quiet hours window.`,
      };
    }

    // 3. Completion Check
    if (enrollment.currentStepIndex >= steps.length) {
      await prisma.journeyEnrollment.update({
        where: { id: enrollmentId, tenantId },
        data: { status: 'COMPLETED', lockedAt: null, lockedBy: null },
      });
      await prisma.crossChannelJourney.update({
        where: { id: journey.id, tenantId },
        data: { completedCount: { increment: 1 } },
      });
      return { status: 'COMPLETED', message: 'Journey completed all steps.' };
    }

    const step = steps[enrollment.currentStepIndex];
    let nextIndex = enrollment.currentStepIndex + 1;
    let nextExecution: Date | null = now;
    let stepResultDetails: any = {};

    try {
      // 4. Step Execution
      switch (step.type) {
        case 'SEND_EMAIL': {
          if (!customer.email || customer.emailConsentStatus !== 'SUBSCRIBED') {
            stepResultDetails = { skipped: true, reason: 'No subscribed email address' };
            break;
          }

          const stepKey = step.id || `index_${enrollment.currentStepIndex}`;
          const { campaignId: stepCampaignId } = await this.enqueueJourneyEmail({
            tenantId,
            journeyId: journey.id,
            journeyName: journey.name,
            stepKey,
            stepNumber: enrollment.currentStepIndex + 1,
            templateId: step.templateId,
            subject: step.subject,
            customerId: customer.id,
            recipient: customer.email,
            enrolledAt: enrollment.enrolledAt,
            now,
          });

          stepResultDetails = {
            channel: 'EMAIL',
            enqueuedToE1: true,
            campaignId: stepCampaignId,
            recipient: customer.email,
          };
          break;
        }

        case 'SEND_WHATSAPP': {
          if (!customer.primaryPhone || !customer.optedIn) {
            stepResultDetails = { skipped: true, reason: 'Customer has not opted in to WhatsApp' };
            break;
          }

          // The message is the tenant's own saved template. Nothing is invented here:
          // a step without a real template fails with a clear error instead of sending filler text.
          if (!step.templateId && !step.templateName) {
            throw new Error('This WhatsApp step has no template selected. Edit the automation and choose a WhatsApp template.');
          }
          const waTemplate = await prisma.template.findFirst({
            where: {
              tenantId,
              channel: 'WHATSAPP',
              ...(step.templateId ? { id: step.templateId } : { name: step.templateName }),
            },
            select: { body: true, header: true, footer: true },
          });
          if (!waTemplate || !waTemplate.body.trim()) {
            throw new Error(
              `WhatsApp template "${step.templateName || step.templateId}" was not found for this organization. Create it under Templates or choose another one.`
            );
          }
          const firstName = customer.displayName.split(' ')[0] || customer.displayName;
          const fill = (text: string) =>
            text
              .replace(/\{\{\s*name\s*\}\}/gi, customer.displayName)
              .replace(/\{\{\s*first_name\s*\}\}/gi, firstName);
          const messageText = [
            waTemplate.header ? `*${fill(waTemplate.header)}*` : '',
            fill(waTemplate.body),
            waTemplate.footer ? fill(waTemplate.footer) : '',
          ]
            .filter(Boolean)
            .join('\n\n');

          await sendWhatsAppMessage({
            tenantId,
            customerId: customer.id,
            text: messageText,
          });

          stepResultDetails = { channel: 'WHATSAPP', sentTo: customer.primaryPhone };
          break;
        }

        case 'WAIT_DELAY': {
          const hours = step.delayHours || 24;
          nextExecution = new Date(now.getTime() + hours * 3600_000);
          stepResultDetails = { delayedHours: hours, resumeAt: nextExecution.toISOString() };
          break;
        }

        case 'BRANCH_CONDITION': {
          // Validated branch targets: indices must be within [0, steps.length]
          const validateTarget = (idx?: number): number => {
            if (typeof idx === 'number' && idx >= 0 && idx <= steps.length) {
              return idx;
            }
            return enrollment.currentStepIndex + 1;
          };

          const trueTarget = validateTarget(step.onTrueStepIndex);
          const falseTarget = validateTarget(step.onFalseStepIndex);

          if (step.conditionType === 'EMAIL_CLICKED') {
            const hasClicked = customer.emailEvents?.some((e) => e.eventType === 'CLICK');
            nextIndex = hasClicked ? trueTarget : falseTarget;
            stepResultDetails = {
              condition: 'EMAIL_CLICKED',
              evaluated: hasClicked,
              routedToStep: nextIndex,
            };
          } else if (step.conditionType === 'TAG_PRESENT' && step.conditionValue) {
            const hasTag = customer.tags.includes(step.conditionValue);
            nextIndex = hasTag ? trueTarget : falseTarget;
            stepResultDetails = {
              condition: 'TAG_PRESENT',
              tag: step.conditionValue,
              evaluated: hasTag,
              routedToStep: nextIndex,
            };
          } else if (step.conditionType === 'WHATSAPP_UNREAD_24H') {
            const recentMsg = await prisma.message.findFirst({
              where: {
                tenantId,
                conversation: { customerId: customer.id },
                channel: 'WHATSAPP',
                direction: 'OUTBOUND',
                createdAt: { gte: new Date(now.getTime() - 24 * 3600_000) },
              },
              orderBy: { createdAt: 'desc' },
            });

            const isRead = recentMsg?.status === 'READ';
            nextIndex = !isRead ? falseTarget : trueTarget;
            stepResultDetails = {
              condition: 'WHATSAPP_UNREAD_24H',
              unread: !isRead,
              routedToStep: nextIndex,
            };
          } else {
            nextIndex = enrollment.currentStepIndex + 1;
          }
          break;
        }

        case 'ADD_TAG': {
          if (step.tagName && !customer.tags.includes(step.tagName)) {
            await prisma.customer.update({
              where: { id: customer.id, tenantId },
              data: { tags: { push: step.tagName } },
            });
            stepResultDetails = { tagAdded: step.tagName };
          }
          break;
        }

        case 'REMOVE_TAG': {
          if (step.tagName) {
            const updatedTags = customer.tags.filter((t) => t !== step.tagName);
            await prisma.customer.update({
              where: { id: customer.id, tenantId },
              data: { tags: updatedTags },
            });
            stepResultDetails = { tagRemoved: step.tagName };
          }
          break;
        }

        case 'UPDATE_ATTRIBUTE': {
          if (step.attributeKey) {
            const customFields = (customer.customFields as Record<string, any>) || {};
            customFields[step.attributeKey] = step.attributeValue ?? '';
            await prisma.customer.update({
              where: { id: customer.id, tenantId },
              data: { customFields },
            });
            stepResultDetails = { attributeUpdated: step.attributeKey, value: step.attributeValue };
          }
          break;
        }

        case 'HANDOFF_TO_HUMAN': {
          await prisma.conversation.updateMany({
            where: { tenantId, customerId: customer.id, status: 'OPEN' },
            data: { status: 'PENDING' },
          });
          stepResultDetails = { handoff: true, reason: 'Escalated to human advisor' };
          break;
        }

        default:
          break;
      }

      // Step succeeded: update enrollment, reset attempts, advance step
      const existingLogs = Array.isArray(enrollment.logs) ? (enrollment.logs as any[]) : [];
      existingLogs.push({
        stepIndex: enrollment.currentStepIndex,
        stepType: step.type,
        executedAt: now.toISOString(),
        details: stepResultDetails,
      });

      const isFinished = nextIndex >= steps.length;
      await prisma.journeyEnrollment.update({
        where: { id: enrollmentId, tenantId },
        data: {
          currentStepIndex: nextIndex,
          status: isFinished ? 'COMPLETED' : 'IN_PROGRESS',
          lastContactedAt:
            step.type === 'SEND_EMAIL' || step.type === 'SEND_WHATSAPP' || step.type === 'SEND_INSTAGRAM'
              ? now
              : enrollment.lastContactedAt,
          nextExecutionAt: isFinished ? null : nextExecution,
          attempts: 0,
          lastError: null,
          lockedAt: null,
          lockedBy: null,
          logs: existingLogs,
        },
      });

      if (isFinished) {
        await prisma.crossChannelJourney.update({
          where: { id: journey.id, tenantId },
          data: { completedCount: { increment: 1 } },
        });
      }

      return {
        status: isFinished ? 'COMPLETED' : 'STEP_EXECUTED',
        message: `Step ${step.type} executed. Next step: ${isFinished ? 'None (Completed)' : nextIndex}.`,
      };
    } catch (err: unknown) {
      // Step failed: increment attempts, record lastError, apply exponential backoff
      const errorMsg = err instanceof Error ? err.message : 'Step execution error';
      const newAttempts = enrollment.attempts + 1;
      const isCapped = newAttempts >= MAX_STEP_ATTEMPTS;

      const backoffMs = JOURNEY_BACKOFF_MS[Math.min(newAttempts - 1, JOURNEY_BACKOFF_MS.length - 1)];
      const nextRetry = isCapped ? null : new Date(now.getTime() + backoffMs);

      const existingLogs = Array.isArray(enrollment.logs) ? (enrollment.logs as any[]) : [];
      existingLogs.push({
        stepIndex: enrollment.currentStepIndex,
        stepType: step.type,
        executedAt: now.toISOString(),
        error: errorMsg,
        attempt: newAttempts,
        status: isCapped ? 'FAILED_MAX_ATTEMPTS' : 'RETRY_SCHEDULED',
      });

      await prisma.journeyEnrollment.update({
        where: { id: enrollmentId, tenantId },
        data: {
          status: isCapped ? 'FAILED' : 'IN_PROGRESS',
          attempts: newAttempts,
          lastError: errorMsg,
          nextExecutionAt: nextRetry,
          lockedAt: null,
          lockedBy: null,
          logs: existingLogs,
        },
      });

      return {
        status: isCapped ? 'FAILED' : 'RETRY_SCHEDULED',
        message: `Step failed on attempt ${newAttempts}/${MAX_STEP_ATTEMPTS}: ${errorMsg}`,
      };
    }
  }

  /**
   * Process all pending enrollments due for execution across all tenants or a single tenant.
   * Atomically claims each enrollment with stale lock recovery.
   */
  static async processDueEnrollments(
    tenantId?: string,
    workerId: string = `worker_${process.pid}`,
    limit: number = 20,
    deps: { now?: () => Date } = {}
  ): Promise<{ processed: number; claimed: number; errors: number }> {
    const nowFn = deps.now || (() => new Date());
    const now = nowFn();

    // 0. Stale lock recovery (locks older than 10 minutes)
    const staleCutoff = new Date(now.getTime() - 10 * 60_000);
    await prisma.journeyEnrollment.updateMany({
      where: {
        ...(tenantId ? { tenantId } : {}),
        status: 'IN_PROGRESS',
        lockedAt: { lt: staleCutoff },
      },
      data: {
        lockedAt: null,
        lockedBy: null,
      },
    });

    // 1. Query candidate due enrollments
    const candidates = await prisma.journeyEnrollment.findMany({
      where: {
        ...(tenantId ? { tenantId } : {}),
        status: 'IN_PROGRESS',
        nextExecutionAt: { lte: now },
        OR: [
          { lockedAt: null },
          { lockedAt: { lt: staleCutoff } },
        ],
      },
      orderBy: { nextExecutionAt: 'asc' },
      take: limit,
      select: { id: true, tenantId: true },
    });

    let processed = 0;
    let claimed = 0;
    let errors = 0;

    for (const candidate of candidates) {
      // 2. Atomic claim step so two workers never execute the same enrollment
      const { count } = await prisma.journeyEnrollment.updateMany({
        where: {
          id: candidate.id,
          tenantId: candidate.tenantId,
          status: 'IN_PROGRESS',
          OR: [
            { lockedAt: null },
            { lockedAt: { lt: staleCutoff } },
          ],
        },
        data: {
          lockedAt: now,
          lockedBy: workerId,
        },
      });

      if (count === 0) {
        continue; // Claimed by another worker
      }

      claimed++;
      try {
        await this.executeStep(candidate.tenantId, candidate.id, { now: nowFn, workerId });
        processed++;
      } catch (err) {
        errors++;
        console.error(`[Journey Engine] Error processing enrollment ${candidate.id}:`, err);
        // Ensure lock is released on unhandled exceptions
        await prisma.journeyEnrollment.updateMany({
          where: { id: candidate.id, tenantId: candidate.tenantId },
          data: { lockedAt: null, lockedBy: null },
        });
      }
    }

    return { processed, claimed, errors };
  }
}
