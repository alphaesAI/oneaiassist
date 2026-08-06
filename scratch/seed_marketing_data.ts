import 'dotenv/config';
import { getTenantPrisma } from '../lib/db/index';

async function seed() {
  const tenantId = 'tenant_pme_ff9xl';
  const db = getTenantPrisma(tenantId, 'ADMIN');

  console.log('Seeding Marketing data for tenant_pme_ff9xl...');

  // 1. Seed Platform Connections
  const platforms = [
    { platform: 'FACEBOOK' as const, status: 'CONNECTED' as const, accountName: 'Prime Health Marketing Page' },
    { platform: 'INSTAGRAM' as const, status: 'CONNECTED' as const, accountName: '@primehealth_experts' },
    { platform: 'LINKEDIN' as const, status: 'CONNECTED' as const, accountName: 'Prime Marketing Experts Company' },
    { platform: 'YOUTUBE' as const, status: 'NOT_CONNECTED' as const, accountName: null },
    { platform: 'META_ADS' as const, status: 'CONNECTED' as const, accountName: 'Prime Ads Manager (Act: 894021)' },
  ];

  for (const item of platforms) {
    await (db as any).platformConnection.upsert({
      where: { tenantId_platform: { tenantId, platform: item.platform } },
      update: { status: item.status, accountName: item.accountName, connectedAt: item.status === 'CONNECTED' ? new Date() : null },
      create: { tenantId, platform: item.platform, status: item.status, accountName: item.accountName, connectedAt: item.status === 'CONNECTED' ? new Date() : null },
    });
  }

  // 2. Seed Sample Marketing Campaigns for History Tab
  const campaigns = [
    {
      name: 'Q3 Individual Health Coverage Promo',
      type: 'ORGANIC' as const,
      platforms: ['facebook', 'instagram'],
      caption: 'Protect your family with comprehensive individual health coverage! Low deductibles and $0 preventive checkups available across NY & CA. Speak with an licensed advisor today.',
      status: 'SUCCESS' as const,
      publishedAt: new Date(Date.now() - 86400000 * 2),
      reach: 4850,
      complianceScore: 95,
      ctrPrediction: 'HIGH' as const,
      auditResult: 'PASS' as const,
      auditDetails: {
        checklist: [
          { rule: 'No unsubstantiated pricing claims', pass: true },
          { rule: 'Required state insurance license disclaimer present', pass: true },
          { rule: 'No guaranteed approval without agent review', pass: true },
          { rule: 'Clear contact link & opt-out info', pass: true },
        ],
        recommendations: ['Excellent headline clarity', 'Strong call to action included'],
      },
    },
    {
      name: 'Medicare Advantage Open Enrollment Ad',
      type: 'PAID' as const,
      platforms: ['facebook', 'instagram', 'meta_ads'],
      caption: 'Seniors 65+: Zero-dollar monthly premium Medicare Advantage plans are open for enrollment. Get dental, vision, and prescription coverage included.',
      status: 'SUCCESS' as const,
      publishedAt: new Date(Date.now() - 86400000 * 5),
      reach: 12400,
      budget: 350.0,
      audienceTargeting: { ageRange: '65+', location: 'United States', interests: ['Medicare', 'Health Insurance', 'Retirement'] },
      complianceScore: 92,
      ctrPrediction: 'HIGH' as const,
      auditResult: 'PASS' as const,
      auditDetails: {
        checklist: [
          { rule: 'No unsubstantiated pricing claims', pass: true },
          { rule: 'Required state insurance license disclaimer present', pass: true },
          { rule: 'No guaranteed approval without agent review', pass: true },
          { rule: 'Clear contact link & opt-out info', pass: true },
        ],
        recommendations: ['Consider targeting specific zip codes for higher conversion'],
      },
    },
    {
      name: 'Small Business Group Healthcare Webinar',
      type: 'ORGANIC' as const,
      platforms: ['linkedin'],
      caption: 'Are you a small business owner looking to cut healthcare costs while retaining top talent? Join our live Q&A with health benefit specialists.',
      status: 'FAILED' as const,
      publishedAt: null,
      reach: 0,
      complianceScore: 88,
      ctrPrediction: 'MEDIUM' as const,
      auditResult: 'PASS' as const,
      auditDetails: {
        checklist: [
          { rule: 'No unsubstantiated pricing claims', pass: true },
          { rule: 'Required state insurance license disclaimer present', pass: true },
          { rule: 'No guaranteed approval without agent review', pass: true },
          { rule: 'Clear contact link & opt-out info', pass: true },
        ],
        recommendations: ['Add hashtag #SmallBusinessHealth for broader LinkedIn visibility'],
      },
    },
  ];

  for (const c of campaigns) {
    await (db as any).marketingCampaign.create({
      data: {
        tenantId,
        name: c.name,
        type: c.type,
        platforms: c.platforms,
        caption: c.caption,
        status: c.status,
        publishedAt: c.publishedAt,
        reach: c.reach,
        budget: (c as any).budget || null,
        audienceTargeting: (c as any).audienceTargeting || null,
        complianceScore: c.complianceScore,
        ctrPrediction: c.ctrPrediction,
        auditResult: c.auditResult,
        auditDetails: c.auditDetails,
      },
    });
  }

  console.log('Successfully seeded marketing platform connections and sample campaigns!');
}

seed();
