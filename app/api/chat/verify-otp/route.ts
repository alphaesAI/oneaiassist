import { NextResponse } from 'next/server';
import { prisma, getTenantPrisma } from '@/lib/db';
import { encrypt, decrypt } from '@/lib/encryption';
import { otpService } from '@/lib/otp';

export async function POST(req: Request) {
  try {
    const { tenantSlug, phoneNumber, code } = await req.json();

    if (!tenantSlug || !phoneNumber || !code) {
      return NextResponse.json({ error: 'tenantSlug, phoneNumber, and code are required' }, { status: 400 });
    }

    const cleanPhone = phoneNumber.replace(/[^0-9+]/g, '');

    // 1. Verify OTP Code
    const verified = await otpService.verifyOTP(cleanPhone, code);
    if (!verified) {
      return NextResponse.json({ error: 'Invalid verification code.' }, { status: 400 });
    }

    // 2. Resolve Tenant (Tenant has no RLS)
    const tenant = await prisma.tenant.findUnique({
      where: { slug: tenantSlug.toLowerCase().trim() },
    });

    if (!tenant) {
      return NextResponse.json({ error: 'Agency not found.' }, { status: 404 });
    }

    const tenantId = tenant.id;

    // 3. Obtain tenant-scoped RLS client
    const db = getTenantPrisma(tenantId, 'ADMIN');

    // 4. Execute Identity Unification inside transaction on the tenant-scoped client
    const result = await db.$transaction(async (tx) => {
      // Fetch all customers for this tenant to check decrypt matches in memory
      const customers = await tx.customer.findMany();

      let targetCustomer = null;

      for (const c of customers) {
        try {
          const decPhone = decrypt(c.primaryPhone);
          if (decPhone === cleanPhone) {
            // Prefer already verified customer if there's any ambiguity
            if (!targetCustomer || c.otpVerified) {
              targetCustomer = c;
            }
          }
        } catch {
          // Ignore decryption failures
        }
      }

      // If existing customer found, unify it!
      if (targetCustomer) {
        console.log(`[Unification] Verified phone ${cleanPhone} matched existing Customer ID: ${targetCustomer.id}`);

        if (!targetCustomer.otpVerified) {
          targetCustomer = await tx.customer.update({
            where: { id: targetCustomer.id },
            data: {
              otpVerified: true,
              optedIn: true,
              optedInAt: targetCustomer.optedInAt || new Date(),
            },
          });
        }
      } else {
        // Create new Customer if none exists
        console.log(`[Unification] Creating new Customer for verified phone: ${cleanPhone}`);
        targetCustomer = await tx.customer.create({
          data: {
            tenantId,
            displayName: `Visitor ${cleanPhone.slice(-4)}`,
            primaryPhone: encrypt(cleanPhone),
            otpVerified: true,
            optedIn: true,
            optedInAt: new Date(),
          },
        });
      }

      // Resolve or create CustomerChannel for WEBCHAT
      let channel = await tx.customerChannel.findFirst({
        where: {
          customerId: targetCustomer.id,
          channel: 'WEBCHAT',
        },
      });

      if (!channel) {
        channel = await tx.customerChannel.create({
          data: {
            tenantId,
            customerId: targetCustomer.id,
            channel: 'WEBCHAT',
            channelIdentifier: cleanPhone,
            channelMetadata: {},
          },
        });
      }

      // Resolve or create Conversation for WEBCHAT
      let conversation = await tx.conversation.findFirst({
        where: {
          customerId: targetCustomer.id,
          channel: 'WEBCHAT',
          status: 'OPEN',
        },
      });

      if (!conversation) {
        conversation = await tx.conversation.create({
          data: {
            tenantId,
            customerId: targetCustomer.id,
            channel: 'WEBCHAT',
            status: 'OPEN',
            lastMessageAt: new Date(),
          },
        });
      }

      // Resolve or create Lead
      const lead = await tx.lead.findFirst({
        where: { customerId: targetCustomer.id },
      });

      if (!lead) {
        await tx.lead.create({
          data: {
            tenantId,
            customerId: targetCustomer.id,
            status: 'NEW',
            source: 'WEBSITE_CHAT',
          },
        });
      }

      return { conversationId: conversation.id };
    });

    return NextResponse.json({
      success: true,
      conversationId: result.conversationId,
      tenantId,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Verification failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
