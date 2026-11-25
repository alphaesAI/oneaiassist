import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';

export interface AuthContext {
  id: string;
  email: string;
  tenantId: string;
  role: string;
}

export function authed(
  handler: (req: Request, user: AuthContext, ctx?: any) => Promise<Response>
) {
  return async (req: Request, ctx?: any) => {
    try {
      const session = await getServerSession(authOptions);
      if (!session || !session.user || !session.user.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      const tenantId = session.user.tenantId;
      if (!tenantId) {
        return NextResponse.json({ error: 'Tenant context required' }, { status: 403 });
      }

      const user: AuthContext = {
        id: session.user.id,
        email: session.user.email || '',
        tenantId,
        role: session.user.role || 'AGENT',
      };

      return await handler(req, user, ctx);
    } catch (err: any) {
      console.error('[Marketing API Error]', err);
      return NextResponse.json(
        { error: err?.message || 'Internal Server Error' },
        { status: err?.status || 500 }
      );
    }
  };
}

export function json(data: any, status = 200) {
  return NextResponse.json(data, { status });
}
