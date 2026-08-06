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
  const users = await prisma.user.findMany({
    include: { tenant: true },
  });

  console.log('--- ALL USERS & TENANTS ---');
  for (const u of users) {
    console.log(`User ID: ${u.id} | Email: ${u.email} | Role: ${u.role} | Tenant ID: ${u.tenantId} | Tenant Name: ${u.tenant?.name}`);
    const db = getTenantPrisma(u.tenantId, 'ADMIN');
    const policies = await db.policyCatalogItem.findMany();
    console.log(`   -> PolicyCatalogItem count: ${policies.length}`);
    for (const p of policies) {
      console.log(`      * Policy: ${p.policyId} | Name: ${p.name}`);
    }
  }
}

main().finally(() => prisma.$disconnect());
