-- W2: statuses Meta can put an approved template into. Added in their own migration because
-- PostgreSQL cannot use a new enum value in the same transaction that adds it.
ALTER TYPE "TemplateStatus" ADD VALUE IF NOT EXISTS 'PAUSED';
ALTER TYPE "TemplateStatus" ADD VALUE IF NOT EXISTS 'DISABLED';
