# Administrator Workspace Guide — OneAIAssist

This guide is prepared for administrators of **Prime Marketing Experts** (`admin@primemarketingexperts.com`) to manage WhatsApp conversational campaigns, lead intake flows, vector knowledge bases, multi-channel marketing post composers, and developer configurations.

---

## 1. Main Dashboard Console (`/dashboard`)

The main dashboard provides a unified view of operational health, pending reviews, and quick-action shortcuts.

### Core Modules
1. **Admin Command Bar**: 1-click actions to add leads, compose campaigns, configure bots, link WhatsApp lines, and invite colleagues.
2. **System Infrastructure Health**: Real-time WhatsApp connection status, Gemini RAG health status, and live database pool gauges.
3. **Needs Attention Panel**: Highlights unassigned hot leads and pending template reviews.

---

## 2. WhatsApp Message Template Builder (`/dashboard/templates`)

Administrators must register messaging templates before launching broadcast campaigns.

### Key Rules
- Templates are categorized into `UTILITY`, `MARKETING`, or `AUTHENTICATION`.
- Statuses track approval state: `APPROVED`, `PENDING`, or `REJECTED`.
- Active templates:
  1. **`lead_intake_start_v1`** (`UTILITY`, `APPROVED`)
  2. **`lead_follow_up_optin`** (`MARKETING`, `APPROVED`)
  3. **`healthcare_promo_fall2026`** (`MARKETING`, `APPROVED`)
  4. **`new_plan_offer`** (`MARKETING`, `APPROVED`)
  5. **`policy_renewal_warning`** (`UTILITY`, `APPROVED`)

---

## 3. Campaigns Center (`/dashboard/campaigns`)

The Campaigns Center (previously *Broadcast*) allows admins to launch targeted bulk WhatsApp template messaging campaigns.

