import { z } from 'zod';
import { authed, json } from '@/lib/marketing/auth';
import { prisma } from '@/lib/marketing/prisma';

const IdeaStatusEnum = z.enum(['UNASSIGNED', 'TO_DO', 'IN_PROGRESS', 'DONE']);

const UpdateIdeaBody = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  body: z.string().max(20000).optional(),
  status: IdeaStatusEnum.optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  mediaAssetId: z.string().nullish(),
});

export const PATCH = authed(async (req, user, { params }: { params: { id: string } }) => {
  const existing = await prisma.idea.findFirst({
    where: { id: params.id, tenantId: user.tenantId },
  });
  if (!existing) return json({ error: 'Idea not found' }, 404);

  const input = UpdateIdeaBody.parse(await req.json());

  if (input.mediaAssetId) {
    const asset = await prisma.mediaAsset.findFirst({
      where: { id: input.mediaAssetId, tenantId: user.tenantId },
    });
    if (!asset) {
      return json({ error: 'Invalid mediaAssetId' }, 400);
    }
  }

  const updated = await prisma.idea.update({
    where: { id: params.id },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.body !== undefined ? { body: input.body } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.tags !== undefined ? { tags: JSON.stringify(input.tags) } : {}),
      ...(input.mediaAssetId !== undefined ? { mediaAssetId: input.mediaAssetId } : {}),
    },
    include: {
      mediaAsset: true,
    },
  });

  return json({
    idea: {
      ...updated,
      tags: (() => {
        try {
          return JSON.parse(updated.tags) as string[];
        } catch {
          return [];
        }
      })(),
    },
  });
});

export const DELETE = authed(async (_req, user, { params }: { params: { id: string } }) => {
  const existing = await prisma.idea.findFirst({
    where: { id: params.id, tenantId: user.tenantId },
  });
  if (!existing) return json({ error: 'Idea not found' }, 404);

  await prisma.idea.delete({
    where: { id: params.id },
  });

  return json({ ok: true });
});
