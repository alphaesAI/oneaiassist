import 'dotenv/config';
import { getTenantPrisma } from '../lib/db/index';
import bcrypt from 'bcryptjs';

async function testAuth() {
  console.log('Testing user findUnique with getTenantPrisma(GLOBAL, PLATFORM_OWNER)...');
  try {
    const db = getTenantPrisma('GLOBAL', 'PLATFORM_OWNER');
    const user = await db.user.findUnique({
      where: { email: 'admin@primemarketingexperts.com' },
    });
    console.log('User found:', user?.email, user?.role, user?.tenantId);
    if (user) {
      const match = await bcrypt.compare('password123', user.hashedPassword);
      console.log('Password match:', match);
    }
  } catch (err) {
    console.error('Query error:', err);
  }
}

testAuth();
