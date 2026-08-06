// Script to query KPI counts using prisma.$queryRaw
import { prisma } from '../lib/db';

async function main() {
  const tenantId = 'tenant_pme_ff9xl';
  const leadsResult = await prisma.$queryRaw`
    SELECT COUNT(*) AS count FROM "Lead" WHERE "tenantId" = ${tenantId}`;
  const policiesResult = await prisma.$queryRaw`
    SELECT COUNT(*) AS count FROM "Policy" WHERE "tenantId" = ${tenantId}`;
  const activeConvsResult = await prisma.$queryRaw`
    SELECT COUNT(*) AS count FROM "Conversation" WHERE "tenantId" = ${tenantId} AND "status" = 'OPEN'`;
  console.log('Leads:', (leadsResult as any)[0].count);
  console.log('Policies:', (policiesResult as any)[0].count);
  console.log('Active Conversations:', (activeConvsResult as any)[0].count);
}

main().catch(e => { console.error('Error:', e); process.exit(1); });
