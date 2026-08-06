import 'dotenv/config';
import { prisma, getTenantPrisma } from '../lib/db/index';

async function main() {
  const tenant = await prisma.tenant.findUnique({
    where: { slug: 'primemarketingexperts' },
  });

  if (!tenant) {
    console.error('Tenant primemarketingexperts not found');
    return;
  }

  const tenantId = tenant.id;
  console.log(`Seeding sample escalation logs for tenant: ${tenantId}`);

  const db = getTenantPrisma(tenantId, 'ADMIN');

  // Clear existing escalation logs
  await db.escalationLog.deleteMany({ where: { tenantId } });

  const sampleEscalations = [
    {
      userQuestion: 'Can I add my 68-year-old parent to the Apex Family Gold Comprehensive Plan?',
      reason: 'Policy age limit complexity & senior rider eligibility check',
      triggeredAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
    },
    {
      userQuestion: 'Does the Apex Senior Medicare Advantage supplement cover out-of-network dental surgery in Florida?',
      reason: 'Low RAG vector similarity confidence (< 0.65)',
      triggeredAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    },
    {
      userQuestion: 'I want to speak with a licensed human insurance agent immediately regarding a claims dispute.',
      reason: 'User explicitly requested human agent handoff',
      triggeredAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    },
    {
      userQuestion: 'What is the exact deductible for out-of-state emergency room visits under POL-HEALTH-004?',
      reason: 'Complex out-of-state network clause query',
      triggeredAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    },
    {
      userQuestion: 'Can I pay my annual premium in quarterly installments with a corporate credit card?',
      reason: 'Custom payment schedule request',
      triggeredAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    },
  ];

  for (const esc of sampleEscalations) {
    await db.escalationLog.create({
      data: {
        tenantId,
        userQuestion: esc.userQuestion,
        reason: esc.reason,
        triggeredAt: esc.triggeredAt,
      },
    });
  }

  console.log('Successfully seeded 5 sample escalation logs!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
