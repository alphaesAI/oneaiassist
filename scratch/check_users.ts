import 'dotenv/config';
import { prisma } from '../lib/db/index';
import bcrypt from 'bcryptjs';

async function checkUsers() {
  const users = await prisma.user.findMany();
  console.log(`Found ${users.length} users in database:`);
  for (const u of users) {
    const isPwMatch = await bcrypt.compare('password123', u.hashedPassword);
    console.log(`- ID: ${u.id}, Email: ${u.email}, Role: ${u.role}, Tenant: ${u.tenantId}, Password 'password123' Match: ${isPwMatch ? '✅ MATCH' : '❌ NO'}`);
  }
}

checkUsers().catch(console.error).finally(() => prisma.$disconnect());
