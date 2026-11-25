import { z } from 'zod';
import { auditCaption } from './compliance';
import { appUrlIsPublic } from './env';
import type { Platform } from './platforms/types';
import { validatePost } from './platforms/validate';
import { prisma } from './prisma';

export const CreatePostBody = z.object({
  clientRequestId: z.string().min(8).max(100),
  title: z.string().trim().max(200).default(''),
  caption: z.string().max(70000).default(''),
  mediaAssetId: z.string().nullish(),
  accountIds: z.array(z.string()).min(1, 'Choose at least one account'),
  captionOverrides: z.record(z.string(), z.string().max(70000)).default({}),
  scheduledAt: z.string().datetime().nullish(),
  overrideAudit: z.boolean().default(false),
});

const SCHEDULE_GRACE_MS = 60_000;

export async function createPost(
  author: { id: string; tenantId: string; role?: string },
  input: z.infer<typeof CreatePostBody>
) {
  const { tenantId } = author;
  const repeat = await prisma.marketingPost.findUnique({
    where: { tenantId_clientRequestId: { tenantId, clientRequestId: input.clientRequestId } },
    include: { jobs: true },
  });
  if (repeat) {
    if (repeat.createdByUserId !== author.id) {
      throw new Error('Please try publishing again.');
    }
    return repeat;
  }

  const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
  if (scheduledAt && scheduledAt.getTime() < Date.now() - SCHEDULE_GRACE_MS) {
    throw new Error('The scheduled time is in the past.');
  }

  const accounts = await prisma.connectedAccount.findMany({
    where: { id: { in: input.accountIds }, tenantId },
  });
  if (accounts.length !== new Set(input.accountIds).size) {
    throw new Error('One of those accounts is not connected.');
  }

  const media = input.mediaAssetId
    ? await prisma.mediaAsset.findFirst({ where: { id: input.mediaAssetId, tenantId } })
    : null;
  if (input.mediaAssetId && !media) {
    throw new Error('That media file no longer exists.');
  }

  const rules = await prisma.complianceRule.findMany({ where: { tenantId } });
  const errors: Record<string, string[]> = {};
  const captions = new Map<string, string>();

  for (const account of accounts) {
    const caption = input.captionOverrides[account.id]?.trim()
      ? input.captionOverrides[account.id]
      : input.caption;
    captions.set(account.id, caption);
    const problems = validatePost(account.platform as Platform, {
      title: input.title,
      caption,
      media,
    });
    if (account.status !== 'ACTIVE') {
      problems.push('This account needs to be reconnected.');
    }
    if (
      media &&
      ['FACEBOOK', 'INSTAGRAM', 'THREADS'].includes(account.platform) &&
      !appUrlIsPublic()
    ) {
      problems.push('This platform fetches media from APP_URL, which must be a public https address.');
    }
    if (problems.length) {
      errors[`${account.platform} (${account.accountName})`] = problems;
    }
  }
  if (Object.keys(errors).length) {
    throw new Error('Validation failed for one or more platforms: ' + JSON.stringify(errors));
  }

  // Caption compliance check
  const audits = [...new Set(captions.values())].map((caption) => auditCaption(caption, rules));
  const critical = audits.flatMap((audit) => audit.findings.filter((f) => f.severity === 'CRITICAL'));
  if (critical.length && !input.overrideAudit) {
    throw new Error('The compliance check found critical issues: ' + JSON.stringify(critical));
  }

  return prisma.marketingPost.create({
    data: {
      tenantId,
      approvalStatus: null,
      createdByUserId: author.id,
      clientRequestId: input.clientRequestId,
      title: input.title,
      caption: input.caption,
      mediaAssetId: media?.id ?? null,
      scheduledAt,
      auditOverridden: critical.length > 0,
      jobs: {
        create: accounts.map((account) => ({
          tenantId,
          accountId: account.id,
          platform: account.platform,
          accountName: account.accountName,
          caption: captions.get(account.id)!,
          runAt: scheduledAt ?? new Date(),
        })),
      },
    },
    include: { jobs: true },
  });
}
