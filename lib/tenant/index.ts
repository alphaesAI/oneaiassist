import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { cookies } from 'next/headers';

export interface TenantContext {
  tenantId: string;
  userId: string;
  role: string;
}

/**
 * Safely extracts the tenant ID and user information from the server-side NextAuth session.
 * Never trust tenantId from client input in tenant-scoped dashboards.
 */
export async function getTenantContext(): Promise<TenantContext> {
  const session = await getServerSession(authOptions);

  if (!session || !session.user) {
    throw new Error('Unauthorized: No active session found');
  }

  const role = session.user.role;
  const userId = session.user.id;
  let tenantId = session.user.tenantId;

  // If a Platform Owner (SuperAdmin) has set an impersonation cookie, use that tenant context
  if (role === 'PLATFORM_OWNER') {
    try {
      const cookieStore = cookies();
      const impersonated = cookieStore.get('impersonated_tenant_id')?.value;
      if (impersonated) {
        tenantId = impersonated;
      }
    } catch {
      // Gracefully catch cases where cookies() cannot be accessed (e.g. static rendering)
    }
  }

  // PLATFORM_OWNER role might not have a tenantId associated (can view all or platform level)
  if (!tenantId && role !== 'PLATFORM_OWNER') {
    throw new Error('Unauthorized: No tenant context associated with this session');
  }

  return {
    tenantId: tenantId || '',
    userId,
    role,
  };
}
