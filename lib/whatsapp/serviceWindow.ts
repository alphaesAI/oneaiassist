/**
 * Meta's customer service window: free-form messages may be sent only within 24 hours of the
 * contact's last message. After that, only an approved template may be sent.
 */
import { prisma } from '@/lib/db';
import { META_PROVIDER } from './connection';

export const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

export const WINDOW_CLOSED_MESSAGE =
  'The 24-hour reply window is closed: this contact has not messaged you in the last 24 hours. WhatsApp only allows an approved template now. Send a template, and you can reply freely once they answer.';

export class WhatsAppWindowClosedError extends Error {
  readonly status = 409;
  readonly code = 'WINDOW_CLOSED';
  constructor(message = WINDOW_CLOSED_MESSAGE) {
    super(message);
    this.name = 'WhatsAppWindowClosedError';
  }
}

/** True when this tenant sends WhatsApp through the official Cloud API. */
export async function usesOfficialApi(tenantId: string): Promise<boolean> {
  if (!tenantId) return false;
  const row = await prisma.whatsAppNumber.findUnique({ where: { tenantId }, select: { provider: true, metaPhoneNumberId: true } });
  return !!row && row.provider === META_PROVIDER && !!row.metaPhoneNumberId;
}

export interface ServiceWindow {
  open: boolean;
  lastInboundAt: Date | null;
  closesAt: Date | null;
}

/** The window for the contact of this conversation, counted across all their WhatsApp conversations. */
export async function getServiceWindow(tenantId: string, conversationId: string, now: Date = new Date()): Promise<ServiceWindow> {
  const conversation = await prisma.conversation.findFirst({ where: { id: conversationId, tenantId }, select: { customerId: true } });
  if (!conversation) return { open: false, lastInboundAt: null, closesAt: null };
  const last = await prisma.message.findFirst({
    where: { tenantId, direction: 'INBOUND', channel: 'WHATSAPP', conversation: { customerId: conversation.customerId } },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });
  if (!last) return { open: false, lastInboundAt: null, closesAt: null };
  const closesAt = new Date(last.createdAt.getTime() + SERVICE_WINDOW_MS);
  return { open: closesAt.getTime() > now.getTime(), lastInboundAt: last.createdAt, closesAt };
}
