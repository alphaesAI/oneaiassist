// KPI check using PrismaClient directly with RLS session variables
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const tenantId = 'tenant_pme_ff9xl';
  const role = 'ADMIN';
  // Set tenant context for Row-Level Security
  await prisma.$executeRawUnsafe(`SELECT set_config('app.current_tenant_id', $1, false), set_config('app.current_user_role', $2, false)`, tenantId, role);
  const leads = await prisma.lead.count({ where: { tenantId } });
  const policies = await prisma.policy.count({ where: { tenantId } });
  const activeConvs = await prisma.conversation.count({ where: { tenantId, status: 'OPEN' } });
  console.log('Leads:', leads);
  console.log('Policies:', policies);
  console.log('Active Conversations:', activeConvs);
  await prisma.$disconnect();
}

main().catch(e => {
  console.error('Error executing KPI script:', e);
  process.exit(1);
});
