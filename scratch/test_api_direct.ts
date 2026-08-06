import 'dotenv/config';
import { prisma, getTenantPrisma } from '../lib/db/index';

async function test() {
  try {
    const tenantId = 'tenant_pme_ff9xl';
    const role = 'ADMIN';
    const db = getTenantPrisma(tenantId, role);

    const now = new Date();
    const startDate = new Date();
    startDate.setDate(now.getDate() - 30);
    const prevStartDate = new Date(startDate.getTime() - (now.getTime() - startDate.getTime()));

    console.log('Running queries...');
    const totalLeadsCount = await db.lead.count({ where: { tenantId, createdAt: { gte: startDate } } });
    const prevLeadsCount = await db.lead.count({ where: { tenantId, createdAt: { gte: prevStartDate, lt: startDate } } });
    const totalConversationsCount = await db.conversation.count({ where: { tenantId, createdAt: { gte: startDate } } });
    const prevConversationsCount = await db.conversation.count({ where: { tenantId, createdAt: { gte: prevStartDate, lt: startDate } } });
    const totalConversionsCount = await db.lead.count({ where: { tenantId, status: 'CONVERTED', updatedAt: { gte: startDate } } });
    const prevConversionsCount = await db.lead.count({ where: { tenantId, status: 'CONVERTED', updatedAt: { gte: prevStartDate, lt: startDate } } });
    const allConversations = await db.conversation.findMany({ where: { tenantId }, include: { messages: true } });
    const allLeads = await db.lead.findMany({ where: { tenantId } });
    const policies = await db.policy.findMany({ where: { tenantId }, include: { policyCatalog: true } });
    const policyItems = await db.policyCatalogItem.findMany({ where: { tenantId } });
    const campaigns = await db.broadcastCampaign.findMany({ where: { tenantId }, include: { broadcastJobs: true } });
    const agents = await db.user.findMany({ where: { tenantId, role: { in: ['ADMIN', 'MANAGER', 'AGENT'] } } });
    const escalationLogs = await db.escalationLog.findMany({ where: { tenantId }, orderBy: { triggeredAt: 'desc' }, take: 10 });

    console.log('SUCCESS! All 13 queries completed sequentially without pool contention!');
    console.log({
      totalLeadsCount,
      prevLeadsCount,
      totalConversationsCount,
      totalConversionsCount,
      policiesCount: policies.length,
      policyItemsCount: policyItems.length,
      allLeadsCount: allLeads.length,
      escalationLogsCount: escalationLogs.length,
    });
  } catch (err) {
    console.error('ERROR:', err);
  }
}

test();
