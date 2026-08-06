import fs from 'fs';
import path from 'path';

// Parse .env before importing lib/db
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

// Dynamically import lib/db after env vars are populated
const { prisma, getTenantPrisma } = require('../lib/db');

async function main() {
  console.log('Finding admin user for Prime Marketing Experts...');
  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { email: { contains: 'prime', mode: 'insensitive' } },
        { email: { contains: 'admin', mode: 'insensitive' } },
      ],
    },
    include: { tenant: true },
  });

  console.log('User found:', user);

  let tenantId = user?.tenantId;
  if (!tenantId) {
    const tenant = await prisma.tenant.findFirst({
      where: { name: { contains: 'Prime', mode: 'insensitive' } },
    });
    tenantId = tenant?.id;
    console.log('Tenant by name:', tenant);
  }

  if (!tenantId) {
    const firstTenant = await prisma.tenant.findFirst();
    tenantId = firstTenant?.id;
    console.log('Fallback to first tenant:', firstTenant);
  }

  const db = getTenantPrisma(tenantId, 'ADMIN');

  const plans = [
    {
      policyId: 'POL-HEALTH-001',
      name: 'Apex Care Basic Individual Health Plan',
      insurerName: 'Apex Health Care',
      states: ['NY', 'CA', 'FL'],
      premiumMin: 5000, // $50.00
      premiumMax: 15000, // $150.00
      sumInsured: 10000000, // $100,000.00
      active: true,
      extractedSummary: 'Comprehensive basic health insurance covering essential outpatient care, doctor office visits, emergency department visits, and preventative care screenings with standard copays across NY, CA, and FL.',
      pdfUrl: 'Apex_Care_Basic_Individual_Plan_2026.pdf',
    },
    {
      policyId: 'POL-HEALTH-002',
      name: 'Apex Family Gold Comprehensive Plan',
      insurerName: 'Apex Health Care',
      states: ['TX', 'FL', 'GA'],
      premiumMin: 18000, // $180.00
      premiumMax: 45000, // $450.00
      sumInsured: 50000000, // $500,000.00
      active: true,
      extractedSummary: 'Full family healthcare coverage including pediatric dental & vision, zero-deductible preventive visits, specialist consultations, and in-patient hospitalization coverage across TX, FL, and GA.',
      pdfUrl: 'Apex_Family_Gold_Comprehensive_2026.pdf',
    },
    {
      policyId: 'POL-HEALTH-003',
      name: 'Apex Senior Medicare Advantage Supplement',
      insurerName: 'Apex Health Care',
      states: ['NY', 'TX', 'FL'],
      premiumMin: 0, // $0.00
      premiumMax: 8500, // $85.00
      sumInsured: 25000000, // $250,000.00
      active: true,
      extractedSummary: 'Designed for eligible seniors (65+). Includes Part D prescription drug coverage, annual wellness checkups, silver sneakers fitness benefit, hearing aid discounts, and emergency international travel protection.',
      pdfUrl: 'Apex_Senior_Medicare_Advantage_2026.pdf',
    },
    {
      policyId: 'POL-HEALTH-004',
      name: 'Apex Small Business Group Healthcare',
      insurerName: 'Apex Health Care',
      states: ['NY', 'CA', 'TX', 'IL'],
      premiumMin: 22000, // $220.00
      premiumMax: 60000, // $600.00
      sumInsured: 100000000, // $1,000,000.00
      active: true,
      extractedSummary: 'Turnkey employer-sponsored group health insurance for businesses with 2 to 50 employees. Includes dental, vision, telehealth app access, mental health support, and flexible HSA/FSA account pairing.',
      pdfUrl: 'Apex_Small_Business_Group_Health_2026.pdf',
    },
    {
      policyId: 'POL-HEALTH-005',
      name: 'Apex Dental & Vision Shield Rider',
      insurerName: 'Apex Health Care',
      states: ['NY', 'CA', 'FL', 'TX', 'GA', 'IL'],
      premiumMin: 2500, // $25.00
      premiumMax: 6500, // $65.00
      sumInsured: 5000000, // $50,000.00
      active: true,
      extractedSummary: 'Supplemental rider providing 100% coverage for bi-annual dental cleanings, annual eye exams, optical frame allowances up to $200, and major dental restorative procedure coverage with no waiting period.',
      pdfUrl: 'Apex_Dental_Vision_Shield_Rider_2026.pdf',
    },
  ];

  for (const plan of plans) {
    const existing = await db.policyCatalogItem.findFirst({
      where: { policyId: plan.policyId },
    });

    if (existing) {
      await db.policyCatalogItem.update({
        where: { id: existing.id },
        data: plan,
      });
      console.log(`Updated ${plan.policyId}: ${plan.name}`);
    } else {
      await db.policyCatalogItem.create({
        data: {
          tenantId,
          ...plan,
        },
      });
      console.log(`Created ${plan.policyId}: ${plan.name}`);
    }
  }

  // Also update TenantOnboardingProgress so productAdded is true
  await db.tenantOnboardingProgress.upsert({
    where: { tenantId },
    create: { tenantId, productAdded: true },
    update: { productAdded: true },
  });
  console.log('Updated TenantOnboardingProgress productAdded = true');

  console.log('Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
