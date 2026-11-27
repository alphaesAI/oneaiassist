import { prisma } from '@/lib/db';
import { decrypt, encrypt } from '@/lib/encryption';
import { MetaGraphError, subscribeAppToWaba, verifyConnection, type FetchLike } from './metaGraph';

export const META_PROVIDER = 'META_CLOUD_API';
const MASK = '••••';
const ID_PATTERN = /^\d{5,30}$/;

/** A problem the tenant admin can fix. `status` is the HTTP status the API route should answer with. */
export class WhatsAppConnectionError extends Error {
  constructor(message: string, readonly status: number = 400) {
    super(message);
    this.name = 'WhatsAppConnectionError';
  }
}

export interface WhatsAppConnectionView {
  provider: string;
  status: string;
  metaPhoneNumberId: string;
  metaWabaId: string;
  /** Masked. The real token is never returned. */
  metaAccessToken: string;
  accessTokenConfigured: boolean;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  qualityRating: string | null;
  messagingLimitTier: string | null;
  lastVerifiedAt: Date | null;
  webhookSubscribed: boolean;
  lastError: string | null;
  webhookPath: string;
}

export interface SaveConnectionInput {
  wabaId?: unknown;
  phoneNumberId?: unknown;
  accessToken?: unknown;
}

export const META_WEBHOOK_PATH = '/api/webhook/meta';

/**
 * What a WhatsApp line is reset to when it is disconnected. The Cloud API credentials are removed
 * too, so the stored token does not outlive the connection and the number can be connected again.
 */
export const DISCONNECTED_LINE = {
  sessionData: '',
  status: 'DISCONNECTED',
  phoneNumber: null,
  provider: 'BAILEYS',
  metaPhoneNumberId: null,
  metaWabaId: null,
  metaAccessToken: null,
  displayPhoneNumber: null,
  verifiedName: null,
  qualityRating: null,
  messagingLimitTier: null,
  lastVerifiedAt: null,
  webhookSubscribedAt: null,
  lastError: null,
} as const;

function toView(row: Awaited<ReturnType<typeof prisma.whatsAppNumber.findUnique>>): WhatsAppConnectionView {
  return {
    provider: row?.provider || 'BAILEYS',
    status: row?.status || 'DISCONNECTED',
    metaPhoneNumberId: row?.metaPhoneNumberId || '',
    metaWabaId: row?.metaWabaId || '',
    metaAccessToken: row?.metaAccessToken ? '••••••••••••••••' : '',
    accessTokenConfigured: Boolean(row?.metaAccessToken),
    displayPhoneNumber: row?.displayPhoneNumber ?? null,
    verifiedName: row?.verifiedName ?? null,
    qualityRating: row?.qualityRating ?? null,
    messagingLimitTier: row?.messagingLimitTier ?? null,
    lastVerifiedAt: row?.lastVerifiedAt ?? null,
    webhookSubscribed: Boolean(row?.webhookSubscribedAt),
    lastError: row?.lastError ?? null,
    webhookPath: META_WEBHOOK_PATH,
  };
}

/** Reads the stored token. It is always stored encrypted; a value that cannot be decrypted is never used as-is. */
function readStoredToken(stored: string | null | undefined): string {
  if (!stored) {
    throw new WhatsAppConnectionError('No WhatsApp access token is saved. Enter the access token in Settings > WhatsApp.');
  }
  try {
    const token = decrypt(stored);
    if (!token) throw new Error('empty');
    return token;
  } catch {
    throw new WhatsAppConnectionError(
      'The saved WhatsApp access token could not be read. Enter the access token again in Settings > WhatsApp.'
    );
  }
}

function failureMessage(err: unknown): string {
  if (err instanceof MetaGraphError || err instanceof WhatsAppConnectionError) return err.message;
  return 'The connection to Meta could not be checked. Try again.';
}

export class WhatsAppConnectionService {
  static async getView(tenantId: string): Promise<WhatsAppConnectionView> {
    const row = await prisma.whatsAppNumber.findUnique({ where: { tenantId } });
    return toView(row);
  }

  /**
   * Credentials for sending through the Cloud API. Throws a clear error when the tenant is not
   * fully set up; there is deliberately no fallback to another transport or another tenant.
   */
  static async getCredentials(tenantId: string): Promise<{ phoneNumberId: string; wabaId: string | null; accessToken: string }> {
    const row = await prisma.whatsAppNumber.findUnique({ where: { tenantId } });
    if (!row || row.provider !== META_PROVIDER || !row.metaPhoneNumberId) {
      throw new WhatsAppConnectionError('WhatsApp Cloud API is not set up for this account. Connect it in Settings > WhatsApp.');
    }
    return { phoneNumberId: row.metaPhoneNumberId, wabaId: row.metaWabaId, accessToken: readStoredToken(row.metaAccessToken) };
  }

