import 'dotenv/config';
import { prisma, getTenantPrisma } from '../lib/db';
import { pinecone } from '../lib/rag/pinecone';
import { retrieve } from '../lib/rag/retrieve';

async function run() {
  console.log('==================================================');
  console.log('Running RAG Pipeline & Multi-Tenant Isolation Tests');
  console.log('==================================================');

  // 1. Setup Tenant A and Tenant B
  console.log('\n[1/4] Setting up Tenant A and Tenant B...');
  const tenantA = await prisma.tenant.create({
    data: {
      name: 'Tenant A Insurance Services',
      slug: 'tenant-a-rag',
      subscriptionPlan: 'FREE',
      subscriptionStatus: 'ACTIVE',
    },
  });

  const tenantB = await prisma.tenant.create({
    data: {
      name: 'Tenant B Premium Partners',
      slug: 'tenant-b-rag',
      subscriptionPlan: 'FREE',
      subscriptionStatus: 'ACTIVE',
    },
  });

  const dbA = getTenantPrisma(tenantA.id, 'TENANT_ADMIN');
  const dbB = getTenantPrisma(tenantB.id, 'TENANT_ADMIN');

  try {
    // 2. Setup Policy Catalogs for both tenants with identical names/IDs to test namespace collision prevention
    console.log('\n[2/4] Setting up duplicate catalog entries across tenants...');
    const catalogA = await dbA.policyCatalog.create({
      data: {
        tenantId: tenantA.id,
        policyId: 'gold-health-plan',
        name: 'Ultimate Gold Protection',
        insurerName: 'Aetna',
        states: ['TX'],
        premiumMin: 10000,
        premiumMax: 20000,
        sumInsured: 1000000,
        active: true,
        extractedSummary: 'Tenant A Gold Summary.',
        pdfUrl: '/uploads/a/gold.pdf',
      },
    });

    const catalogB = await dbB.policyCatalog.create({
      data: {
        tenantId: tenantB.id,
        policyId: 'gold-health-plan', // COLLISION TARGET: same policyId string
        name: 'Ultimate Gold Protection',
        insurerName: 'Aetna',
        states: ['TX'],
        premiumMin: 10000,
        premiumMax: 20000,
        sumInsured: 1000000,
        active: true,
        extractedSummary: 'Tenant B Gold Summary.',
        pdfUrl: '/uploads/b/gold.pdf',
      },
    });

    // 3. Upsert Chunks for Tenant A and Tenant B
    console.log('\n[3/4] Indexing document chunks into Pinecone (Mock/Real)...');
    
    // Store in DB for Tenant A
    await dbA.policyDocumentChunk.create({
      data: {
        tenantId: tenantA.id,
        policyCatalogId: catalogA.id,
        chunkText: 'Tenant A Special Benefit clause: Dental coverage included with zero deductible.',
        pageNumber: 1,
        pineconeVectorId: `chunk-a-01-${Date.now()}`,
      },
    });

    // Store in DB for Tenant B
    await dbB.policyDocumentChunk.create({
      data: {
        tenantId: tenantB.id,
        policyCatalogId: catalogB.id,
        chunkText: 'Tenant B Special Benefit clause: Vision coverage included with zero deductible.',
        pageNumber: 1,
        pineconeVectorId: `chunk-b-01-${Date.now()}`,
      },
    });

    // Mock upserting into Pinecone client
    const dummyVector = new Array(1536).fill(0.1);
    
    await pinecone.upsert(tenantA.id, [{
      id: `chunk-a-01-${Date.now()}`,
      values: dummyVector,
      metadata: {
        tenantId: tenantA.id,
        policyCatalogId: catalogA.id,
        text: 'Tenant A Special Benefit clause: Dental coverage included with zero deductible.',
        pageNumber: 1,
      },
    }]);

    await pinecone.upsert(tenantB.id, [{
      id: `chunk-b-01-${Date.now()}`,
      values: dummyVector,
      metadata: {
        tenantId: tenantB.id,
        policyCatalogId: catalogB.id,
        text: 'Tenant B Special Benefit clause: Vision coverage included with zero deductible.',
        pageNumber: 1,
      },
    }]);

    // 4. Retrieve RAG results for Tenant A and verify Tenant B data is never leaked
    console.log('\n[4/4] Verifying Tenant Isolation during RAG retrieval query...');
    
    // Query retrieval for Tenant A
    const resultsA = await retrieve(tenantA.id, { policyCatalogId: catalogA.id }, 'Dental coverage', 3);
    console.log('Tenant A query results:');
    resultsA.forEach((r, idx) => console.log(`  - Match #${idx + 1}: "${r.text}"`));

    // Query retrieval for Tenant B
    const resultsB = await retrieve(tenantB.id, { policyCatalogId: catalogB.id }, 'Vision coverage', 3);
    console.log('Tenant B query results:');
    resultsB.forEach((r, idx) => console.log(`  - Match #${idx + 1}: "${r.text}"`));

    // Assert absolute isolation
    const hasLeakageA = resultsA.some((r) => r.text.includes('Tenant B'));
    const hasLeakageB = resultsB.some((r) => r.text.includes('Tenant A'));

    if (hasLeakageA || hasLeakageB) {
      throw new Error('CRITICAL SECURITY VIOLATION: Tenant isolation failure! Chunks leaked across index partitions.');
    }

    if (resultsA.length === 0 || !resultsA[0].text.includes('Tenant A')) {
      throw new Error('Verification failure: Tenant A failed to retrieve its own chunks.');
    }

    if (resultsB.length === 0 || !resultsB[0].text.includes('Tenant B')) {
      throw new Error('Verification failure: Tenant B failed to retrieve its own chunks.');
    }

    console.log('✅ Success: RAG queries strictly isolated. Tenant A results contain zero Tenant B data.');

    // 5. Test Soft Deactivation rule
    console.log('\n[5/5] Testing Soft Deactivation behavior...');
    
    // Deactivate Tenant A's policy catalog product
    await dbA.policyCatalog.update({
      where: { id: catalogA.id },
      data: { active: false },
    });

    const verifyCatalog = await dbA.policyCatalog.findUnique({
      where: { id: catalogA.id },
    });
    console.log(`- Catalog entry active status: ${verifyCatalog?.active}`);
    if (verifyCatalog?.active !== false) {
      throw new Error('Soft deactivation state update failed.');
    }

    console.log('✅ Soft deactivation verified: Policy Catalog record remains in database for historic reference.');

    console.log('\n==================================================');
    console.log('🎉 SUCCESS: ALL RAG MULTI-TENANT TESTS PASSED!');
    console.log('==================================================');

  } finally {
    // Clean up
    console.log('\nCleaning up database entries...');
    await dbA.policyDocumentChunk.deleteMany();
    await dbB.policyDocumentChunk.deleteMany();
    await dbA.policyCatalog.deleteMany();
    await dbB.policyCatalog.deleteMany();
    
    await prisma.tenant.deleteMany({
      where: {
        id: { in: [tenantA.id, tenantB.id] },
      },
    });
    console.log('Cleanup completed.');
  }
}

run()
  .catch((err) => {
    console.error('\n❌ Verification failed with error:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
