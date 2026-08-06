---
name: Trust-Focused B2B Interface
colors:
  surface: '#faf8ff'
  surface-dim: '#d2d9f4'
  surface-bright: '#faf8ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f3ff'
  surface-container: '#eaedff'
  surface-container-high: '#e2e7ff'
  surface-container-highest: '#dae2fd'
  on-surface: '#131b2e'
  on-surface-variant: '#434751'
  inverse-surface: '#283044'
  inverse-on-surface: '#eef0ff'
  outline: '#737782'
  outline-variant: '#c3c6d2'
  surface-tint: '#325da4'
  primary: '#003471'
  on-primary: '#ffffff'
  primary-container: '#1b4b91'
  on-primary-container: '#9dbeff'
  inverse-primary: '#acc7ff'
  secondary: '#006c49'
  on-secondary: '#ffffff'
  secondary-container: '#6cf8bb'
  on-secondary-container: '#00714d'
  tertiary: '#71001f'
  on-tertiary: '#ffffff'
  tertiary-container: '#9c002d'
  on-tertiary-container: '#ffa4aa'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d7e2ff'
  primary-fixed-dim: '#acc7ff'
  on-primary-fixed: '#001a40'
  on-primary-fixed-variant: '#11458b'
  secondary-fixed: '#6ffbbe'
  secondary-fixed-dim: '#4edea3'
  on-secondary-fixed: '#002113'
  on-secondary-fixed-variant: '#005236'
  tertiary-fixed: '#ffdadb'
  tertiary-fixed-dim: '#ffb2b7'
  on-tertiary-fixed: '#40000d'
  on-tertiary-fixed-variant: '#92002a'
  background: '#faf8ff'
  on-background: '#131b2e'
  surface-variant: '#dae2fd'
typography:
  display:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.05em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 8px
  container-max: 1280px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 32px
---

## Brand & Style

The brand personality is authoritative yet accessible, designed specifically for non-technical business owners who require reliability and clarity. The design style follows a **Corporate / Modern** aesthetic, prioritizing legibility and a sense of "calm efficiency." 

The visual language balances the stability of an established enterprise with the responsiveness of a modern SaaS. We achieve this through generous whitespace, a structured grid, and high-contrast typography that guides the user through complex workflows without overwhelming them. The emotional response should be one of confidence: the user should feel that their customer communications are in safe, professional hands.

## Colors

This design system utilizes a foundation of Deep Blue to establish institutional trust. 

- **Primary (#1B4B91):** Used for navigation, primary actions, and branding elements.
- **Success/Accent (#10B981):** A vibrant Emerald used for high-conversion CTAs and "Active" health statuses.
- **Error/Destructive (#F43F5E):** Reserved for "Escalated" statuses and critical alerts.
- **Neutrals:** The background is a Warm White (#FAFAFA) to reduce eye strain, while text defaults to Dark Slate (#0F172A) for maximum contrast.
- **Surface Variant:** For the Live Chat Inbox, the system switches to a Dark Mode variant using a Slate-900 background with lighter gray borders to focus attention on message content.

## Typography

The system relies exclusively on **Inter** to ensure a systematic, utilitarian feel that remains approachable. 

- **Headlines:** Use tighter letter spacing and semi-bold weights to create a strong visual anchor.
- **Body:** Standardized at 16px for optimal readability across all browser engines.
- **Labels:** Use medium weights for form headers and uppercase with slight tracking for "Overline" styles or small status indicators.
- **Hierarchy:** Maintain a clear vertical rhythm by ensuring line heights are consistently 1.25x to 1.5x the font size.

## Layout & Spacing

The layout philosophy uses a **Fixed Grid** for dashboard views and a **Fluid Content Area** for the chat interface. 

- **Rhythm:** An 8px linear scale governs all padding and margins. 
- **Desktop:** 12-column grid with 24px gutters. Content is centered in a 1280px container.
- **Mobile:** 4-column grid with 16px margins.
- **Sidebars:** The navigation sidebar is fixed at 280px on desktop, collapsing to a 64px icon-rail or hidden drawer on smaller screens.
- **Chat Interface:** Uses a 3-pane layout (Navigation, Conversation List, Active Chat Window) with flexible widths to accommodate long-form message text.

## Elevation & Depth

Hierarchy is established through **Tonal Layers** and **Ambient Shadows**. 

- **Base Layer:** The primary background color (Warm White).
- **Surface Layer:** White cards or containers use a very soft, diffused shadow (0px 4px 12px rgba(0,0,0,0.05)) to appear slightly elevated.
- **Overlays:** Modals and dropdowns use a more pronounced elevation (0px 10px 25px rgba(0,0,0,0.1)) with a 40% opacity backdrop blur to maintain context.
- **Borders:** Low-contrast 1px strokes (#E2E8F0) are used to define boundaries on flat elements like list items or table rows.

## Shapes

The design system uses a **Rounded** language to soften the corporate aesthetic and make the interface feel more modern and user-friendly.

- **Buttons & Inputs:** 8px (0.5rem) corner radius.
- **Cards & Large Containers:** 16px (1rem) corner radius.
- **Status Badges:** Fully pill-shaped (rounded-full) to distinguish them from interactive buttons.
- **Chat Bubbles:** 12px radius, with the corner adjacent to the sender's side squared off to 4px to indicate directionality.

## Components

- **Buttons:** Primary buttons use the Deep Blue background with white text. Success/CTA buttons use the Emerald Green. All buttons should have a subtle hover state transition that darkens the background by 10%.
- **Status Badges:** 
    - *Active:* Emerald background (10% opacity) with Emerald bold text.
    - *Trial:* Deep Blue background (10% opacity) with Deep Blue bold text.
    - *Escalated:* Rose/Red background (10% opacity) with Rose bold text.
- **Input Fields:** 1px border (#E2E8F0). On focus, the border changes to Primary Blue with a 3px soft outer glow (ring).
- **Lists:** Table rows and chat lists use a subtle hover state (#F8FAFC) to indicate interactivity.
- **Chat Inbox (Dark Mode):** Surfaces should use Slate-800. Inbound bubbles use Slate-700; outbound bubbles use Primary Blue. Text remains White or High-Contrast Gray.
- **Cards:** White background, 1px soft gray border, and Level 1 elevation shadow.