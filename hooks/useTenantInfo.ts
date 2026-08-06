import { useQuery } from '@tanstack/react-query';

export interface TenantInfo {
  tenantName: string;
  email: string;
  role: string;
  tenantId: string;
  aiTrialExceeded: boolean;
}

export function useTenantInfo() {
  return useQuery<TenantInfo>({
    queryKey: ['tenantInfo'],
    queryFn: async () => {
      const res = await fetch('/api/tenant/info');
      if (!res.ok) {
        throw new Error('Failed to fetch tenant info');
      }
      return res.json();
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
}
