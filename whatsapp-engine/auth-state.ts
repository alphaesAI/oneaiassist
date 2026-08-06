import { initAuthCreds, BufferJSON, makeCacheableSignalKeyStore } from '@whiskeysockets/baileys';
import { getTenantPrisma } from '../lib/db/index';
import { encrypt, decrypt } from '../lib/encryption';
import pino from 'pino';

const silentLogger = pino({ level: 'silent' });

/**
 * Custom Baileys authentication state provider that stores credentials in PostgreSQL (Neon)
 * encrypted with AES-256-GCM. Uses RLS-compliant client.
 * Wraps the signal key store with Baileys' official makeCacheableSignalKeyStore to prevent
 * write-then-read races that cause "Closing session" spam and broken message encryption.
 */
export async function getDatabaseAuthState(tenantId: string) {
  const db = getTenantPrisma(tenantId, 'ADMIN');

  // Fetch existing session record
  const session = await db.whatsAppNumber.findUnique({
    where: { tenantId },
  });

  let creds = initAuthCreds();
  let keys: Record<string, any> = {};

  if (session && session.sessionData && session.sessionData.includes(':')) {
    try {
      const decrypted = decrypt(session.sessionData);
      const parsed = JSON.parse(decrypted, BufferJSON.reviver);
      if (parsed && parsed.creds) creds = parsed.creds;
      if (parsed && parsed.keys) keys = parsed.keys;
    } catch (e) {
      console.warn(`[Auth State] Corrupted sessionData for tenant ${tenantId}, resetting.`);
      creds = initAuthCreds();
      keys = {};
    }
  }

  let saveTimer: ReturnType<typeof setTimeout> | null = null;

  const saveState = () => {
    // Debounce: Baileys fires creds.update + key.set() many times per second during
    // the WS handshake. Without this, every call opens a new Neon transaction and
    // exhausts the connection pool (P2028). Batch all rapid calls into one write.
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      saveTimer = null;
      try {
        const serialized = JSON.stringify({ creds, keys }, BufferJSON.replacer);
        const encrypted = encrypt(serialized);
        await db.whatsAppNumber.upsert({
          where: { tenantId },
          create: { tenantId, sessionData: encrypted, status: 'QR_PENDING' },
          update: { sessionData: encrypted },
        });
      } catch (e) {
        console.error(`[Auth State] Failed to save sessionData for tenant ${tenantId}:`, e);
      }
    }, 300);
  };


  // Raw key store backed by the in-memory `keys` map
  const rawKeyStore = {
    get: (type: string, ids: string[]) => {
      const data: Record<string, any> = {};
      for (const id of ids) {
        const val = keys[`${type}:${id}`];
        if (val) data[id] = val;
      }
      return data;
    },
    set: (data: any) => {
      for (const type of Object.keys(data)) {
        for (const id of Object.keys(data[type])) {
          const val = data[type][id];
          if (val) {
            keys[`${type}:${id}`] = val;
          } else {
            delete keys[`${type}:${id}`];
          }
        }
      }
      saveState();
    },
  };

  return {
    state: {
      creds,
      // Fix 2: wrap with official caching layer to prevent Signal key race conditions
      keys: makeCacheableSignalKeyStore(rawKeyStore, silentLogger as any),
    },
    saveCreds: () => { saveState(); },
  };
}

/**
 * Fix 5: Dedicated clear function — wipes all auth data for a tenant.
 * Called on loggedOut (401/405) to guarantee a clean slate for the next connect.
 */
export async function clearDatabaseAuthState(tenantId: string): Promise<void> {
  const db = getTenantPrisma(tenantId, 'ADMIN');
  await db.whatsAppNumber.upsert({
    where: { tenantId },
    create: { tenantId, sessionData: '', status: 'DISCONNECTED', phoneNumber: null },
    update: { sessionData: '', status: 'DISCONNECTED', phoneNumber: null },
  });
  console.log(`[Auth State] Credentials cleared for tenant ${tenantId}`);
}
