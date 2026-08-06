# OneAI Assist — Development & Architectural Conventions

This document outlines the strict guidelines and conventions that must be adhered to throughout the lifecycle of the OneAI Assist project.

## 1. Multi-Tenant Isolation (Prisma & DB Level)
- **Tenant-Scoped Models**: Every tenant-scoped Prisma model **MUST** include a `tenantId String` field.
- **Indexing**: An index **MUST** be defined on the `tenantId` column for every tenant-scoped table to ensure query performance.
- **Row-Level Security (RLS)**: Row-Level Security policies are applied on the database level as a defense-in-depth security measure using `app.current_tenant_id` session variable.

## 2. Querying & Filtering Rules
- **Explicit Application Filtering**: RLS is a secondary safeguard. Every database query in the application code **MUST** explicitly filter by `tenantId`. Never rely solely on RLS to segregate data.
- **Example pattern**:
  ```typescript
  const contacts = await prisma.contact.findMany({
    where: {
      tenantId: currentTenantId,
      // other filters
    }
  });
  ```

## 3. Server-Side Tenant Validation
- **Untrusted Client Input**: `tenantId` **MUST NEVER** be trusted from client-side inputs (e.g. query params, request bodies, or client headers) for data-modifying or data-fetching operations inside the dashboard.
- **Canonical Source**: `tenantId` is always derived server-side from the authenticated session using `getTenantContext()` in `lib/tenant/index.ts`.

## 4. Role-Based Access Control (RBAC)
The platform defines four specific roles:
1. `SUPER_ADMIN`: Platform-level administrator. Has global visibility across tenants (where permitted) and manages the SaaS platform itself. `tenantId` is nullable for this role.
2. `TENANT_ADMIN`: Agency owner or administrator. Full administrative access to their specific tenant.
3. `MARKETING`: Manages marketing-related features, such as broadcast lists, templates, campaign tagging, and YouTube/website CTA links.
4. `SALES_SUPPORT`: Manages lead inbox, handoffs, sale confirmation, and policy document uploads.

## 5. Data Representation & Localization
- **Monetary Values**: All monetary amounts **MUST** be stored as integers representing **cents** (e.g. $10.50 is stored as `1050`) to avoid floating-point errors.
- **Timestamps**: All timestamps **MUST** be stored in UTC. Application logic must default to UTC, with timezone conversion happening only at the presentation layer.

## 6. Identity Unification
- **Identity Key**: A Contact's `primaryPhone` (encrypted in the database and verified via OTP) serves as the canonical cross-channel identity key.
- **Resolution**: WhatsApp and website conversations coming from the same phone number **MUST** resolve to the same `Contact` record. When a new conversation begins, the system must look up the contact by their phone number first before creating a new contact.
