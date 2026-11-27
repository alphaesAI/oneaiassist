/**
 * Sending one approved template to the contact of an inbox conversation. This is the only way to
 * message a contact once the 24-hour reply window has closed.
 */
import { prisma } from '@/lib/db';
import { WhatsAppConnectionError, WhatsAppConnectionService } from './connection';
import { MetaGraphError, sendTemplateMessage, type FetchLike } from './metaGraph';
import { buildTemplateMessage, templateBroadcastProblems, toWhatsAppRecipient } from './templateSend';

export class ConversationTemplateError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'ConversationTemplateError';
  }
}

export async function sendTemplateInConversation(
  input: { tenantId: string; conversationId: string; templateId: string },
  deps: { fetchImpl?: FetchLike; now?: Date } = {}
) {
  const { tenantId } = input;
  const now = deps.now ?? new Date();

  const conversation = await prisma.conversation.findFirst({
    where: { id: input.conversationId, tenantId },
    include: { customer: true },
  });
  if (!conversation) throw new ConversationTemplateError('Conversation not found.', 404);
  if (conversation.channel !== 'WHATSAPP') throw new ConversationTemplateError('Templates can only be sent in a WhatsApp conversation.', 400);

  const template = await prisma.template.findFirst({ where: { id: input.templateId, tenantId, channel: 'WHATSAPP' } });
  if (!template) throw new ConversationTemplateError('Template not found.', 404);
  if (template.status !== 'APPROVED' || !template.metaTemplateId) {
    throw new ConversationTemplateError(`The template "${template.name}" is not approved by Meta (status: ${template.status}).`, 409);
  }
  const problems = templateBroadcastProblems(template);
  if (problems.length > 0) throw new ConversationTemplateError(problems.join(' '), 409);

  const customer = conversation.customer;
  if (customer.optedOutAt !== null) {
    throw new ConversationTemplateError('This contact has opted out of WhatsApp messages. They must message you (or reply START) before you can send a template.', 409);
  }
  if (template.category === 'MARKETING' && !customer.optedIn) {
    throw new ConversationTemplateError('This contact has not opted in to WhatsApp marketing, so a marketing template cannot be sent.', 409);
  }

  const recipient = toWhatsAppRecipient(customer.primaryPhone);
  if (!recipient) throw new ConversationTemplateError('This contact has no valid phone number.', 409);

  const built = buildTemplateMessage(template, {
    displayName: customer.displayName,
    email: customer.email,
    phone: recipient,
    customFields: customer.customFields,
  });
  if (!built.ok) throw new ConversationTemplateError(built.reason, 409);

  let messageId: string;
  try {
    const credentials = await WhatsAppConnectionService.getCredentials(tenantId);
    ({ messageId } = await sendTemplateMessage(
      {
        phoneNumberId: credentials.phoneNumberId,
        accessToken: credentials.accessToken,
        to: recipient,
        templateName: template.name,
        language: template.language,
        components: built.components,
      },
      deps.fetchImpl
    ));
  } catch (err) {
    if (err instanceof WhatsAppConnectionError) throw new ConversationTemplateError(err.message, 409);
    if (err instanceof MetaGraphError) {
      throw new ConversationTemplateError(`Meta did not accept the message: ${err.message}${err.code ? ` (code ${err.code})` : ''}`, 502);
    }
    throw new ConversationTemplateError('Meta could not be reached. The template was not sent; try again.', 502);
  }

  const message = await prisma.message.create({
    data: {
      tenantId,
      conversationId: conversation.id,
      direction: 'OUTBOUND',
      senderType: 'AGENT',
      content: built.renderedText,
      channel: 'WHATSAPP',
      channelMessageId: messageId,
      status: 'SENT',
      sentAt: now,
    },
  });
  await prisma.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: now } });
  return message;
}
