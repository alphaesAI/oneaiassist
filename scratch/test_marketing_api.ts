import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

async function main() {
  const { prisma } = await import('../lib/db/index.js');
  try {
    const count = await (prisma as any).marketingCampaign.count();
    console.log('MarketingCampaign count via prisma:', count);

    const testCampaign = await (prisma as any).marketingCampaign.create({
      data: {
        tenantId: 'tenant_pme_ff9xl',
        name: 'P0 Hardened Healthcare Enrollment Campaign',
        type: 'ORGANIC',
        platforms: ['facebook', 'instagram', 'linkedin'],
        caption: 'Get comprehensive family health coverage with $0 copay checkups and low deductibles. Speak with a licensed advisor today. Disclaimers apply.',
        status: 'PENDING',
        complianceScore: 95,
        ctrPrediction: 'HIGH',
        auditResult: 'PASS',
        auditDetails: {
          checklist: [
            { rule: 'No unsubstantiated pricing or rate claims', pass: true },
            { rule: 'Required state insurance license disclaimer present', pass: true },
            { rule: 'No guaranteed policy approval without agent review', pass: true },
            { rule: 'Clear contact link & opt-out info included', pass: true }
          ],
          recommendations: [
            'Content passes healthcare insurance compliance standards.',
            'High CTR predicted due to clear call-to-action and benefit highlights.'
          ]
        }
      }
    });

    console.log('Successfully created test campaign:', testCampaign.id, testCampaign.name, testCampaign.status);

    const published = await (prisma as any).marketingCampaign.update({
      where: { id: testCampaign.id },
      data: {
        status: 'SUCCESS',
        publishedAt: new Date(),
        reach: 5200
      }
    });

    console.log('Successfully published campaign:', published.id, published.status, 'Reach:', published.reach);
  } catch (err) {
    console.error('API Test Error:', err);
  }
}

main();
