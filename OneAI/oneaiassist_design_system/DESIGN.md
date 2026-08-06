---
name: OneAIAssist Design System
colors:
  surface: '#f9f9ff'
  surface-dim: '#cfdaf2'
  surface-bright: '#f9f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f0f3ff'
  surface-container: '#e7eeff'
  surface-container-high: '#dee8ff'
  surface-container-highest: '#d8e3fb'
  on-surface: '#111c2d'
  on-surface-variant: '#434655'
  inverse-surface: '#263143'
  inverse-on-surface: '#ecf1ff'
  outline: '#737686'
  outline-variant: '#c3c6d7'
  surface-tint: '#0053db'
  primary: '#004ac6'
  on-primary: '#ffffff'
  primary-container: '#2563eb'
  on-primary-container: '#eeefff'
  inverse-primary: '#b4c5ff'
  secondary: '#565e74'
  on-secondary: '#ffffff'
  secondary-container: '#dae2fd'
  on-secondary-container: '#5c647a'
  tertiary: '#005e6e'
  on-tertiary: '#ffffff'
  tertiary-container: '#00788c'
  on-tertiary-container: '#d7f6ff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dbe1ff'
  primary-fixed-dim: '#b4c5ff'
  on-primary-fixed: '#00174b'
  on-primary-fixed-variant: '#003ea8'
  secondary-fixed: '#dae2fd'
  secondary-fixed-dim: '#bec6e0'
  on-secondary-fixed: '#131b2e'
  on-secondary-fixed-variant: '#3f465c'
  tertiary-fixed: '#acedff'
  tertiary-fixed-dim: '#4cd7f6'
  on-tertiary-fixed: '#001f26'
  on-tertiary-fixed-variant: '#004e5c'
  background: '#f9f9ff'
  on-background: '#111c2d'
  surface-variant: '#d8e3fb'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: '700'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  display-lg-mobile:
    fontFamily: Inter
    fontSize: 36px
    fontWeight: '700'
    lineHeight: '1.2'
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '600'
    lineHeight: '1.25'
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.3'
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.55'
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.5'
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.4'
  label-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '500'
    lineHeight: '1'
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: '1'
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  2xl: 48px
  3xl: 64px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 32px
---

## Brand & Style

The design system is engineered for a high-performance B2B SaaS environment, prioritizing clarity, trust, and cognitive efficiency. The brand personality is authoritative yet accessible, positioning the product as a reliable co-pilot for enterprise-level tasks. 

The aesthetic follows a **Corporate / Modern** movement. It utilizes a structured layout with generous whitespace to reduce visual noise. The style is characterized by precise alignment, subtle depth through tonal layering, and a refined color application that directs focus toward user actions and data insights.

## Colors

This design system utilizes a high-contrast professional palette. **Royal Blue** serves as the primary action color, providing a sense of stability and institutional trust. **Deep Navy** is used for core navigation and heavy UI elements to anchor the experience. **Cyan** acts as a vibrant accent for secondary highlights or data visualizations.

The background is a soft **Light Gray** to reduce eye strain during prolonged use, while white cards create a clear "object-based" hierarchy. Status colors follow global semantic standards to ensure immediate recognition of system states.

## Typography

The design system relies exclusively on **Inter** to maintain a systematic, utilitarian aesthetic. Typography is used to create a clear information hierarchy, with tighter tracking and heavier weights for headlines to provide a sense of impact. Body text utilizes a generous line height to optimize readability for dense SaaS dashboards. Label styles are used for navigation, tags, and small metadata, often employing a slightly higher weight to maintain legibility at smaller scales.

## Layout & Spacing

The design system follows a **12-column fluid grid** for desktop and a **4-column fluid grid** for mobile. A strict 4px/8px baseline grid ensures vertical rhythm across all components.

- **Desktop (1280px+):** 12 columns, 24px gutters, 32px side margins.
- **Tablet (768px - 1279px):** 8 columns, 20px gutters, 24px side margins.
- **Mobile (Up to 767px):** 4 columns, 16px gutters, 16px side margins.

Spacing tokens are used for internal component padding and external margins to ensure a consistent airiness throughout the UI.

## Elevation & Depth

Hierarchy is established through **Tonal Layers** and **Ambient Shadows**. This design system avoids harsh borders in favor of soft depth cues:

- **Level 0 (Surface):** The background color (#F8FAFC). Elements are flush.
- **Level 1 (Card):** White surfaces (#FFFFFF) with a 1px border (#CBD5E1) or a very soft shadow (0px 1px 3px rgba(15, 23, 42, 0.08)).
- **Level 2 (Dropdowns/Popovers):** White surfaces with a more pronounced ambient shadow (0px 10px 15px -3px rgba(15, 23, 42, 0.1)).
- **Level 3 (Modals):** Elements that sit above a background dim/scrim, featuring the most significant shadow depth.

Shadows should always use the Deep Navy (#0F172A) as their tint base at very low opacities to maintain color harmony.

## Shapes

The shape language is defined as **Rounded**, striking a balance between the friendliness of consumer apps and the precision of enterprise software. 

- **Standard Elements:** 0.5rem (8px) for buttons, input fields, and small cards.
- **Large Elements:** 1rem (16px) for main containers and large modals.
- **Extra Large:** 1.5rem (24px) for distinct feature sections or promotional banners.

Circular rounding (Pill) is reserved exclusively for Tags and Chips to differentiate them from actionable buttons.

## Components

### Buttons
- **Primary:** Solid Royal Blue background with white text. High prominence.
- **Secondary:** White background with Slate border and Dark Slate text.
- **Ghost:** No background or border. Text is Royal Blue or Dark Slate.

### Input Fields
- **Default:** White background, 1px Slate border, 8px roundedness.
- **Focus:** 1px Royal Blue border with a 3px soft blue glow (ring).
- **Label:** Small, Dark Slate, positioned above the input.

### Chips & Tags
- **Status:** Light semantic background (e.g., Light Emerald) with dark semantic text (e.g., Dark Emerald). Fully rounded (pill).
- **Filter:** Light Gray background with a Dark Slate label and a close icon.

### Cards
- **Base:** White background, 1px Slate border, 8px roundedness, and Level 1 elevation.
- **Header:** Often includes a subtle 1px bottom border to separate titles from content.

### Lists
- **Data Rows:** Alternating background colors are discouraged; use thin 1px horizontal dividers in Slate for separation. Hover states should use a subtle Light Gray highlight.