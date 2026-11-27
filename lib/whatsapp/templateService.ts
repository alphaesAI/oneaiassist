import type { Prisma, Template } from '@prisma/client';
import { prisma } from '@/lib/db';
import { WhatsAppConnectionError, WhatsAppConnectionService } from './connection';
import {
  MetaGraphError,
  createMessageTemplate,
  deleteMessageTemplate,
  getMessageTemplate,
  listMessageTemplates,
  updateMessageTemplate,
  type FetchLike,
  type MetaTemplate,
} from './metaGraph';
import {
  buildMetaComponents,
  mapMetaStatus,
  normalizeButtons,
  parseMetaComponents,
  validateWhatsAppTemplate,
  type TemplateVariables,
  type WhatsAppTemplateDraft,
} from './templateRules';

/** A problem the tenant can fix. `problems` lists each one separately when there are several. */
export class WhatsAppTemplateError extends Error {
  constructor(message: string, readonly status: number = 400, readonly problems: string[] = []) {
    super(message);
    this.name = 'WhatsAppTemplateError';
  }
}

interface Deps {
  fetchImpl?: FetchLike;
  now?: Date;
}

function toDraft(t: Template): WhatsAppTemplateDraft {
  return {
    name: t.name,
    language: t.language,
    category: t.category,
    headerType: t.headerType,
    header: t.header,
    body: t.body,
    footer: t.footer,
    buttons: normalizeButtons(t.ctaButtons),
    variables: (t.variables as TemplateVariables | null) ?? null,
  };
}

async function credentialsFor(tenantId: string): Promise<{ wabaId: string; accessToken: string }> {
  let creds;
  try {
    creds = await WhatsAppConnectionService.getCredentials(tenantId);
  } catch (err) {
    if (err instanceof WhatsAppConnectionError) {
      throw new WhatsAppTemplateError(
        'WhatsApp templates are reviewed by Meta, so the official WhatsApp Cloud API must be connected first. Connect it in Settings > WhatsApp.',
        409
      );
    }
    throw err;
  }
  if (!creds.wabaId) {
    throw new WhatsAppTemplateError('The WhatsApp Business Account ID is missing. Save the connection again in Settings > WhatsApp.', 409);
  }
  return { wabaId: creds.wabaId, accessToken: creds.accessToken };
}

function metaFailure(err: unknown, fallback: string): WhatsAppTemplateError {
  if (err instanceof WhatsAppTemplateError) return err;
  if (err instanceof MetaGraphError) return new WhatsAppTemplateError(err.message, err.httpStatus === 0 || err.httpStatus >= 500 ? 502 : 400);
  return new WhatsAppTemplateError(fallback, 500);
}

/** The fields we copy from Meta's view of a template. Meta is the authority on status and category. */
function statusFields(meta: MetaTemplate, now: Date): Prisma.TemplateUpdateManyMutationInput {
  const status = mapMetaStatus(meta.status);
  const category = meta.category && ['MARKETING', 'UTILITY', 'AUTHENTICATION'].includes(meta.category.toUpperCase())
    ? (meta.category.toUpperCase() as 'MARKETING' | 'UTILITY' | 'AUTHENTICATION')
    : undefined;
  return {
    status,
    metaStatus: meta.status || null,
    rejectionReason: status === 'REJECTED' ? meta.rejectedReason || 'Meta did not give a reason.' : null,
    qualityScore: meta.qualityScore,
    lastSyncedAt: now,
    ...(category ? { category } : {}),
  };
}

export class WhatsAppTemplateService {
  /** True when this template may be sent: Meta approved it, and it is the Meta template we know. */
  static isSendable(t: Pick<Template, 'channel' | 'status' | 'metaTemplateId'>): boolean {
    return t.channel === 'WHATSAPP' && t.status === 'APPROVED' && Boolean(t.metaTemplateId);
  }

