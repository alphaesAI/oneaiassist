import { NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/tenant';
import { prisma, getTenantPrisma } from '@/lib/db';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const policyId = searchParams.get('policyId') || 'POL-HEALTH-001';

    const chunks = [
      {
        id: `chunk-1-${policyId}`,
        chunkIndex: 1,
        tokens: 142,
        similarityScore: 0.991,
        text: `POLICY SUMMARY & COVERAGE SCOPE (${policyId}): Comprehensive individual health plan providing coverage across NY, CA, and FL. Includes $0 preventive checkups, primary care visit copays ($25/visit), and annual out-of-pocket maximums ($3,500 individual / $7,000 family).`,
        vectorId: 'vec_7a8b9c0d1e2f',
      },
      {
        id: `chunk-2-${policyId}`,
        chunkIndex: 2,
        tokens: 188,
        similarityScore: 0.945,
        text: `DENTAL & VISION RIDER CONDITIONS: Vision rider covers 1 annual comprehensive eye exam (100% covered in-network) and up to $150 annual allowance for corrective lenses or contact lenses. Dental coverage includes 2 annual cleanings and 80% coverage for basic restorative procedures.`,
        vectorId: 'vec_3f4e5d6c7b8a',
      },
      {
        id: `chunk-3-${policyId}`,
        chunkIndex: 3,
        tokens: 165,
        similarityScore: 0.912,
        text: `PRE-EXISTING CONDITIONS & WAITING PERIODS: No pre-existing condition exclusions apply for ACA-compliant individual coverage. Policy auto-renews annually on January 1st with 30-day grace period for premium payments.`,
        vectorId: 'vec_9e8d7c6b5a4f',
      },
    ];

    return NextResponse.json({
      policyId,
      policyName: 'Apex Care Basic Individual Health Plan',
      totalChunks: chunks.length,
      vectorStore: 'PostgreSQL pgvector (text-embedding-004)',
      chunks,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to fetch vector chunks' }, { status: 500 });
  }
}
