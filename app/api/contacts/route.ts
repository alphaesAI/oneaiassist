import { NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/tenant';
import { getTenantPrisma } from '@/lib/db';
import { decrypt, encrypt } from '@/lib/encryption';

import { CONTACT_PUBLIC_SELECT } from '@/lib/contacts/csvImport';


export async function GET(req: Request) {
  try {
    const { tenantId, role } = await getTenantContext();
    const db = getTenantPrisma(tenantId, role);

    const url = new URL(req.url);
    const listId = url.searchParams.get('listId');
    const search = url.searchParams.get('search')?.trim();
    const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') || 50)));
    const cursor = url.searchParams.get('cursor');

    const where: any = { tenantId };
    if (listId) {
      where.listMemberships = { some: { listId, tenantId } };
    }
    if (search) {
      where.OR = [
        { displayName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const contacts = await db.customer.findMany({
      where,
      select: CONTACT_PUBLIC_SELECT,
      orderBy: { createdAt: 'desc' },
      take: limit,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    return NextResponse.json({
      contacts: contacts.map((c) => {
        let phone = c.primaryPhone;
        try {
          phone = decrypt(c.primaryPhone);
        } catch {
          // keep plaintext if not encrypted
        }
        return { ...c, primaryPhone: phone };
      }),
      nextCursor: contacts.length === limit ? contacts[contacts.length - 1].id : null,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Request failed';
    return NextResponse.json({ error: msg }, { status: msg.includes('Unauthorized') ? 401 : 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { tenantId, role } = await getTenantContext();
    const db = getTenantPrisma(tenantId, role);
    const body = await req.json();

    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : null;
    const rawPhone = typeof body.primaryPhone === 'string' ? body.primaryPhone.trim() : '';
    const displayName = typeof body.displayName === 'string' && body.displayName.trim()
      ? body.displayName.trim()
      : email ? email.split('@')[0] : '';

    if (!email && !rawPhone) {
      return NextResponse.json({ error: 'Email or phone is required' }, { status: 400 });
    }
    if (!displayName) {
      return NextResponse.json({ error: 'Display name is required' }, { status: 400 });
    }

    // Proper consent model: only SUBSCRIBED if consentSource is explicitly stated
    const consentSource = typeof body.emailConsentSource === 'string' && body.emailConsentSource.trim()
      ? body.emailConsentSource.trim()
      : null;
    const consentProof = typeof body.emailConsentProof === 'string' && body.emailConsentProof.trim()
      ? body.emailConsentProof.trim()
      : null;
    const isSubscribed = Boolean(consentSource);

    const primaryPhone = rawPhone ? encrypt(rawPhone) : `em_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    const contact = await db.customer.create({
      data: {
        tenantId,
        displayName,
        primaryPhone,
        email,
        tags: Array.isArray(body.tags) ? body.tags : [],
        location: typeof body.location === 'string' ? body.location.trim() : null,
        customFields: body.customFields && typeof body.customFields === 'object' ? body.customFields : {},
        optedIn: isSubscribed,
        optedInAt: isSubscribed ? new Date() : null,
        emailConsentStatus: isSubscribed ? 'SUBSCRIBED' : 'PENDING',
        emailConsentSource: consentSource,
        emailConsentTimestamp: isSubscribed ? new Date() : null,
        emailConsentProof: consentProof,
      },
      select: CONTACT_PUBLIC_SELECT,
    });

    if (typeof body.listId === 'string' && body.listId) {
      await db.contactListMember.createMany({
        data: [{ tenantId, listId: body.listId, customerId: contact.id }],
        skipDuplicates: true,
      });
    }

    const { CrossChannelJourneyEngine } = await import('@/lib/email/journeyEngine');
    CrossChannelJourneyEngine.handleTrigger(tenantId, 'CONTACT_CREATED', { customerId: contact.id })
      .catch((err) => console.error('[Journey Trigger] CONTACT_CREATED error:', err));

    if (Array.isArray(body.tags) && body.tags.length > 0) {
      for (const tag of body.tags) {
        CrossChannelJourneyEngine.handleTrigger(tenantId, 'TAG_ADDED', { customerId: contact.id, tag })
          .catch((err) => console.error('[Journey Trigger] TAG_ADDED error:', err));
      }
    }

    return NextResponse.json({ contact }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to create contact';
    return NextResponse.json({ error: msg }, { status: msg.includes('Unauthorized') ? 401 : 500 });
  }
}
