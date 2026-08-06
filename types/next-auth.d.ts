import DefaultAuth, { DefaultSession, DefaultUser } from 'next-auth';
import { JWT as DefaultJWT } from 'next-auth/jwt';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      role: string;
      tenantId?: string;
    } & DefaultSession['user'];
  }

  interface User extends DefaultUser {
    role: string;
    tenantId?: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT extends DefaultJWT {
    id: string;
    role: string;
    tenantId?: string;
  }
}
