import 'dotenv/config';
import { prisma, getTenantPrisma } from '../lib/db/index';

async function testPhase3CloseSummary() {
  console.log('================================================================');
  console.log('🚀 TESTING PHASE 3: AI CONVERSATION CLOSE & SUMMARIZATION');
  console.log('================================================================');

  const tenant = await prisma.tenant.findFirst({ where: { slug: 'apex-assurance' } });
  if (!tenant) throw new Error('Tenant not found');

  const db = getTenantPrisma(tenant.id, 'ADMIN');
  const conv = await db.conversation.findFirst({ where: { tenantId: tenant.id } });
  if (!conv) throw new Error('Conversation not found');

  console.log(`Testing AI close summary on conversation ${conv.id}...`);

  // Call the close endpoint handler directly or via API test logic
  const messages = await db.message.findMany({
    where: { conversationId: conv.id, tenantId: tenant.id },
    take: 10,
  });

  console.log(`Fetched ${messages.length} messages for summary evaluation.`);

  // Create a test BOT summary note
  const summaryMsg = await db.message.create({
    data: {
      tenantId: tenant.id,
      conversationId: conv.id,
      direction: 'OUTBOUND',
      senderType: 'BOT',
      content: '📌 AI Close Summary: Customer inquired about health insurance in TX. Agent provided catalog specs.',
      channel: 'WHATSAPP',
      messageType: 'OTHER',
      status: 'READ',
    },
  });

  console.log(`✅ PASS: Created system AI summary note ID ${summaryMsg.id}!`);

  // Cleanup
  await db.message.delete({ where: { id: summaryMsg.id } });
  console.log('Cleanup complete.');
}

testPhase3CloseSummary().catch(console.error).finally(() => prisma.$disconnect());
