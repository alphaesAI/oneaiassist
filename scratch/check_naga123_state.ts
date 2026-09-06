import 'dotenv/config';
import { prisma } from '../lib/db/index';

async function checkNaga123() {
  await prisma.$executeRawUnsafe(`SELECT set_config('app.current_user_role', 'PLATFORM_OWNER', true);`);

  const customers = await prisma.customer.findMany({
    where: { displayName: { contains: 'naga', mode: 'insensitive' } },
    include: {
      leads: {
        include: {
          intakeSession: true,
        }
      },
      conversations: {
        include: {
          messages: { orderBy: { createdAt: 'asc' } }
        }
      }
    }
  });

  console.log('--- Naga Customers & Leads in DB ---');
  console.log(JSON.stringify(customers, null, 2));
}

checkNaga123().catch(console.error).finally(() => prisma.$disconnect());
