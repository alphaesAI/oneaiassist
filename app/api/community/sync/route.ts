import { authed, json } from '@/lib/marketing/auth';
import { syncWorkspaceAccounts } from '@/lib/marketing/engagement';

export const POST = authed(async (_req, user) => {
  const results = await syncWorkspaceAccounts(user.tenantId);
  return json({ results });
});
