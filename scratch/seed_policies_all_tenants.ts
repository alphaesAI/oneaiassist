import fs from 'fs';
import path from 'path';

try {
  const envPath = path.resolve(__dirname, '../.env');
  if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, 'utf8');
    for (const line of envConfig.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...values] = trimmed.split('=');
        if (key && values.length > 0) {
          process.env[key.trim()] = values.join('=').trim().replace(/^["']|["']$/g, '');
        }
      }
    }
  }
} catch (e) {
  console.warn('Could not load .env:', e);
}

const { prisma, getTenantPrisma } = require('../lib/db');

async function main() {
  console.log('Fixing tenantId mapping for admin@primemarketingexperts.com...');

  // Update user admin@primemarketingexperts.com to ensure tenantId is 'tenant_pme_ff9xl'
  const user = await prisma.user.findFirst({
    where: { email: 'admin@primemarketingexperts.com' },
  });

  if (user) {
    await prisma.user.update({
      where: { id: user.id },
      data: { tenantId: 'tenant_pme_ff9xl' },
    });
    console.log(`Updated user admin@primemarketingexperts.com tenantId to tenant_pme_ff9xl`);
  }

  // Seed policies to BOTH tenants (tenant_pme_ff9xl and cmrzqx63v00000kvai9c39gt1)
  const targetTenants = ['tenant_pme_ff9xl', 'cmrzqx63v00000kvai9c39gt1'];

  const plans = [
    {
      policyId: 'POL-HEALTH-001',
      name: 'Apex Care Basic Individual Health Plan',
      insurerName: 'Apex Health Care',
      states: ['NY', 'CA', 'FL'],
      premiumMin: 5000,
      premiumMax: 15000,
      sumInsured: 10000000,
      active: true,
      extractedSummary: 'Comprehensive basic health insurance covering outpatient care, doctor visits, emergency room visits, and preventative care screenings with standard copays across NY, CA, and FL.',
      pdfUrl: 'Apex_Care_Basic_Individual_Plan_2026.pdf',
    },
    {
      policyId: 'POL-HEALTH-002',
      name: 'Apex Family Gold Comprehensive Plan',
      insurerName: 'Apex Health Care',
      states: ['TX', 'FL', 'GA'],
      premiumMin: 18000,
      premiumMax: 45000,
      sumInsured: 50000000,
      active: true,
      extractedSummary: 'Full family healthcare coverage including pediatric dental & vision, zero-deductible preventive visits, specialist consultations, and in-patient hospitalization coverage across TX, FL, and GA.',
      pdfUrl: 'Apex_Family_Gold_Comprehensive_2026.pdf',
    },
    {
      policyId: 'POL-HEALTH-003',
      name: 'Apex Senior Medicare Advantage Supplement',
      insurerName: 'Apex Health Care',
      states: ['NY', 'TX', 'FL'],
      premiumMin: 0,
      premiumMax: 8500,
      sumInsured: 25000000,
      active: true,
      extractedSummary: 'Designed for eligible seniors (65+). Includes Part D prescription drug coverage, annual wellness checkups, silver sneakers fitness benefit, hearing aid discounts, and emergency international travel protection.',
      pdfUrl: 'Apex_Senior_Medicare_Advantage_2026.pdf',
    },
    {
      policyId: 'POL-HEALTH-004',
      name: 'Apex Small Business Group Healthcare',
      insurerName: 'Apex Health Care',
      states: ['NY', 'CA', 'TX', 'IL'],
      premiumMin: 22000,
      premiumMax: 60000,
      sumInsured: 100000000,
      active: true,
      extractedSummary: 'Turnkey employer-sponsored group health insurance for businesses with 2 to 50 employees. Includes dental, vision, telehealth app access, mental health support, and flexible HSA/FSA account pairing.',
      pdfUrl: 'Apex_Small_Business_Group_Health_2026.pdf',
    },
    {
      policyId: 'POL-HEALTH-005',
      name: 'Apex Dental & Vision Shield Rider',
      insurerName: 'Apex Health Care',
      states: ['NY', 'CA', 'FL', 'TX', 'GA', 'IL'],
      premiumMin: 2500,
      premiumMax: 6500,
      sumInsured: 5000000,
      active: true,
      extractedSummary: 'Supplemental rider providing 100% coverage for bi-annual dental cleanings, annual eye exams, optical frame allowances up to $200, and major dental restorative procedure coverage with no waiting period.',
      pdfUrl: 'Apex_Dental_Vision_Shield_Rider_2026.pdf',
    },
  ];

  for (const tid of targetTenants) {
    const db = getTenantPrisma(tid, 'ADMIN');
    console.log(`Seeding policies for tenant: ${tid}`);

    for (const plan of plans) {
      const existing = await db.policyCatalogItem.findFirst({
        where: { policyId: plan.policyId },
      });

      if (existing) {
        await db.policyCatalogItem.update({
          where: { id: existing.id },
          data: plan,
        });
        console.log(`  Updated ${plan.policyId}: ${plan.name}`);
      } else {
        await db.policyCatalogItem.create({
          data: {
            tenantId: tid,
            ...plan,
          },
        });
        console.log(`  Created ${plan.policyId}: ${plan.name}`);
      }
    }

    await db.tenantOnboardingProgress.upsert({
      where: { tenantId: tid },
      create: { tenantId: tid, productAdded: true },
      update: { productAdded: true },
    });
  }

  console.log('All tenant mappings and policy catalog seedings completed!');
}

main().catch(console.error).finally(() => prisma.$disconnect());
