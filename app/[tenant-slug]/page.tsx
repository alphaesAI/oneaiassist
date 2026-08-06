import { prisma } from '@/lib/db';
import { notFound } from 'next/navigation';
import React from 'react';
import Link from 'next/link';
import Script from 'next/script';

interface Props {
  params: {
    'tenant-slug': string;
  };
}

interface TrustBadge {
  icon: string;
  text: string;
}

interface SocialLink {
  platform: string;
  url: string;
}

export default async function TenantLandingPage({ params }: Props) {
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

  // Fallbacks for branding fields
  const logoUrl = tenant.logoUrl;
  const primaryColor = tenant.primaryColor || '#004ac6';
  const secondaryColor = tenant.secondaryColor || '#00788c';
  const tagline = tenant.heroTagline || 'Simple insurance, no confusion';
  const description = tenant.heroDescription || `${tenant.name} provides straightforward, reliable coverage tailored to your needs. No hidden fees, just honest protection.`;
  
  const trustBadges = (tenant.trustBadges as unknown as TrustBadge[]) || [
    { icon: 'shield', text: 'Secured Cover' },
    { icon: 'speed', text: 'Instant Quotes' },
    { icon: 'workspace_premium', text: 'A+ Rated Carrier' }
  ];

  const contactEmail = tenant.contactEmail || `support@${tenant.slug}.com`;
  const contactPhone = tenant.contactPhone || tenant.whatsAppNumber?.phoneNumber || '+1 (555) 012-3456';
  const businessHours = tenant.businessHours || 'Mon-Fri, 9am - 5pm';
  
  const socialLinks = (tenant.socialLinks as unknown as SocialLink[]) || [
    { platform: 'Twitter', url: 'https://twitter.com' },
    { platform: 'LinkedIn', url: 'https://linkedin.com' }
  ];

  const rawPhone = tenant.whatsAppNumber?.phoneNumber || contactPhone;
  const cleanedPhone = rawPhone.replace(/\D/g, '');
  const whatsappUrl = `https://wa.me/${cleanedPhone || '15550123456'}`;

  return (
    <div 
      style={{
        '--brand-primary': primaryColor,
        '--brand-secondary': secondaryColor,
      } as React.CSSProperties}
      className="text-[#111c2d] bg-[#f9f9ff] min-h-screen font-sans antialiased overflow-x-hidden"
    >
      {/* Navigation Header */}
      <header className="bg-white border-b border-[#c3c6d7] fixed top-0 left-0 right-0 z-50">
        <nav className="flex justify-between items-center w-full px-6 md:px-8 max-w-[1280px] mx-auto h-16">
          <div className="flex items-center gap-2">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt={tenant.name} className="h-9 w-auto rounded object-contain" />
            ) : (
              <span 
                className="material-symbols-outlined text-[32px]" 
                style={{ color: 'var(--brand-primary)' }}
              >
                health_and_safety
              </span>
            )}
            <span className="text-xl font-bold text-[#111c2d] tracking-tight">{tenant.name}</span>
          </div>
          
          <div className="hidden md:flex items-center gap-8">
            <a 
              className="text-sm font-semibold transition-all duration-200 py-1 border-b-2" 
              style={{ color: 'var(--brand-primary)', borderBottomColor: 'var(--brand-primary)' }}
              href="#benefits"
            >
              Benefits
            </a>
            <a className="text-sm font-medium text-[#434655] hover:text-[var(--brand-primary)] transition-colors duration-200" href="#how-it-works">
              How it works
            </a>
            <a className="text-sm font-medium text-[#434655] hover:text-[var(--brand-primary)] transition-colors duration-200" href="#contact">
              Contact
            </a>
          </div>

          <a 
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-white px-5 py-2 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity shadow-sm"
            style={{ backgroundColor: 'var(--brand-primary)' }}
          >
            Contact Us
          </a>
        </nav>
      </header>

      <main className="pt-16">
        {/* Hero Section */}
        <section className="relative min-h-[600px] flex items-center overflow-hidden bg-[#f0f3ff] py-16">
          <div className="max-w-[1280px] mx-auto px-6 md:px-8 w-full grid md:grid-cols-2 gap-12 items-center relative z-10">
            <div className="space-y-6">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#dbe1ff] rounded-full text-xs font-semibold" style={{ color: 'var(--brand-primary)' }}>
                <span className="material-symbols-outlined text-[16px]">verified</span>
                <span>Trusted Digital Protection</span>
              </div>
              
              <h1 className="text-4xl md:text-5xl font-extrabold text-[#111c2d] leading-tight">
                {tagline}
              </h1>
              
              <p className="text-lg text-[#434655] max-w-lg leading-relaxed">
                {description}
              </p>
              
              <div className="flex flex-col sm:flex-row gap-4 pt-4">
                <a 
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 text-white px-6 py-4 rounded-lg text-sm font-semibold shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all"
                  style={{ backgroundColor: 'var(--brand-primary)' }}
                >
                  <span className="material-symbols-outlined text-[18px]">chat</span>
                  Chat with us on WhatsApp
                </a>
                
                <Link 
                  href={`/${tenant.slug}/quote`} 
                  className="flex items-center justify-center gap-2 border-2 border-[#737686] text-[#111c2d] px-6 py-4 rounded-lg text-sm font-semibold hover:bg-[#e7eeff] transition-all"
                >
                  Get a Free Quote
                </Link>
              </div>
            </div>
            
            <div className="relative hidden md:block">
              <div className="relative z-10 rounded-xl overflow-hidden shadow-2xl border border-[#c3c6d7]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img 
                  className="w-full h-[450px] object-cover" 
                  alt="Modern professionals collaborating in a bright workspace" 
                  src="https://images.unsplash.com/photo-1556740758-90de374c12ad?auto=format&fit=crop&w=800&q=80"
                />
              </div>
              <div className="absolute -bottom-6 -left-6 z-20 bg-white p-5 rounded-xl shadow-lg border border-[#c3c6d7] flex items-center gap-4">
                <div className="w-12 h-12 rounded-full flex items-center justify-center text-white" style={{ backgroundColor: 'var(--brand-primary)' }}>
                  <span className="material-symbols-outlined">groups</span>
                </div>
                <div>
                  <p className="text-sm font-bold text-[#111c2d]">Trusted Partner</p>
                  <p className="text-xs text-[#434655]">Serving Active Families</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Trust Signals Row */}
        <section className="py-12 bg-white border-y border-[#c3c6d7]">
          <div className="max-w-[1280px] mx-auto px-6 md:px-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
              {trustBadges.map((badge, idx) => (
                <div key={idx} className="flex flex-col items-center gap-2">
                  <span 
                    className="material-symbols-outlined text-[40px]" 
                    style={{ color: 'var(--brand-secondary)', fontVariationSettings: "'FILL' 1" }}
                  >
                    {badge.icon || 'shield'}
                  </span>
                  <p className="text-lg font-bold text-[#111c2d]">{badge.text}</p>
                  <p className="text-xs text-[#434655]">Verified coverage parameters</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How it Works Section */}
        <section id="how-it-works" className="py-20 bg-[#f9f9ff]">
          <div className="max-w-[1280px] mx-auto px-6 md:px-8">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-extrabold text-[#111c2d] mb-3">How It Works</h2>
              <p className="text-sm text-[#434655]">Secure cover matching in 3 straightforward steps.</p>
            </div>
            
            <div className="grid md:grid-cols-3 gap-8">
              {/* Step 1 */}
              <div className="bg-white p-6 rounded-xl border border-[#c3c6d7] hover:border-[var(--brand-primary)] hover:shadow-md transition-all group">
                <div className="w-14 h-14 bg-[#f0f3ff] rounded-xl flex items-center justify-center mb-6 group-hover:bg-[var(--brand-primary)] transition-colors">
                  <span className="material-symbols-outlined text-[28px] group-hover:text-white" style={{ color: 'var(--brand-primary)' }}>
                    chat
                  </span>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--brand-primary)' }}>Step 01</span>
                <h3 className="text-lg font-bold text-[#111c2d] mt-2 mb-2">WhatsApp Chat</h3>
                <p className="text-xs text-[#434655] leading-relaxed">
                  Initiate a WhatsApp chat to communicate instantly with our dedicated AI agent framework.
                </p>
              </div>

              {/* Step 2 */}
              <div className="bg-white p-6 rounded-xl border border-[#c3c6d7] hover:border-[var(--brand-primary)] hover:shadow-md transition-all group">
                <div className="w-14 h-14 bg-[#f0f3ff] rounded-xl flex items-center justify-center mb-6 group-hover:bg-[var(--brand-primary)] transition-colors">
                  <span className="material-symbols-outlined text-[28px] group-hover:text-white" style={{ color: 'var(--brand-primary)' }}>
                    list_alt
                  </span>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--brand-primary)' }}>Step 02</span>
                <h3 className="text-lg font-bold text-[#111c2d] mt-2 mb-2">Intake Flow</h3>
                <p className="text-xs text-[#434655] leading-relaxed">
                  Provide parameters (Age, State, Family size) via dynamic WhatsApp chat triggers or web quote flow.
                </p>
              </div>

              {/* Step 3 */}
              <div className="bg-white p-6 rounded-xl border border-[#c3c6d7] hover:border-[var(--brand-primary)] hover:shadow-md transition-all group">
                <div className="w-14 h-14 bg-[#f0f3ff] rounded-xl flex items-center justify-center mb-6 group-hover:bg-[var(--brand-primary)] transition-colors">
                  <span className="material-symbols-outlined text-[28px] group-hover:text-white" style={{ color: 'var(--brand-primary)' }}>
                    handshake
                  </span>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--brand-primary)' }}>Step 03</span>
                <h3 className="text-lg font-bold text-[#111c2d] mt-2 mb-2">Policy Delivery</h3>
                <p className="text-xs text-[#434655] leading-relaxed">
                  View tailored recommendations and buy policies instantly, or request agent handoff.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Visual Call To Action Section */}
        <section className="py-16 bg-white">
          <div className="max-w-[1280px] mx-auto px-6 md:px-8">
            <div className="rounded-2xl overflow-hidden relative min-h-[350px] flex items-center p-8 md:p-12">
              <div className="absolute inset-0 z-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img 
                  src="https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?auto=format&fit=crop&w=1200&q=80" 
                  alt="Family outline" 
                  className="w-full h-full object-cover" 
                />
                <div className="absolute inset-0 bg-[#00174b]/75 mix-blend-multiply"></div>
              </div>
              <div className="relative z-10 max-w-xl text-white space-y-4">
                <h2 className="text-3xl font-extrabold">Your cover is our community's priority.</h2>
                <p className="text-sm opacity-90 leading-relaxed">
                  Automated onboarding connects you to professional plans tailored for health security and family insurance protection.
                </p>
                <Link 
                  href={`/${tenant.slug}/quote`} 
                  className="inline-block bg-white text-[#00174b] px-6 py-3 rounded-lg text-sm font-semibold hover:bg-neutral-100 transition-colors shadow-lg"
                  style={{ color: 'var(--brand-primary)' }}
                >
                  Start Your Quote
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer Details */}
      <footer id="contact" className="bg-[#f0f3ff] border-t border-[#c3c6d7]">
        <div className="max-w-[1280px] mx-auto px-6 md:px-8 py-12">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
            {/* Branding Info */}
            <div className="md:col-span-5 space-y-4">
              <div className="flex items-center gap-2">
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoUrl} alt={tenant.name} className="h-7 w-auto object-contain rounded" />
                ) : (
                  <span className="material-symbols-outlined text-[28px]" style={{ color: 'var(--brand-primary)' }}>
                    health_and_safety
                  </span>
                )}
                <span className="text-lg font-bold text-[#111c2d]">{tenant.name}</span>
              </div>
              
              <p className="text-xs text-[#434655] max-w-xs leading-relaxed">
                Straightforward health insurance qualification and automated WhatsApp processing powered by OneAIAssist.
              </p>
              
              <div className="flex gap-3">
                {socialLinks.map((link, idx) => (
                  <a 
                    key={idx} 
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-9 h-9 rounded-full bg-white border border-[#c3c6d7] flex items-center justify-center hover:bg-[#e7eeff] transition-all"
                    style={{ color: 'var(--brand-primary)' }}
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      {link.platform.toLowerCase() === 'twitter' ? 'alternate_email' : 'face_nod'}
                    </span>
                  </a>
                ))}
              </div>
            </div>

            {/* Contact Details */}
            <div className="md:col-span-4 space-y-4">
              <h4 className="text-xs uppercase font-bold text-[#111c2d] tracking-wider">Contact Details</h4>
              <ul className="space-y-2 text-xs text-[#434655]">
                <li className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[16px]">mail</span>
                  <span>{contactEmail}</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[16px]">call</span>
                  <span>{contactPhone}</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[16px]">schedule</span>
                  <span>{businessHours}</span>
                </li>
              </ul>
            </div>

            {/* Quick Links */}
            <div className="md:col-span-3 space-y-4">
              <h4 className="text-xs uppercase font-bold text-[#111c2d] tracking-wider">Resources</h4>
              <ul className="space-y-2 text-xs text-[#434655]">
                <li><Link href={`/${tenant.slug}/quote`} className="hover:underline">Free Web Quote</Link></li>
                <li><a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">WhatsApp Portal</a></li>
                <li><a href="#" className="hover:underline">Privacy Policy</a></li>
              </ul>
            </div>
          </div>

          <div className="mt-12 pt-6 border-t border-[#c3c6d7] flex flex-col md:flex-row justify-between items-center gap-4 text-[11px] text-[#434655]">
            <p>© {new Date().getFullYear()} {tenant.name}. All rights reserved.</p>
            <p>Powered by OneAIAssist Engine</p>
          </div>
        </div>
      </footer>

      {/* Dynamic Embeddable Web Chat Widget floating action overlay */}
      <Script 
        src={`/api/tenant/${tenant.slug}/webchat/embed.js`} 
        strategy="lazyOnload" 
      />
    </div>
  );
}
