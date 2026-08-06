export interface OTPProvider {
  sendOTP(phoneNumber: string): Promise<boolean>;
  verifyOTP(phoneNumber: string, code: string): Promise<boolean>;
}

// Swappable Twilio Verify implementation
class TwilioVerifyProvider implements OTPProvider {
  private accountSid: string;
  private authToken: string;
  private serviceSid: string;

  constructor() {
    this.accountSid = process.env.TWILIO_ACCOUNT_SID || '';
    this.authToken = process.env.TWILIO_AUTH_TOKEN || '';
    this.serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID || '';
  }

  async sendOTP(phoneNumber: string): Promise<boolean> {
    if (!this.accountSid || !this.authToken || !this.serviceSid) {
      console.warn('[Twilio Verify] Configuration missing. Falling back to mock behavior.');
      return mockProvider.sendOTP(phoneNumber);
    }

    try {
      const url = `https://verify.twilio.com/v2/Services/${this.serviceSid}/Verifications`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64')}`,
        },
        body: new URLSearchParams({
          To: phoneNumber,
          Channel: 'sms',
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        console.error('[Twilio Verify] Send failed:', data);
        return false;
      }
      return true;
    } catch (e) {
      console.error('[Twilio Verify] Send error:', e);
      return false;
    }
  }

  async verifyOTP(phoneNumber: string, code: string): Promise<boolean> {
    if (!this.accountSid || !this.authToken || !this.serviceSid) {
      return mockProvider.verifyOTP(phoneNumber, code);
    }

    try {
      const url = `https://verify.twilio.com/v2/Services/${this.serviceSid}/VerificationCheck`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64')}`,
        },
        body: new URLSearchParams({
          To: phoneNumber,
          Code: code,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        console.error('[Twilio Verify] Verification failed:', data);
        return false;
      }

      const data = await res.json();
      return data.status === 'approved';
    } catch (e) {
      console.error('[Twilio Verify] Verification error:', e);
      return false;
    }
  }
}

// Swappable Mock implementation for testing
class MockOTPProvider implements OTPProvider {
  async sendOTP(phoneNumber: string): Promise<boolean> {
    console.log(`[Mock OTP] Sent verification code to: ${phoneNumber}`);
    return true; // Auto-succeed in sending
  }

  async verifyOTP(phoneNumber: string, code: string): Promise<boolean> {
    console.log(`[Mock OTP] Verifying code ${code} for phone: ${phoneNumber}`);
    return code === '123456'; // Default mock verify code is 123456
  }
}

const mockProvider = new MockOTPProvider();
const twilioProvider = new TwilioVerifyProvider();

// Active provider switches based on Twilio config presence
export const otpService: OTPProvider =
  process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_VERIFY_SERVICE_SID
    ? twilioProvider
    : mockProvider;