  /**
   * Saves Cloud API credentials. The number is marked CONNECTED only after Meta confirms the token,
   * the phone number, and that the number belongs to the account.
   */
  static async saveAndVerify(
    tenantId: string,
    input: SaveConnectionInput,
    deps: { fetchImpl?: FetchLike; now?: Date } = {}
  ): Promise<{ view: WhatsAppConnectionView; warning: string | null }> {
    const now = deps.now ?? new Date();
    const wabaId = typeof input.wabaId === 'string' ? input.wabaId.trim() : '';
    const phoneNumberId = typeof input.phoneNumberId === 'string' ? input.phoneNumberId.trim() : '';
    const rawToken = typeof input.accessToken === 'string' ? input.accessToken.trim() : '';

    if (!ID_PATTERN.test(wabaId)) {
      throw new WhatsAppConnectionError('Enter the WhatsApp Business Account ID. It is a number, shown in Meta Business Manager.');
    }
    if (!ID_PATTERN.test(phoneNumberId)) {
      throw new WhatsAppConnectionError('Enter the Phone Number ID. It is a number, shown in the WhatsApp API setup page of your Meta app.');
    }

    const existing = await prisma.whatsAppNumber.findUnique({ where: { tenantId } });

    // An empty or masked token field means "keep the token that is already saved".
    const tokenTyped = Boolean(rawToken) && !rawToken.includes(MASK);
    const accessToken = tokenTyped ? rawToken : readStoredToken(existing?.metaAccessToken);

    const owner = await prisma.whatsAppNumber.findFirst({
      where: { metaPhoneNumberId: phoneNumberId, NOT: { tenantId } },
      select: { id: true },
    });
    if (owner) {
      throw new WhatsAppConnectionError('This WhatsApp phone number is already connected to another account.', 409);
    }

    let details;
    try {
      details = await verifyConnection({ wabaId, phoneNumberId, accessToken }, deps.fetchImpl);
    } catch (err) {
      const message = failureMessage(err);
      // Nothing about the failed attempt is saved as working. An existing row keeps its old
      // credentials and only records why the new attempt failed.
      if (existing) {
        await prisma.whatsAppNumber.update({ where: { tenantId }, data: { lastError: message } });
      }
      throw new WhatsAppConnectionError(message, 400);
    }

    let webhookSubscribedAt: Date | null = null;
    let warning: string | null = null;
    try {
      await subscribeAppToWaba({ wabaId, accessToken }, deps.fetchImpl);
      webhookSubscribedAt = now;
    } catch (err) {
      warning = `Connected, but incoming messages and delivery updates will not arrive yet: ${failureMessage(err)}`;
    }

    const data = {
      provider: META_PROVIDER,
      status: 'CONNECTED' as const,
      metaPhoneNumberId: phoneNumberId,
      metaWabaId: wabaId,
      metaAccessToken: encrypt(accessToken),
      displayPhoneNumber: details.displayPhoneNumber,
      verifiedName: details.verifiedName,
      qualityRating: details.qualityRating,
      messagingLimitTier: details.messagingLimitTier,
      phoneNumber: details.displayPhoneNumber ? encrypt(details.displayPhoneNumber) : null,
      lastVerifiedAt: now,
      lastConnectedAt: now,
      webhookSubscribedAt,
      lastError: warning,
    };

    const saved = await prisma.whatsAppNumber.upsert({
      where: { tenantId },
      create: { tenantId, sessionData: 'meta_cloud_config', ...data },
      update: data,
    });
    return { view: toView(saved), warning };
  }

  /** Re-checks the saved credentials with Meta and refreshes quality rating, tier and status. */
  static async testSaved(
    tenantId: string,
    deps: { fetchImpl?: FetchLike; now?: Date } = {}
  ): Promise<{ ok: boolean; view: WhatsAppConnectionView; error: string | null }> {
    const now = deps.now ?? new Date();
    const row = await prisma.whatsAppNumber.findUnique({ where: { tenantId } });
    if (!row || row.provider !== META_PROVIDER || !row.metaPhoneNumberId || !row.metaWabaId) {
      throw new WhatsAppConnectionError('WhatsApp Cloud API is not set up yet. Save the connection details first.');
    }

    try {
      const accessToken = readStoredToken(row.metaAccessToken);
      const details = await verifyConnection(
        { wabaId: row.metaWabaId, phoneNumberId: row.metaPhoneNumberId, accessToken },
        deps.fetchImpl
      );
      const saved = await prisma.whatsAppNumber.update({
        where: { tenantId },
        data: {
          status: 'CONNECTED',
          displayPhoneNumber: details.displayPhoneNumber,
          verifiedName: details.verifiedName,
          qualityRating: details.qualityRating,
          messagingLimitTier: details.messagingLimitTier,
          lastVerifiedAt: now,
          lastError: row.webhookSubscribedAt ? null : row.lastError,
        },
      });
      return { ok: true, view: toView(saved), error: null };
    } catch (err) {
      const message = failureMessage(err);
      // A temporary problem (network, rate limit, Meta outage) says nothing about the credentials,
      // so the line keeps its status. Only a real refusal from Meta marks it as not connected.
      const temporary =
        err instanceof MetaGraphError &&
        (err.httpStatus === 0 || err.httpStatus === 429 || err.httpStatus >= 500 || err.code === 4 || err.code === 80007);
      const saved = await prisma.whatsAppNumber.update({
        where: { tenantId },
        data: { ...(temporary ? {} : { status: 'DISCONNECTED' as const }), lastError: message },
      });
      return { ok: false, view: toView(saved), error: message };
    }
  }
}