  /**
   * Sends a template to Meta for review. Nothing is marked PENDING unless Meta accepted the
   * submission, and nothing is ever marked APPROVED here: only Meta's own answer does that.
   */
  static async submit(tenantId: string, templateId: string, deps: Deps = {}): Promise<Template> {
    const now = deps.now ?? new Date();
    const template = await prisma.template.findFirst({ where: { id: templateId, tenantId } });
    if (!template) throw new WhatsAppTemplateError('Template not found.', 404);
    if (template.channel !== 'WHATSAPP') throw new WhatsAppTemplateError('Only WhatsApp templates are submitted to Meta.', 400);
    if (template.status === 'PENDING') throw new WhatsAppTemplateError('This template is already waiting for Meta\'s review.', 409);
    if (template.status === 'DISABLED') {
      throw new WhatsAppTemplateError('Meta disabled this template. Create a new template with a different name.', 409);
    }

    const draft = toDraft(template);
    const problems = validateWhatsAppTemplate(draft);
    if (problems.length > 0) throw new WhatsAppTemplateError(problems.join(' '), 400, problems);

    const { wabaId, accessToken } = await credentialsFor(tenantId);
    const components = buildMetaComponents(draft);

    try {
      if (template.metaTemplateId) {
        // Already known to Meta (rejected, paused or approved): send the new content back for review.
        await updateMessageTemplate(
          { templateId: template.metaTemplateId, accessToken, category: template.category, components },
          deps.fetchImpl
        );
        return await prisma.template.update({
          where: { id: template.id },
          data: { status: 'PENDING', metaStatus: 'PENDING', rejectionReason: null, submittedAt: now, lastSyncedAt: now },
        });
      }

      const created = await createMessageTemplate(
        { wabaId, accessToken, name: template.name, language: template.language, category: template.category, components },
        deps.fetchImpl
      );
      return await prisma.template.update({
        where: { id: template.id },
        data: {
          metaTemplateId: created.id,
          status: mapMetaStatus(created.status),
          metaStatus: created.status,
          rejectionReason: mapMetaStatus(created.status) === 'REJECTED' ? 'Meta rejected the template on submission.' : null,
          submittedAt: now,
          lastSyncedAt: now,
        },
      });
    } catch (err) {
      throw metaFailure(err, 'The template could not be submitted to Meta.');
    }
  }

  /** Asks Meta for the current state of one template and stores it. */
  static async refreshOne(tenantId: string, templateId: string, deps: Deps = {}): Promise<Template> {
    const now = deps.now ?? new Date();
    const template = await prisma.template.findFirst({ where: { id: templateId, tenantId } });
    if (!template) throw new WhatsAppTemplateError('Template not found.', 404);
    if (!template.metaTemplateId) return template;
    const { accessToken } = await credentialsFor(tenantId);
    try {
      const meta = await getMessageTemplate({ templateId: template.metaTemplateId, accessToken }, deps.fetchImpl);
      await prisma.template.updateMany({ where: { id: template.id, tenantId }, data: statusFields(meta, now) });
      return await prisma.template.findFirstOrThrow({ where: { id: template.id, tenantId } });
    } catch (err) {
      throw metaFailure(err, 'The template status could not be read from Meta.');
    }
  }

  /**
   * Brings this tenant's templates in step with Meta: updates the status of the ones we know and
   * imports the ones that exist only at Meta. A template we believed was live but Meta no longer
   * has is marked DISABLED so it cannot be sent.
   */
  static async syncTenant(
    tenantId: string,
    deps: Deps = {}
  ): Promise<{ updated: number; imported: number; missingAtMeta: number; total: number }> {
    const now = deps.now ?? new Date();
    const { wabaId, accessToken } = await credentialsFor(tenantId);
    let metaTemplates: MetaTemplate[];
    try {
      metaTemplates = await listMessageTemplates({ wabaId, accessToken }, deps.fetchImpl);
    } catch (err) {
      throw metaFailure(err, 'The templates could not be read from Meta.');
    }

    const local = await prisma.template.findMany({ where: { tenantId, channel: 'WHATSAPP' } });
    const byMetaId = new Map(local.filter((t) => t.metaTemplateId).map((t) => [t.metaTemplateId as string, t]));
    const byNameLang = new Map(local.map((t) => [`${t.name}|${t.language}`, t]));
    const seenMetaIds = new Set<string>();
    let updated = 0;
    let imported = 0;

    for (const meta of metaTemplates) {
      if (!meta.id || !meta.name) continue;
      seenMetaIds.add(meta.id);
      const match = byMetaId.get(meta.id) ?? byNameLang.get(`${meta.name}|${meta.language}`);

      if (match) {
        // A local draft with the same name that was never submitted is the tenant's own unsent
        // work; it is linked to the Meta template only if it has no Meta ID of its own yet.
        if (match.metaTemplateId && match.metaTemplateId !== meta.id) continue;
        await prisma.template.updateMany({
          where: { id: match.id, tenantId },
          data: { ...statusFields(meta, now), metaTemplateId: meta.id },
        });
        updated++;
        continue;
      }

      const parsed = parseMetaComponents(meta.components);
      const status = parsed.unsupported ? 'DISABLED' : mapMetaStatus(meta.status);
      const category = ['MARKETING', 'UTILITY', 'AUTHENTICATION'].includes(String(meta.category).toUpperCase())
        ? (String(meta.category).toUpperCase() as 'MARKETING' | 'UTILITY' | 'AUTHENTICATION')
        : 'MARKETING';
      await prisma.template.create({
        data: {
          tenantId,
          channel: 'WHATSAPP',
          name: meta.name,
          language: meta.language || 'en',
          category,
          headerType: parsed.headerType,
          header: parsed.header,
          body: parsed.body,
          content: parsed.body,
          footer: parsed.footer,
          ctaButtons: parsed.buttons as unknown as Prisma.InputJsonValue,
          variables: parsed.variables as unknown as Prisma.InputJsonValue,
          metaTemplateId: meta.id,
          metaStatus: meta.status || null,
          status,
          rejectionReason: parsed.unsupported
            ? `Imported from Meta but cannot be used here: ${parsed.unsupported}`
            : status === 'REJECTED'
            ? meta.rejectedReason || 'Meta did not give a reason.'
            : null,
          qualityScore: meta.qualityScore,
          lastSyncedAt: now,
        },
      });
      imported++;
    }

    // Templates we hold a Meta ID for that Meta no longer lists were deleted at Meta.
    const missing = local.filter((t) => t.metaTemplateId && !seenMetaIds.has(t.metaTemplateId) && t.status !== 'DISABLED');
    for (const t of missing) {
      await prisma.template.updateMany({
        where: { id: t.id, tenantId },
        data: {
          status: 'DISABLED',
          metaStatus: 'DELETED',
          rejectionReason: 'This template no longer exists at Meta. It was deleted there.',
          lastSyncedAt: now,
        },
      });
    }

    return { updated, imported, missingAtMeta: missing.length, total: metaTemplates.length };
  }

