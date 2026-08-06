# OneAIAssist — Multi-Tenant AI CRM Platform

OneAIAssist is an enterprise-grade, multi-tenant AI CRM platform designed for automated lead intake, qualification, and WhatsApp client relationship management. 

---

## 🛠️ Technology Stack
* **Framework**: Next.js 14 (App Router)
* **Language**: TypeScript
* **Styling**: Tailwind CSS + Shadcn/ui elements
* **State Management**: Zustand
* **Data Fetching**: TanStack Query
* **Database & ORM**: PostgreSQL (Neon Serverless) + Prisma Client
* **Real-time Comms**: Standalone Baileys WhatsApp Engine (Socket.io)
* **Auth**: NextAuth.js (Session-based JWT)

---

## 🏗️ Architecture & Security
1. **Multi-Tenant Scoping**: Scope security is enforced at the database level utilizing Postgres Row-Level Security (RLS). A tenant context wrapper (`getTenantPrisma`) intercepts database transactions, setting connection attributes (`app.current_tenant_id` and `app.current_user_role`) before executing queries.
2. **Decoupled Bot Engine**: The WhatsApp connector runs as an independent daemon (`whatsapp-engine/server.ts` on port `3001`) separate from the Next.js app server (on port `3000`). It establishes persistent WebSocket connections to the WhatsApp API via Baileys, handles AI agent auto-responses, and syncs messages in real-time to the dashboard via Socket.io rooms.

---

## 👥 Detailed Role-Based Documentation

Access control rules are gated by Next.js middleware. Below is the specification for each supported role:

| Feature Route | Superadmin (`PLATFORM_OWNER`) | Tenant Admin (`ADMIN`) | Manager (`MANAGER`) | Agent (`AGENT`) | Viewer (`VIEWER`) |
|---|:---:|:---:|:---:|:---:|:---:|
| **/superadmin/\*** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **/dashboard/settings, /team, /billing, /api** | ✅ | ✅ | ❌ | ❌ | ❌ |
| **/dashboard/sequences, /marketing** | ✅ | ✅ | ✅ | ❌ | ❌ |
| **/dashboard/inbox, /leads, /customers, /bot-config** | ✅ | ✅ | ✅ | ✅ | ❌ |
| **/dashboard** | ✅ | ✅ | ✅ | ✅ | ✅ |

### 🛡️ 1. Superadmin (Platform Owner)
The `PLATFORM_OWNER` acts as the platform-level administrator. 
* **Scope**: Operates outside a single tenant. Bypasses tenant RLS queries to monitor system health globally.
* **Key Features**:
  * **System Diagnostics strip**: Checks the operational status of the PostgreSQL cluster, standalone WhatsApp engine, payment gateways (Stripe), and AI APIs.
  * **Tenants Index**: Monitors active subscription tiers (Free, Startup, Growth), creation timestamps, and MRR.
  * **Impersonation Mode**: Superadmins can set an `impersonated_tenant_id` cookie, allowing them to view the dashboard exactly as a specific tenant would to assist in support.
  * **Token Logs & Churn warnings**: Visualizes token costs and displays alerts on tenants showing inactive patterns.

### 💼 2. Tenant Manager
The `MANAGER` role manages sales processes, broadcast strategies, and bot configurations for their specific tenant.
* **Scope**: Isolated to their tenant database partition via RLS.
* **Key Features**:
  * **Broadcast Center**: Authors WhatsApp broadcast templates, selects target groups (By Tag, Stage, Date Range), previews variables in a live mobile layout, and schedules campaigns.
  * **Bot Config Studio**: Accesses the Intake Flow Builder canvas to outline custom question threads, configure fallback policies, and toggle active AI providers.
  * **Leads Kanban**: Assigns sales owners, edits deal values, and monitors stage pipelines.
  * **Analytics & Sequences**: Accesses conversational funnel dashboards and automated drip sequences.

### 👤 3. Tenant Agent
The `AGENT` role represents active support specialists and customer success executives.
* **Scope**: Isolated to their tenant database partition. Can write notes, change stages, and send manual overrides.
* **Key Features**:
  * **Live WhatsApp Inbox**: Toggles conversations between AI Auto-Response and Agent Takeover modes. Displays live countdown or expired window session indicators (24h customer service limit).
  * **Customer 360° Profile**: Accesses client timeline chronologies showing notes, payments, messages, and intake details in one thread.
  * **Quick Actions Panel**: Logs notes, initiates agent reassignments, moves pipeline stages, and triggers outbound manual messages.
  * **Data Privacy (GDPR)**: Performs PII anonymization requests, scrubbing user-identifiable fields.

---

## 🚀 Running the Project Locally

### Prerequisites
Make sure `.env` contains valid Neon Postgres and NextAuth credentials.

### Step 1: Start Next.js App
Run the dev server in the workspace:
```bash
npm run dev
```
The client dashboard will be available at **`http://localhost:3000`**.

### Step 2: Start Standalone WhatsApp Engine
Run the engine daemon:
```bash
npx tsx whatsapp-engine/server.ts
```
The WebSocket gateway will boot on **`port 3001`**.

---

## 🧪 Seeding & Test Credentials

If the database is clean, run the Prisma seeder to populate test data:
```bash
npx prisma db seed
```

You can log in at `http://localhost:3000/login` using these pre-seeded users:

1. **Superadmin**: `superadmin@agency.com` / `password123`
2. **Manager**: `manager@agency.com` / `password123`
3. **Agent**: `agent@agency.com` / `password123`
4. **Tenant Admin**: `admin@agency.com` / `password123` (requires 2FA setup totp secret: `JBSWY3DPEHPK3PXP`)
