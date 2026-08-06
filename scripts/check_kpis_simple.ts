// Simple script to query KPI counts for tenant_pme_ff9xl using Prisma instance
import { prisma } from '../lib/db';

async function main() {
  const tenantId = 'tenant_pme_ff9xl';
  const leads = await prisma.lead.count({ where: { tenantId } });
  const policies = await prisma.policy.count({ where: { tenantId } });
  const activeConvs = await prisma.conversation.count({ where: { tenantId, status: 'OPEN' } });
  console.log('Leads:', leads);
  console.log('Policies:', policies);
  console.log('Active Conversations:', activeConvs);
}

main().catch((e) => {
  console.error('Error executing script:', e);
  process.exit(1);
});
