import { NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/tenant';
import { getTenantPrisma } from '@/lib/db';
import { encrypt, decrypt } from '@/lib/encryption';

export async function GET() {
  try {
    const { tenantId, role } = await getTenantContext();
    const db = getTenantPrisma(tenantId, role);

    const [config, botConfig] = await Promise.all([
      db.tenantAIConfig.findUnique({
        where: { tenantId },
      }),
      db.botConfig.findUnique({
        where: { tenantId },
      }),
    ]);

    const botName = botConfig?.name || '';
    const greetingMessage = botConfig?.greetingMessage || '';

    if (!config) {
      return NextResponse.json({
        provider: 'OPENAI',
        isActive: false,
        apiKeyMasked: '',
        botName,
        greetingMessage,
      });
    }

    let apiKeyMasked = '';
    if (config.encryptedApiKey) {
      try {
        const decrypted = decrypt(config.encryptedApiKey);
        if (decrypted.length > 8) {
          apiKeyMasked = `${decrypted.slice(0, 4)}...${decrypted.slice(-4)}`;
        } else {
          apiKeyMasked = '••••••••';
        }
      } catch {
        apiKeyMasked = '••••••••';
      }
    }

    return NextResponse.json({
      provider: config.provider,
      isActive: config.isActive,
      apiKeyMasked,
      botName,
      greetingMessage,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unauthorized';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { tenantId, role } = await getTenantContext();
    const db = getTenantPrisma(tenantId, role);

    const { provider, apiKey, isActive, botName, greetingMessage } = await req.json();

    if (!provider) {
      return NextResponse.json({ error: 'provider is required' }, { status: 400 });
    }

    // Load existing config to check if key is changing or just mask is passed
    const existing = await db.tenantAIConfig.findUnique({
      where: { tenantId },
    });

    let finalEncryptedKey = existing?.encryptedApiKey || '';

    // Only encrypt if it's a new key (not masked placeholder)
    if (apiKey && !apiKey.includes('...')) {
      finalEncryptedKey = encrypt(apiKey);
    }

    // Upsert both tenantAIConfig and botConfig
    const [config] = await Promise.all([
      db.tenantAIConfig.upsert({
        where: { tenantId },
        create: {
          tenantId,
          provider,
          encryptedApiKey: finalEncryptedKey,
          isActive: isActive ?? true,
        },
        update: {
          provider,
          encryptedApiKey: finalEncryptedKey,
          isActive: isActive ?? true,
        },
      }),
      botName !== undefined && greetingMessage !== undefined
        ? db.botConfig.upsert({
            where: { tenantId },
            create: {
              tenantId,
              name: botName,
              greetingMessage,
            },
            update: {
              name: botName,
              greetingMessage,
            },
          })
        : Promise.resolve(null),
    ]);

    return NextResponse.json({
      success: true,
      provider: config.provider,
      isActive: config.isActive,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unauthorized';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
