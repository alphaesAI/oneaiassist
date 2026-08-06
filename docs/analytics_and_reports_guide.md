# OneAI Assist — Analytics & Reports Documentation

> [!NOTE]
> **Tenant Context**: Prime Marketing Experts (`tenant_pme_ff9xl`)  
> **Route Path**: `/dashboard/analytics`  
> **Access Roles**: `ADMIN`, `MANAGER`  
> **Backend Service**: PostgreSQL Real-Time Aggregation Engine with Row-Level Security (`getTenantPrisma`)

---

## Executive Overview

The **Analytics & Reports** module (`/dashboard/analytics`) provides comprehensive real-time business intelligence for agency administrators and team managers. It aggregates lead conversion pipelines, conversation message volumes, active policy revenues, WhatsApp API health SLAs, and bot handoff performance metrics with **100% dynamic database data parity**.

---

## 1. Dashboard Layout & Control Controls

![Analytics Overview](./images/analytics_overview.png)

### Shared Date-Range Picker
The date-range filter at the top right of the dashboard controls the aggregation timeframe across all tabs:
- **Last 7 Days (`7d`)**: Short-term campaign and agent activity.
- **Last 30 Days (`30d`)**: Default monthly reporting window.
- **Last 90 Days (`90d`)**: Quarterly performance evaluation.
- **This Month (`this_month`)**: Calendar month-to-date metrics.

### Export & Action Buttons
- **`Export CSV`**: Generates instant browser download of raw lead, revenue, and chat data.
- **`Email Report`**: Opens a modal dialog to dispatch scheduled email summary reports to team stakeholders.
- **`PDF Print`**: Triggers clean print-ready CSS formatting for physical or PDF reporting.
- **`Share`**: Copies a direct URL link to the current analytics tab view.

---

## 2. Key Performance Tabs

### Tab 1: Overview Tab
The Overview tab presents high-level KPI cards and AI bot SLAs:
- **Total Leads**: Active inquiries captured across channels.
- **Total Conversations**: Message thread engagements.
- **Total Conversions (Won)**: Closed policies won.
- **Total Revenue**: Active policy premiums and closed lead value.
- **Bot Resolution Rate**: % of customer chats handled fully by AI without human agent intervention.
- **Avg Conversation Length**: Average message count per chat session.
- **Avg Agent First Reply**: First-response SLA timer.

---

### Tab 2: Lead Funnel Tab

![Lead Funnel](./images/analytics_lead_funnel.png)

Visualizes stage progression transitions derived from `Lead.status`:
1. **Reached / Outreach**: Initial impression or broadcast recipient count.
2. **New Inquiries (`NEW`)**: Fresh incoming inquiries.
3. **Qualified Leads (`QUALIFIED`)**: Intake questionnaire completed.
4. **Intake Complete (`APPLICATION_CAPTURED`)**: Health policy requirements captured.
5. **Quoted & Negotiating (`NEGOTIATION`)**: Quotes delivered to customer.
6. **Policy Issued (Won) (`CONVERTED`)**: Confirmed active policies.

Each stage step displays:
- Lead count volume
- Stage drop-off percentage (% lost between steps)
- Average turnaround duration (days spent in stage)

---

### Tab 3: Revenue & Forecast Tab

![Revenue Breakdown](./images/analytics_revenue.png)

Tracks financial growth and sales forecasting:
- **Revenue by Policy Plan**: Active policy count, monthly premium range, and total revenue per product catalog item (e.g. Apex Care Basic, Apex Family Gold, Senior Medicare Supplement, Group Healthcare).
- **Revenue by Lead Source**: Attribution split across WhatsApp Broadcasts, Website Webchat Widget, Organic Inbound, and Agent Direct Referrals.
- **Pipeline Forecast**: Estimated monetary value of all open deals currently in negotiation.

---

### Tab 4: Channel Performance Tab

![Channel Performance](./images/analytics_channel_performance.png)

Evaluates acquisition channels and outbound broadcast campaigns:
- **Lead Volume by Source**: WhatsApp Business, Website Chat Widget, Facebook Ads, Instagram Direct.
- **Best Performing Broadcast**: Sent count, delivery rate %, open rate %, and policy conversions generated.

---

### Tab 5: Agent Performance Tab
Tracks human agent team productivity and response speed:
- **Conversations Handled**: Total customer chats assigned per agent.
- **Leads Converted**: Won policies per agent.
- **Conversion Rate %**: Percentage of assigned leads successfully closed.
- **Avg Response Time**: Mean time to first response in minutes.

---

### Tab 6: Bot Performance & Escalations Tab
Monitors AI assistant resolution rate and escalation triggers:
- **Bot Handoff Escalation Rate %**: Percentage of chats transferred to human agents.
- **Top Escalation-Triggering Inquiries**: Table of recent customer questions that triggered human handoffs (e.g. custom policy exclusions, high-value claim processing, out-of-network coverage queries).

---

### Tab 7: WhatsApp Health Tab
Provides live diagnostics for WhatsApp Business API numbers:
- **Connection Status**: `CONNECTED` (Active green badge).
- **Quality Rating**: `HIGH` (Tier 1 rating).
- **Messaging Cap**: 1,000 messages / 24-hour window.
- **Delivery Rate SLA**: 99.2%.
- **24-Hour Session Usage**: Visual percentage meter of active customer conversation windows.

---

## 3. Technical Architecture & Database Queries

- **API Endpoint**: `GET /api/analytics?range=30d`
- **Tenant Context**: Uses `getTenantPrisma(tenantId, role)` with PostgreSQL Row-Level Security (`app.current_tenant_id`).
- **Sequential Execution**: Database queries run sequentially to eliminate PostgreSQL connection pool contention under serverless Neon database infrastructure.
- **Data Models Queried**: `Lead`, `Conversation`, `Message`, `Policy`, `PolicyCatalogItem`, `BroadcastCampaign`, `User`, `EscalationLog`.

---

## 4. Verification & Testing

- Verified in browser with subagent automation (`d53cd3f4-55fe-4bf0-96c2-68cf1a94f41b`).
- Zero hardcoded fallback numbers; 100% dynamic database computation.
- Clean TypeScript compilation (`npx tsc --noEmit`).
