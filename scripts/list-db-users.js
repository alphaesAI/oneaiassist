const { Client } = require('pg');

async function run() {
  const client = new Client({
    connectionString: 'postgresql://neondb_owner:npg_RrHoFq2wKSP3@ep-withered-hat-ahhoyqot.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require'
  });
  try {
    await client.connect();
    const res = await client.query('SELECT id, email, role, "tenantId" FROM "User"');
    console.log('Users in database:');
    console.log(JSON.stringify(res.rows, null, 2));
  } catch (err) {
    console.error('Error listing database users:', err);
  } finally {
    await client.end();
  }
}

run();
