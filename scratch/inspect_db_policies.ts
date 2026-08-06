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

const { getTenantPrisma } = require('../lib/db');

async function main() {
  // Use PLATFORM_OWNER role to bypass tenant RLS checks
  const db = getTenantPrisma('tenant_pme_ff9xl', 'PLATFORM_OWNER');

  const tenants = await db.tenant.findMany();
  console.log('All Tenants:', tenants.map((t: any) => ({ id: t.id, name: t.name, slug: t.slug })));

  for (const t of tenants) {
    const tDb = getTenantPrisma(t.id, 'PLATFORM_OWNER');
    const users = await tDb.user.findMany();
    const policies = await tDb.policyCatalogItem.findMany();
    console.log(`\nTenant [${t.name}] (id: ${t.id}, slug: ${t.slug}):`);
    console.log(`  Users (${users.length}):`, users.map((u: any) => ({ id: u.id, email: u.email, role: u.role })));
    console.log(`  Policies (${policies.length}):`, policies.map((p: any) => ({ id: p.id, policyId: p.policyId, name: p.name })));
  }
}

main().catch(console.error);
