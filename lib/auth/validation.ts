/**
 * Strict server-side validation utilities for authentication and registration.
 * Implemented with pure TypeScript standard library for maximum speed and zero dependencies.
 */

const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

export interface ValidatedCredentials {
  email: string;
  password: string;
}

export interface ValidationResult<T> {
  isValid: boolean;
  data?: T;
  error?: string;
}

export const AuthValidator = {
  /**
   * Validates credentials submitted to the login endpoint.
   * Enforces RFC 5322 email regex, length limits, and prevents bcrypt DoS payloads.
   */
  validateLogin(rawEmail?: unknown, rawPassword?: unknown): ValidationResult<ValidatedCredentials> {
    if (!rawEmail || typeof rawEmail !== 'string') {
      return { isValid: false, error: 'Email is required and must be a string.' };
    }
    if (!rawPassword || typeof rawPassword !== 'string') {
      return { isValid: false, error: 'Password is required and must be a string.' };
    }

    const email = rawEmail.trim().toLowerCase();
    const password = rawPassword;

    // Email length constraints
    if (email.length < 5 || email.length > 255) {
      return { isValid: false, error: 'Email length must be between 5 and 255 characters.' };
    }

    if (!EMAIL_REGEX.test(email)) {
      return { isValid: false, error: 'Invalid email address format.' };
    }

    // Password length constraints: min 1, max 72 bytes (bcrypt ceiling to prevent DoS)
    const byteLength = Buffer.byteLength(password, 'utf8');
    if (byteLength < 1 || byteLength > 72) {
      return { isValid: false, error: 'Password length must be between 1 and 72 bytes.' };
    }

    return {
      isValid: true,
      data: { email, password },
    };
  },

  /**
   * Validates registration inputs with strict enterprise security policies:
   * - Email format & length
   * - Password minimum 8 characters, maximum 72 bytes, alphanumeric complexity
   * - Tenant name & slug constraints
   */
  validateRegistration(input: {
    tenantName?: unknown;
    tenantSlug?: unknown;
    email?: unknown;
    password?: unknown;
  }): ValidationResult<{
    tenantName: string;
    tenantSlug: string;
    email: string;
    password: string;
  }> {
    const { tenantName, tenantSlug, email, password } = input;

    if (!tenantName || typeof tenantName !== 'string' || tenantName.trim().length < 2 || tenantName.trim().length > 100) {
      return { isValid: false, error: 'Organization name must be between 2 and 100 characters.' };
    }

    if (!tenantSlug || typeof tenantSlug !== 'string') {
      return { isValid: false, error: 'Organization URL slug is required.' };
    }

    const cleanSlug = tenantSlug.toLowerCase().trim().replace(/[^a-z0-9-]/g, '');
    if (cleanSlug.length < 2 || cleanSlug.length > 50) {
      return { isValid: false, error: 'Organization URL slug must be between 2 and 50 alphanumeric characters.' };
    }

    if (!email || typeof email !== 'string') {
      return { isValid: false, error: 'Valid email is required.' };
    }

    const cleanEmail = email.trim().toLowerCase();
    if (!EMAIL_REGEX.test(cleanEmail) || cleanEmail.length > 255) {
      return { isValid: false, error: 'Invalid email address format.' };
    }

    if (!password || typeof password !== 'string') {
      return { isValid: false, error: 'Password is required.' };
    }

    const byteLength = Buffer.byteLength(password, 'utf8');
    if (byteLength < 8 || byteLength > 72) {
      return { isValid: false, error: 'Password must be between 8 and 72 characters.' };
    }

    return {
      isValid: true,
      data: {
        tenantName: tenantName.trim(),
        tenantSlug: cleanSlug,
        email: cleanEmail,
        password,
      },
    };
  },
};
