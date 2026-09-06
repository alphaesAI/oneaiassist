import 'dotenv/config';
import { WhatsAppNormalizer } from '../whatsapp-engine/WhatsAppNormalizer';
import { handleMessageStatusUpdate } from '../whatsapp-engine/engine-logic';
import { prisma, getTenantPrisma } from '../lib/db/index';

async function testPhase1Upgrades() {
  console.log('================================================================');
  console.log('🚀 TESTING PHASE 1: DATABASE SCHEMA & ENGINE UPGRADES');
  console.log('================================================================');

  // 1. Test WhatsAppNormalizer contextMessageId extraction
  const mockBaileysMsg = {
    key: { id: 'msg_12345', remoteJid: '918220850596@s.whatsapp.net', fromMe: false },
    message: {
      extendedTextMessage: {
        text: 'This is a reply to a quoted message.',
        contextInfo: { stanzaId: 'quoted_parent_msg_999' },
      },
    },
  };

  const normalized = WhatsAppNormalizer.normalizeBaileys(mockBaileysMsg);
  console.log('Normalized Message Output:', normalized);

  if (normalized?.contextMessageId === 'quoted_parent_msg_999') {
    console.log('✅ PASS: WhatsAppNormalizer successfully extracted contextMessageId!');
  } else {
    console.error('❌ FAIL: WhatsAppNormalizer failed to extract contextMessageId!');
  }

  // 2. Test Monotonic Status Rank Advancement in handleMessageStatusUpdate
  const tenant = await prisma.tenant.findFirst({ where: { slug: 'apex-assurance' } });
  if (!tenant) throw new Error('Tenant not found');

  const db = getTenantPrisma(tenant.id, 'ADMIN');
  const conv = await db.conversation.findFirst({ where: { tenantId: tenant.id } });
  if (!conv) throw new Error('Conversation not found');

  const testMsg = await db.message.create({
    data: {
      tenantId: tenant.id,
      conversationId: conv.id,
      direction: 'OUTBOUND',
      senderType: 'AGENT',
      content: 'Phase 1 test delivery rank message',
      channel: 'WHATSAPP',
      channelMessageId: `test_rank_${Date.now()}`,
      status: 'READ',
      readAt: new Date(),
    },
  });

  console.log(`Created test message ID ${testMsg.id} with status: ${testMsg.status} (Rank 3)`);

  // Attempt to downgrade status to DELIVERED (Rank 2)
  const mockIo = { to: () => ({ emit: () => {} }) };
  await handleMessageStatusUpdate(tenant.id, testMsg.channelMessageId!, 'DELIVERED', mockIo);

  const updatedMsg = await db.message.findUnique({ where: { id: testMsg.id } });
  console.log(`Status after attempting downgrade to DELIVERED: ${updatedMsg?.status}`);

  if (updatedMsg?.status === 'READ') {
    console.log('✅ PASS: Monotonic STATUS_RANK prevented status downgrade from READ to DELIVERED!');
  } else {
    console.error(`❌ FAIL: Status was downgraded to ${updatedMsg?.status}!`);
  }

  // Cleanup test message
  await db.message.delete({ where: { id: testMsg.id } });
  console.log('Cleanup complete.');
}

testPhase1Upgrades().catch(console.error).finally(() => prisma.$disconnect());
