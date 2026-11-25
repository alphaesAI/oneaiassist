import { z } from 'zod';
import { authed, json } from '@/lib/marketing/auth';
import { prisma } from '@/lib/marketing/prisma';

const IdeaStatusEnum = z.enum(['UNASSIGNED', 'TO_DO', 'IN_PROGRESS', 'DONE']);

const CreateIdeaBody = z.object({
  title: z.string().trim().min(1, 'Please give your idea a title').max(300),
  body: z.string().max(20000).default(''),
  status: IdeaStatusEnum.default('UNASSIGNED'),
  tags: z.array(z.string().max(50)).max(20).default([]),
  mediaAssetId: z.string().nullish(),
});

export const GET = authed(async (_req, user) => {
  const ideas = await prisma.idea.findMany({
    where: { tenantId: user.tenantId },
    orderBy: { createdAt: 'desc' },
    include: {
      mediaAsset: true,
      author: { select: { id: true, email: true } },
    },
  });

  return json({
    ideas: ideas.map((idea) => ({
      ...idea,
      tags: (() => {
        try {
          return JSON.parse(idea.tags) as string[];
        } catch {
          return [];
        }
      })(),
    })),
  });
});

export const POST = authed(async (req, user) => {
  const input = CreateIdeaBody.parse(await req.json());

  if (input.mediaAssetId) {
    const asset = await prisma.mediaAsset.findFirst({
      where: { id: input.mediaAssetId, tenantId: user.tenantId },
    });
    if (!asset) {
      return json({ error: 'Invalid mediaAssetId' }, 400);
    }
  }

  const idea = await prisma.idea.create({
    data: {
      tenantId: user.tenantId,
      authorId: user.id,
      title: input.title,
      body: input.body,
      status: input.status,
      tags: JSON.stringify(input.tags),
      mediaAssetId: input.mediaAssetId ?? null,
    },
    include: {
      mediaAsset: true,
    },
  });

  return json(
    {
      idea: {
        ...idea,
        tags: input.tags,
      },
    },
    201
  );
});
