// Direct KPI check using PrismaClient (CommonJS)
const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  const tenantId = 'tenant_pme_ff9xl';
  // Set tenant context for RLS
  await prisma.$executeRawUnsafe(`SELECT set_config('app.current_tenant_id', $1, false), set_config('app.current_user_role', $2, false)`, tenantId, 'ADMIN');
  const leads = await prisma.lead.count({ where: { tenantId } });
  const policies = await prisma.policy.count({ where: { tenantId } });
  const activeConvs = await prisma.conversation.count({ where: { tenantId, status: 'OPEN' } });
  console.log('Leads:', leads);
  console.log('Policies:', policies);
  console.log('Active Conversations:', activeConvs);
  await prisma.$disconnect();
}

main().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
