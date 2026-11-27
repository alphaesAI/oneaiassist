/**
 * One-time helper for step W1. Before W1, WhatsApp Cloud API access tokens were stored in plain text.
 * This encrypts any that are still plain. Tokens that already decrypt are left untouched.
 *
 *   npx tsx scripts/encrypt-meta-tokens.ts           (dry run: only reports how many rows would change)
 *   npx tsx scripts/encrypt-meta-tokens.ts --apply   (writes the changes)
 *
 * It never prints a token.
 */
import 'dotenv/config';
import { prisma } from '../lib/db';
import { decrypt, encrypt } from '../lib/encryption';

async function main() {
  const apply = process.argv.includes('--apply');
  const rows = await prisma.whatsAppNumber.findMany({
    where: { metaAccessToken: { not: null } },
    select: { id: true, tenantId: true, metaAccessToken: true },
  });

  let alreadyEncrypted = 0;
  let changed = 0;
  for (const row of rows) {
    const stored = row.metaAccessToken || '';
    if (!stored) continue;
    let isEncrypted = false;
    try {
      isEncrypted = Boolean(decrypt(stored));
    } catch {
      isEncrypted = false;
    }
    if (isEncrypted) {
      alreadyEncrypted++;
      continue;
    }
    changed++;
    if (apply) {
      await prisma.whatsAppNumber.update({
        where: { id: row.id },
        data: { metaAccessToken: encrypt(stored) },
      });
    }
    console.log(`${apply ? 'Encrypted' : 'Would encrypt'} the token for tenant ${row.tenantId}`);
  }

  console.log(`Rows with a token: ${rows.length}. Already encrypted: ${alreadyEncrypted}. ${apply ? 'Encrypted now' : 'To encrypt'}: ${changed}.`);
  if (!apply && changed > 0) console.log('Dry run only. Run again with --apply to write the changes.');
}

main()
  .catch((err) => {
    console.error('Failed:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
