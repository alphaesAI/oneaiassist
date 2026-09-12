/**
 * In-memory sliding-window rate limiter for authentication endpoints.
 * Protects against brute-force attacks and credential stuffing.
 */

interface RateLimitRecord {
  failedAttempts: number;
  firstFailedAt: number;
  lockedUntil?: number;
}

const loginAttempts = new Map<string, RateLimitRecord>();

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes window
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes lockout

// Clean up stale records periodically (every 10 minutes)
setInterval(() => {
  const now = Date.now();
  loginAttempts.forEach((record, key) => {
    if (record.lockedUntil && record.lockedUntil < now) {
      loginAttempts.delete(key);
    } else if (!record.lockedUntil && now - record.firstFailedAt > WINDOW_MS) {
      loginAttempts.delete(key);
    }
  });
}, 10 * 60 * 1000).unref();

export const LoginRateLimiter = {
  /**
   * Checks if an identifier (email or IP) is currently rate-limited.
   */
  check(key: string): { isAllowed: boolean; retryAfterMinutes?: number } {
    const record = loginAttempts.get(key.toLowerCase().trim());
    if (!record) {
      return { isAllowed: true };
    }

    const now = Date.now();

    // If currently locked out
    if (record.lockedUntil && record.lockedUntil > now) {
      const remainingMs = record.lockedUntil - now;
      const retryAfterMinutes = Math.ceil(remainingMs / (60 * 1000));
      return { isAllowed: false, retryAfterMinutes };
    }

    // If window has expired without hitting max attempts, clear record
    if (now - record.firstFailedAt > WINDOW_MS) {
      loginAttempts.delete(key.toLowerCase().trim());
      return { isAllowed: true };
    }

    return { isAllowed: true };
  },

  /**
   * Records a failed login attempt. If threshold is reached, locks the account.
   */
  recordFailure(key: string): void {
    const normalizedKey = key.toLowerCase().trim();
    const now = Date.now();
    const record = loginAttempts.get(normalizedKey);

    if (!record || now - record.firstFailedAt > WINDOW_MS) {
      loginAttempts.set(normalizedKey, {
        failedAttempts: 1,
        firstFailedAt: now,
      });
      return;
    }

    record.failedAttempts += 1;
    if (record.failedAttempts >= MAX_ATTEMPTS) {
      record.lockedUntil = now + LOCKOUT_MS;
      console.warn(`[LoginRateLimiter] Target '${normalizedKey}' locked out for 15 minutes due to ${record.failedAttempts} failed attempts.`);
    }
  },

  /**
   * Resets the failed attempts counter on successful login.
   */
  reset(key: string): void {
    loginAttempts.delete(key.toLowerCase().trim());
  },
};
