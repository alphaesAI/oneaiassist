// KPI check using existing prisma instance with RLS
const path = require('path');
const { prisma, getTenantPrisma } = require(path.resolve(__dirname, '../lib/db'));

async function main() {
  const tenantId = 'tenant_pme_ff9xl';
  const role = 'ADMIN';
  const db = getTenantPrisma(tenantId, role);
  const leads = await db.lead.count({ where: { tenantId } });
  const policies = await db.policy.count({ where: { tenantId } });
  const activeConvs = await db.conversation.count({ where: { tenantId, status: 'OPEN' } });
  console.log('Leads:', leads);
  console.log('Policies:', policies);
  console.log('Active Conversations:', activeConvs);
}

main().catch(e => {
  console.error('Error executing KPI script:', e);
  process.exit(1);
});
