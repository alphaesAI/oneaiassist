import 'dotenv/config';
import { prisma } from '../lib/db/index';

async function testFix() {
  console.log('Testing WhatsAppNumber query after column migration...');
  const numbers = await prisma.whatsAppNumber.findMany();
  console.log(`✅ Success! Fetched ${numbers.length} records. Sample record:`, numbers[0] || 'No records');
}

testFix().catch(console.error).finally(() => prisma.$disconnect());
