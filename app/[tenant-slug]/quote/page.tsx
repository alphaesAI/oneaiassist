import { prisma } from '@/lib/db';
import { notFound } from 'next/navigation';
import React from 'react';
import Link from 'next/link';

interface Props {
  params: {
    'tenant-slug': string;
  };
}

export default async function TenantQuotePage({ params }: Props) {
  const slug = params['tenant-slug'];

  // Query tenant details directly (Tenant table has no RLS policies)
  const tenant = await prisma.tenant.findUnique({
    where: { slug },
    include: {
      whatsAppNumber: true,
    },
  });

  if (!tenant) {
    notFound();
  }

  const primaryColor = tenant.primaryColor || '#004ac6';
  const contactPhone = tenant.contactPhone || tenant.whatsAppNumber?.phoneNumber || '+1 (555) 012-3456';
  const rawPhone = tenant.whatsAppNumber?.phoneNumber || contactPhone;
  const cleanedPhone = rawPhone.replace(/\D/g, '');
  const whatsappUrl = `https://wa.me/${cleanedPhone || '15550123456'}`;

  return (
    <div 
      style={{
        '--brand-primary': primaryColor,
      } as React.CSSProperties}
      className="text-[#111c2d] bg-[#f9f9ff] min-h-screen flex flex-col justify-center items-center p-6 text-center"
    >
      <div className="max-w-md w-full bg-white p-8 rounded-2xl border border-[#c3c6d7] shadow-lg space-y-6">
        <div className="w-16 h-16 bg-[#e7eeff] rounded-full flex items-center justify-center mx-auto" style={{ color: 'var(--brand-primary)' }}>
          <span className="material-symbols-outlined text-[32px]">online_prediction</span>
        </div>
        
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-[#111c2d]">Intake Wizard</h1>
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--brand-primary)' }}>
            Module D3 • Coming Soon
          </p>
        </div>

        <p className="text-sm text-[#434655] leading-relaxed">
          The interactive web quote wizard is currently being initialized for {tenant.name}.
          In the meantime, you can get an instant quote directly via our automated WhatsApp assistant!
        </p>

        <div className="pt-4 space-y-3">
          <a 
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center justify-center gap-2 text-white px-6 py-3.5 rounded-lg text-sm font-semibold hover:opacity-95 shadow transition-all"
            style={{ backgroundColor: 'var(--brand-primary)' }}
          >
            <span className="material-symbols-outlined text-[18px]">chat</span>
            Get Quote via WhatsApp
          </a>

          <Link 
            href={`/${tenant.slug}`} 
            className="w-full block border border-[#737686] text-[#434655] px-6 py-3 rounded-lg text-sm font-semibold hover:bg-neutral-50 transition-colors"
          >
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
