import 'dotenv/config';
import { prisma } from '../lib/db/index';

async function checkPmeUser() {
  const user = await prisma.user.findFirst({
    where: { email: 'admin@primemarketingexperts.com' },
    include: { tenant: true },
  });
  console.log('PME User:', user);
}

checkPmeUser().catch(console.error).finally(() => prisma.$disconnect());