  /** Deletes a template here and, when it was submitted, at Meta too. */
  static async remove(tenantId: string, templateId: string, deps: Deps = {}): Promise<void> {
    const template = await prisma.template.findFirst({ where: { id: templateId, tenantId } });
    if (!template) throw new WhatsAppTemplateError('Template not found.', 404);

    const inUse = await prisma.broadcastCampaign.count({
      where: { tenantId, templateId, status: { in: ['DRAFT', 'QUEUED', 'SENDING', 'PAUSED'] } },
    });
    if (inUse > 0) {
      throw new WhatsAppTemplateError('This template is used by a campaign that has not finished. Cancel or finish the campaign first.', 409);
    }

    if (template.channel === 'WHATSAPP' && template.metaTemplateId && template.metaStatus !== 'DELETED') {
      const { wabaId, accessToken } = await credentialsFor(tenantId);
      try {
        await deleteMessageTemplate({ wabaId, accessToken, name: template.name, templateId: template.metaTemplateId }, deps.fetchImpl);
      } catch (err) {
        // "Does not exist" at Meta means there is nothing left to delete there.
        if (!(err instanceof MetaGraphError && err.code === 100)) {
          throw metaFailure(err, 'The template could not be deleted at Meta.');
        }
      }
    }
    await prisma.template.deleteMany({ where: { id: template.id, tenantId } });
  }

  /**
   * A template event arrived on the webhook. The event itself is NOT trusted for the status: it only
   * tells us which template to look up, and the real status is then read from Meta with the tenant's
   * own token. A forged event can therefore never approve a template.
   */
  static async handleWebhookEvent(
    event: { wabaId: string; metaTemplateId: string },
    deps: Deps = {}
  ): Promise<{ refreshed: number }> {
    const wabaId = String(event.wabaId || '').trim();
    const metaTemplateId = String(event.metaTemplateId || '').trim();
    if (!wabaId || !metaTemplateId) return { refreshed: 0 };

    const numbers = await prisma.whatsAppNumber.findMany({
      where: { metaWabaId: wabaId, provider: 'META_CLOUD_API' },
      select: { tenantId: true },
    });
    let refreshed = 0;
    for (const { tenantId } of numbers) {
      const template = await prisma.template.findFirst({ where: { tenantId, channel: 'WHATSAPP', metaTemplateId } });
      if (!template) continue;
      try {
        await this.refreshOne(tenantId, template.id, deps);
        refreshed++;
      } catch (err) {
        console.error(`[WhatsApp templates] Could not refresh template ${template.id}:`, err instanceof Error ? err.message : err);
      }
    }
    return { refreshed };
  }

  /**
   * Periodic pull, run by the worker: every tenant that has templates waiting for review is synced,
   * so an approval is picked up even if the webhook never arrives.
   */
  static async syncPendingTenants(deps: Deps & { limit?: number } = {}): Promise<{ tenants: number; failed: number }> {
    const groups = await prisma.template.groupBy({
      by: ['tenantId'],
      where: { channel: 'WHATSAPP', status: 'PENDING', metaTemplateId: { not: null } },
      orderBy: { tenantId: 'asc' },
      take: deps.limit ?? 50,
    });
    let failed = 0;
    for (const { tenantId } of groups) {
      try {
        await this.syncTenant(tenantId, deps);
      } catch (err) {
        failed++;
        console.error(`[WhatsApp templates] Sync failed for tenant ${tenantId}:`, err instanceof Error ? err.message : err);
      }
    }
    return { tenants: groups.length, failed };
  }
}
