import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const connectionString = process.env.DATABASE_URL;

async function checkMarketing() {
  const pool = new Pool({ connectionString });
  try {
    const res = await pool.query(`SELECT id, name, type, platforms, status, "complianceScore", "ctrPrediction", "auditResult", reach, "createdAt" FROM "MarketingCampaign" ORDER BY "createdAt" DESC LIMIT 10`);
    console.log('--- Marketing Campaigns in DB ---');
    console.table(res.rows);

    const connRes = await pool.query(`SELECT id, platform, status, "accountName" FROM "PlatformConnection"`);
    console.log('--- Platform Connections in DB ---');
    console.table(connRes.rows);
  } catch (err) {
    console.error('Error checking marketing db:', err);
  } finally {
    await pool.end();
  }
}

checkMarketing();
