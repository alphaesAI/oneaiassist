export interface MetaCanonicalMessage {
  messageId: string;
  phoneNumberId: string;
  waNumber: string;
  contactNumber: string;
  fromMe: boolean;
  text: string;
  messageType: 'TEXT' | 'IMAGE' | 'VIDEO' | 'OTHER';
  contextMessageId?: string;
  contactName?: string;
  timestamp?: string;
}

export interface MetaStatusReceipt {
  messageId: string;
  status: 'DELIVERED' | 'READ' | 'FAILED';
  recipientId: string;
  timestamp: string;
}

export function normalizeMetaPhone(s?: string): string {
  if (!s) return '';
  return String(s).replace(/\D/g, '');
}

export class MetaNormalizer {
  static parsePayload(body: any): { messages: MetaCanonicalMessage[]; statuses: MetaStatusReceipt[] } {
    const messages: MetaCanonicalMessage[] = [];
    const statuses: MetaStatusReceipt[] = [];

    if (!body || body.object !== 'whatsapp_business_account') {
      return { messages, statuses };
    }

    const entries = body.entry || [];
    for (const entry of entries) {
      const changes = entry.changes || [];
      for (const change of changes) {
        const value = change.value || {};
        if (value.messaging_product !== 'whatsapp') continue;

        const metadata = value.metadata || {};
        const phoneNumberId = metadata.phone_number_id || '';
        const displayPhoneNumber = metadata.display_phone_number || '';

        // Contact profiles mapping
        const contactProfiles: Record<string, string> = {};
        (value.contacts || []).forEach((c: any) => {
          const waId = c.wa_id || '';
          const name = c.profile?.name || '';
          if (waId && name) contactProfiles[waId] = name;
        });

        // 1. Process Messages
        const rawMsgs = value.messages || [];
        for (const msg of rawMsgs) {
          const contactNum = normalizeMetaPhone(msg.from);
          const type = msg.type || 'text';

          let text = '';
          let messageType: 'TEXT' | 'IMAGE' | 'VIDEO' | 'OTHER' = 'TEXT';

          if (type === 'text' && msg.text) {
            text = msg.text.body || '';
            messageType = 'TEXT';
          } else if (type === 'image' && msg.image) {
            text = msg.image.caption || '';
            messageType = 'IMAGE';
          } else if (type === 'video' && msg.video) {
            text = msg.video.caption || '';
            messageType = 'VIDEO';
          } else if (type === 'audio' || type === 'voice') {
            text = 'Voice message';
            messageType = 'OTHER';
          } else if (type === 'document' && msg.document) {
            text = msg.document.filename || 'Document';
            messageType = 'OTHER';
          } else if (type === 'location' && msg.location) {
            text = `Location: ${msg.location.latitude}, ${msg.location.longitude}`;
            messageType = 'OTHER';
          } else if (type === 'interactive' && msg.interactive) {
            text = msg.interactive.button_reply?.title || msg.interactive.list_reply?.title || 'Interactive response';
            messageType = 'TEXT';
          } else {
            text = msg.text?.body || '';
            messageType = 'OTHER';
          }

          messages.push({
            messageId: msg.id || '',
            phoneNumberId,
            waNumber: normalizeMetaPhone(displayPhoneNumber),
            contactNumber: contactNum,
            fromMe: false,
            text,
            messageType,
            contextMessageId: msg.context?.id || undefined,
            contactName: contactProfiles[contactNum] || undefined,
            timestamp: msg.timestamp
              ? new Date(parseInt(msg.timestamp, 10) * 1000).toISOString()
              : new Date().toISOString(),
          });
        }

        // 2. Process Status Receipts
        const rawStatuses = value.statuses || [];
        for (const st of rawStatuses) {
          const rawStatus = String(st.status || '').toLowerCase();
          let mappedStatus: 'DELIVERED' | 'READ' | 'FAILED' | null = null;

          if (rawStatus === 'delivered') mappedStatus = 'DELIVERED';
          else if (rawStatus === 'read') mappedStatus = 'READ';
          else if (rawStatus === 'failed') mappedStatus = 'FAILED';

          if (mappedStatus) {
            statuses.push({
              messageId: st.id || '',
              status: mappedStatus,
              recipientId: normalizeMetaPhone(st.recipient_id),
              timestamp: st.timestamp
                ? new Date(parseInt(st.timestamp, 10) * 1000).toISOString()
                : new Date().toISOString(),
            });
          }
        }
      }
    }

    return { messages, statuses };
  }
}