![Campaigns Center](file:///d:/codebase/oneaiassist_v1/docs/images/broadcast_center.png)

### Key Workflows
- **Template Selection**: Choose from active `APPROVED` WhatsApp templates.
- **Audience Segmentation**: Filter recipients by customer tags (e.g., `VIP`, `Renewal Due`) or CRM pipeline stages (e.g., `Qualified`).
- **Outbound Scheduling**: Dispatch messages immediately or set up a future date/time.

---

## 4. Digital Marketing Suite (`/dashboard/marketing`)

The Digital Marketing Suite provides a visual multi-channel space to compose organic social media posts or paid advertisement creatives, run pre-flight compliance audits, and view publishing calendars and analytics.

### Console Sections
1. **Social Posts (AI Composer)**:
   - **Create Post**: Multi-channel composer for Facebook, Instagram, LinkedIn, and YouTube.
   - **AI Copywriter**: Optimize captions tailored for each platform.
   - **Pre-Flight Compliance Audit**: Scans copy for healthcare/PII compliance and HIPAA policies, predicting expected click-through rate (CTR).
   - **Social Post Status Tabs**: View drafts, scheduled posts, published posts, and execution failures separately.
2. **Visual Content Calendar**:
   - Monthly grid dashboard showing scheduled and published posts timezone-safely.
3. **Social Integrations**:
   - Encrypted OAuth connectors for Facebook Pages, Instagram Business, LinkedIn Profiles, and YouTube Channels.
4. **History & Analytics**:
   - **Metrics Tracker**: cumulative reach, expected click-through, and ad budget spent.
   - **Analytical Graphs**: Reach growth timelines and channel splits.
   - **Social Post Logs**: Searchable tabular log list of past marketing assets.

---

## 5. Lead Pipeline Management (`/dashboard/leads`)

The Lead Pipeline provides real-time visibility into customer sales opportunities from initial contact to policy issuance.

![Lead Pipeline Modal](file:///d:/codebase/oneaiassist_v1/docs/images/leads_add_modal.png)

### Pipeline Stages
1. **New Lead**: Freshly captured inquiries from webchat or broadcasts.
2. **Intake In Progress**: Customer actively answering AI bot intake questions.
3. **Qualified**: Customer meets health policy eligibility criteria.
4. **Quoted / Proposal Sent**: Official insurance quote delivered.
5. **Negotiation**: Reviewing policy terms or pricing options.
6. **Won**: Policy purchased & active.
7. **Lost**: Lead closed or uncontactable.

### Verified Features & Enhancements
- **Click-to-Profile Redirection**: Customer display names in both the Kanban cards and the List view table rows are clickable hyperlinks that navigate directly to the customer's corresponding **Customer 360 Profile page** (`/dashboard/customers/[id]`).

---

## 6. Customers Directory & 360° Profile View (`/dashboard/customers`)

The Customer Directory maintains all customer contact records, opt-in consent statuses, and historical policy engagements.

![Customer Profile View](file:///d:/codebase/oneaiassist_v1/docs/images/customer_profile.png)

### Core Capabilities
- **Directory Table**: Displaying Customer Name, Email, Decrypted Primary Phone, Location, Opt-In Status, Tags, and Active Policy details.
- **Customer 360 Profile**: Full activity timeline including AI Bot Q&A logs, WhatsApp messages, policy activation events, and agent notes.
- **Live Inbox Detail Panel Link**: The "View Full Profile" button in the right-hand sidebar panel of the live chat inbox (`/dashboard/inbox`) redirects directly to the active customer's **Customer 360 Profile page** instead of the general leads pipeline.

---

## 7. AI & Bot Configuration (`/dashboard/ai-bot`)

The Bot Config workspace gives administrators complete control over AI provider settings, visual flowchart intake builder, RAG knowledge base document indexing, escalation triggers, and AI guardrails.

![Bot Config Canvas](file:///d:/codebase/oneaiassist_v1/docs/images/bot_config_canvas.png)

### 1. Identity & Provider Settings
- **AI Provider**: Configured to **Google Gemini (`1.5 Flash`)**.
- **Gemini API Key**: Encrypted in database and displayed with masked placeholder (`••••••••`) and `KEY CONFIGURED` status.
- **Bot Persona**: Display Name (*PME Assistant*) and custom Greeting Message.

### 2. Visual Flow Builder & WhatsApp Simulator
- Interactive flowchart canvas for ordering question nodes (Welcome, Licensed Agent Check, Budget, Email).
- Customer Chat Preview: Built-in interactive WhatsApp chat simulator for testing customer intake flows.

### 3. Knowledge Base & Policy PDF Vector Indexing
Administrators can upload policy PDFs or choose from pre-loaded sample policy documents to index into PostgreSQL `pgvector`:
- **Integrated RAG Tab**: The Knowledge Base Studio is fully integrated as a tab inside **AI & Bot Studio** (with the standalone sidebar navigation link removed for nav clean up).
- **Vector Embedding Pipeline**: Automatically parses PDF text, generates vector embeddings (`text-embedding-004`), and indexes vector chunks into `pgvector`.
- **RAG Policy Recommendations**: Matches customer queries to specific policies.
- **Product Catalog Specs PDF Upload**: When creating or editing products in the catalog modal, admins can upload a policy brochure PDF that auto-indexes directly into the pgvector database.
- **Trial Cap Exemption**: Administrative dashboard tasks (document indexing, PDF uploads, compliance audits) are exempted from the trial usage caps.

---

## 8. Application Startup & Developer Guide

### Environment Prerequisites
- Node.js v18+
- PostgreSQL database with `pgvector` extension enabled

### Commands to Run the Application
1. **Start Next.js Web Dashboard**:
   ```bash
   npm run dev
   ```
   Access web dashboard at: `http://localhost:3000`

2. **Start WhatsApp Engine**:
   ```bash
   npx tsx whatsapp-engine/server.ts
   ```

3. **Verify Database Connections & Run Automated Tests**:
   ```bash
   npm test
   ```
