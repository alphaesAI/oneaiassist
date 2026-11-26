import { prisma } from '@/lib/db';

/**
 * Checks that a journey's steps can really run for this tenant.
 * Returns a list of problems in plain language; an empty list means the journey may be activated.
 */
export async function validateJourneySteps(tenantId: string, rawSteps: unknown): Promise<string[]> {
  const problems: string[] = [];

  if (!Array.isArray(rawSteps) || rawSteps.length === 0) {
    return ['Add at least one step.'];
  }
  const steps = rawSteps as Array<Record<string, any>>;

  const templateIds = steps
    .filter((s) => (s?.type === 'SEND_EMAIL' || s?.type === 'SEND_WHATSAPP') && typeof s.templateId === 'string')
    .map((s) => s.templateId as string);
  const templateNames = steps
    .filter((s) => s?.type === 'SEND_WHATSAPP' && !s.templateId && typeof s.templateName === 'string')
    .map((s) => s.templateName as string);

  const templates =
    templateIds.length || templateNames.length
      ? await prisma.template.findMany({
          where: {
            tenantId,
            OR: [
              ...(templateIds.length ? [{ id: { in: templateIds } }] : []),
              ...(templateNames.length ? [{ name: { in: templateNames }, channel: 'WHATSAPP' as const }] : []),
            ],
          },
          select: { id: true, name: true, channel: true },
        })
      : [];

  const seenIds = new Set<string>();

  steps.forEach((step, index) => {
    const label = `Step ${index + 1}`;
    if (!step || typeof step !== 'object' || typeof step.type !== 'string') {
      problems.push(`${label}: missing step type.`);
      return;
    }
    if (typeof step.id === 'string' && step.id) {
      if (seenIds.has(step.id)) problems.push(`${label}: duplicate step id "${step.id}".`);
      seenIds.add(step.id);
    }

    switch (step.type) {
      case 'SEND_EMAIL': {
        if (!step.templateId) {
          problems.push(`${label}: choose an email template.`);
        } else if (!templates.some((t) => t.id === step.templateId && t.channel === 'EMAIL')) {
          problems.push(`${label}: the chosen email template does not exist.`);
        }
        break;
      }
      case 'SEND_WHATSAPP': {
        const found = step.templateId
          ? templates.some((t) => t.id === step.templateId && t.channel === 'WHATSAPP')
          : templates.some((t) => t.name === step.templateName && t.channel === 'WHATSAPP');
        if (!step.templateId && !step.templateName) problems.push(`${label}: choose a WhatsApp template.`);
        else if (!found) problems.push(`${label}: the chosen WhatsApp template does not exist.`);
        break;
      }
      case 'WAIT_DELAY': {
        const hours = Number(step.delayHours);
        if (!Number.isFinite(hours) || hours <= 0) problems.push(`${label}: wait time must be more than 0 hours.`);
        break;
      }
      case 'ADD_TAG':
      case 'REMOVE_TAG': {
        if (!step.tagName || !String(step.tagName).trim()) problems.push(`${label}: enter a tag name.`);
        break;
      }
      case 'UPDATE_ATTRIBUTE': {
        if (!step.attributeKey) problems.push(`${label}: enter the field to update.`);
        break;
      }
      case 'BRANCH_CONDITION':
      case 'HANDOFF_TO_HUMAN':
      case 'SEND_INSTAGRAM':
        break;
      default:
        problems.push(`${label}: unknown step type "${step.type}".`);
    }
  });

  return problems;
}
