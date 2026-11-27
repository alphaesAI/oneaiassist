/**
 * What an incoming WhatsApp message means for marketing: an opt-out or opt-in keyword, and
 * which campaign message it is a reply to.
 */
import { prisma } from '@/lib/db';
import { recountCampaign } from './deliveryTracking';

export type OptAction = 'OPT_OUT' | 'OPT_IN';

/** The whole message must be one of these words. "Please stop calling me" is not an opt-out keyword. */
const OPT_OUT_WORDS = new Set(['STOP', 'STOP ALL', 'STOPALL', 'UNSUBSCRIBE', 'OPT OUT', 'OPTOUT', 'END', 'QUIT']);
const OPT_IN_WORDS = new Set(['START', 'UNSTOP', 'SUBSCRIBE', 'OPT IN', 'OPTIN']);

export const OPT_OUT_CONFIRMATION = 'You have been unsubscribed and will not receive marketing messages from us. Reply START to subscribe again.';
export const OPT_IN_CONFIRMATION = 'You are subscribed again. Reply STOP at any time to unsubscribe.';

export function classifyOptKeyword(text: string | null | undefined): OptAction | null {
  const word = String(text || '')
    .trim()
    .toUpperCase()
    .replace(/[.!\s]+$/g, '')
    .replace(/[\s-]+/g, ' ');
  if (!word) return null;
  if (OPT_OUT_WORDS.has(word)) return 'OPT_OUT';
  if (OPT_IN_WORDS.has(word)) return 'OPT_IN';
  return null;
}

/** How long after a campaign message a reply still counts as a reply to that campaign. */
export function replyAttributionMs(): number {
  const days = Number(process.env.WHATSAPP_REPLY_ATTRIBUTION_DAYS);
  return (Number.isFinite(days) && days > 0 ? days : 7) * 24 * 60 * 60 * 1000;
}

export interface InboundWhatsAppInput {
  tenantId: string;
  customerId: string;
  text: string | null | undefined;
  /** When the contact sent it. */
  at?: Date;
  /** Meta's ID of the message being answered, when the contact used "reply" on a specific message. */
  contextMessageId?: string | null;
}

export interface InboundWhatsAppResult {
  optAction: OptAction | null;
  /** False when the contact was already in that state. */
  optChanged: boolean;
  /** The campaign this message was counted for, if any. */
  campaignId: string | null;
  totals?: Awaited<ReturnType<typeof recountCampaign>>;
}

/** Finds the campaign message this incoming message answers. Always inside the tenant. */
async function findAnsweredJob(input: InboundWhatsAppInput, at: Date) {
  const select = { id: true, campaignId: true } as const;
  const context = String(input.contextMessageId || '').trim();
  if (context) {
    const exact = await prisma.broadcastJob.findFirst({
      where: { tenantId: input.tenantId, customerId: input.customerId, channel: 'WHATSAPP', providerMessageId: context },
      select,
    });
    if (exact) return exact;
  }
  // Otherwise: the most recent campaign message this contact received, if it is recent enough.
  return prisma.broadcastJob.findFirst({
    where: {
      tenantId: input.tenantId,
      customerId: input.customerId,
      channel: 'WHATSAPP',
      status: 'SENT',
      processedAt: { gte: new Date(at.getTime() - replyAttributionMs()), lte: at },
    },
    orderBy: { processedAt: 'desc' },
    select,
  });
}

export async function handleInboundWhatsApp(input: InboundWhatsAppInput): Promise<InboundWhatsAppResult> {
  const at = input.at && !Number.isNaN(input.at.getTime()) ? input.at : new Date();
  const optAction = classifyOptKeyword(input.text);
  let optChanged = false;

  if (optAction === 'OPT_OUT') {
    const res = await prisma.customer.updateMany({
      where: { id: input.customerId, tenantId: input.tenantId, optedOutAt: null },
      data: { optedIn: false, optedOutAt: at },
    });
    optChanged = res.count > 0;
    // Anything still waiting to go to this contact is stopped now.
    await prisma.broadcastJob.updateMany({
      where: { tenantId: input.tenantId, customerId: input.customerId, channel: 'WHATSAPP', status: 'PENDING' },
      data: { status: 'SKIPPED_OPTED_OUT', processedAt: at, lockedAt: null, lockedBy: null, lastError: 'The contact opted out by replying with a stop keyword' },
    });
  } else if (optAction === 'OPT_IN') {
    const res = await prisma.customer.updateMany({
      where: { id: input.customerId, tenantId: input.tenantId, OR: [{ optedIn: false }, { optedOutAt: { not: null } }] },
      data: { optedIn: true, optedInAt: at, optedOutAt: null },
    });
    optChanged = res.count > 0;
  }

  const job = await findAnsweredJob(input, at);
  if (!job) return { optAction, optChanged, campaignId: null };

  let changed = 0;
  if (optAction === 'OPT_OUT') {
    // An opt-out is recorded against the campaign as an opt-out, not as a reply.
    if (optChanged) {
      changed = (await prisma.broadcastJob.updateMany({ where: { id: job.id, tenantId: input.tenantId, optedOutAt: null }, data: { optedOutAt: at } })).count;
    }
  } else if (optAction === null) {
    changed = (await prisma.broadcastJob.updateMany({ where: { id: job.id, tenantId: input.tenantId, repliedAt: null }, data: { repliedAt: at } })).count;
  }
  if (changed === 0) return { optAction, optChanged, campaignId: job.campaignId };

  const totals = await recountCampaign(input.tenantId, job.campaignId);
  return { optAction, optChanged, campaignId: job.campaignId, totals };
}
