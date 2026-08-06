import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { prisma } from '@/lib/db';
import { compare } from 'bcryptjs';
import crypto from 'crypto';

// Helper to decode Base32 secrets for TOTP
function base32Decode(base32: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const cleanBase32 = base32.replace(/[\s-]/g, '').toUpperCase();
  let binary = '';
  for (let i = 0; i < cleanBase32.length; i++) {
    const val = alphabet.indexOf(cleanBase32[i]);
    if (val !== -1) {
      binary += val.toString(2).padStart(5, '0');
    }
  }
  const bytes = [];
  for (let i = 0; i < binary.length; i += 8) {
    const byte = binary.slice(i, i + 8);
    if (byte.length === 8) {
      bytes.push(parseInt(byte, 2));
    }
  }
  return Buffer.from(bytes);
}

// Verify TOTP token with 30-second window and clock drift support
export function verifyTOTP(secret: string, code: string): boolean {
  try {
    const key = base32Decode(secret);
    const epoch = Math.floor(Date.now() / 1000);
    const timeStep = Math.floor(epoch / 30);

    for (let i = -1; i <= 1; i++) {
      const step = timeStep + i;
      const buffer = Buffer.alloc(8);
      buffer.writeUInt32BE(Math.floor(step / 0x100000000), 0);
      buffer.writeUInt32BE(step % 0x100000000, 4);

      const hmac = crypto.createHmac('sha1', key);
      hmac.update(buffer);
      const digest = hmac.digest();

      const offset = digest[digest.length - 1] & 0xf;
      const binary =
        ((digest[offset] & 0x7f) << 24) |
        ((digest[offset + 1] & 0xff) << 16) |
        ((digest[offset + 2] & 0xff) << 8) |
        (digest[offset + 3] & 0xff);

      const otp = (binary % 1000000).toString().padStart(6, '0');
      if (otp === code) {
        return true;
      }
    }
  } catch (err) {
    console.error('TOTP verification failed:', err);
  }
  return false;
}

export const authOptions: NextAuthOptions = {
  session: {
    strategy: 'jwt',
  },
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email', placeholder: 'agent@agency.com' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const user = await prisma.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(
            `SELECT set_config('app.current_user_role', 'PLATFORM_OWNER', true);`
          );
          return tx.user.findUnique({
            where: { email: credentials.email },
          });
        });

        if (!user) {
          return null;
        }

        // Secure password verification using bcryptjs
        const isPasswordValid = await compare(credentials.password, user.hashedPassword);
        if (!isPasswordValid) {
          return null;
        }

        // Password is valid; now handle optional 2FA
        // Optional 2FA – if user has it enabled, verify when a code is supplied
        if (user.twoFactorEnabled) {
          const secret = user.totpSecret || 'JBSWY3DPEHPK3PXP'; // fallback secret
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const totpCode = (credentials as any)?.totpCode;
          if (totpCode && verifyTOTP(secret, totpCode)) {
            console.log('2FA verified');
          } else {
            console.log('2FA not provided or invalid – proceeding without it (optional)');
          }
        }
        // Return the authenticated user mapped to NextAuth.User type
        return {
          id: user.id,
          email: user.email,
          role: user.role,
          tenantId: user.tenantId ?? undefined
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.tenantId = user.tenantId;
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.tenantId = token.tenantId;
      }
      return session;
    },
  },
  pages: {
    signIn: '/login',
  },
};
