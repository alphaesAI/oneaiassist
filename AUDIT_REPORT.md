# OneAIAssist — Full Audit Report

- **Date:** 2026-11-26
- **Branch audited:** `markettingihub_merged` (commit `6b6126b`)
- **Scope:** all 126 API routes, `lib/`, `whatsapp-engine/`, `server.ts`, frontend (`app/`, `components/`), Prisma schema, Docker, CI, tests.
- **Method:** static code reading. The only thing executed was `tsc --noEmit` (0 errors). The app was not run and the live server was not tested.
- **Verdict:** a good-looking demo, not production-ready. Security, payments and several core features are fake or open to anonymous callers.

## How to use this report (for the engineer or AI agent doing the fixes)

1. **Work one phase at a time, in the order of section 9.** Do not attempt everything in one change.
2. **Re-read the code before each fix.** Line numbers are from commit `6b6126b` and will drift as files change.
3. Items marked **(suspected)** were not fully confirmed. Confirm first, then fix.
4. Items marked **(decision)** need the project owner's choice before any code is written. They are listed in section 8.
5. **Do not delete the hardcoded fallback and replace it with another fallback.** When there is no session, the correct behaviour is HTTP 401.
6. After each phase run `npm run test:typecheck`, and add a real test for the thing that was fixed.
7. Never print or commit values from `.env`.

Severity: **Critical** = exploitable by an anonymous person or causes real customer harm. **High** = exploitable by a logged-in low-privilege user, or a core feature is broken. **Medium** = wrong behaviour or misleading data. **Low** = quality and cleanup.

---

## 1. Security: authentication and authorization

Background facts that apply to the whole section:

- `middleware.ts` matches only `/dashboard/*` and `/superadmin/*`. It does **not** cover `/api/*`. Every API route must authenticate itself.
- 45 of 126 route files call neither `getTenantContext` nor `getServerSession`.
- About 20 routes use the hardcoded seed tenant `'tenant_pme_ff9xl'` when there is no session.
- Real roles in code: `PLATFORM_OWNER / ADMIN / MANAGER / AGENT / VIEWER` (`prisma/schema.prisma:10-16`). `CONVENTIONS.md` names different roles that exist nowhere in code.
- Role checks exist only in: `superadmin/*`, `bot/persona` POST, `contacts/[id]/erasure`, `policy-catalog` POST/PUT, `policy-catalog/upload`, `settings/branding` POST, `settings/email/config` POST, `settings/email/domains` POST, `domains/verify`, `settings/keys` POST. Every other authenticated route accepts any role.
- Input validation with zod exists in 6 of 126 routes.

### Critical

**SEC-01. Admin endpoints have no auth and take the tenant from a header.**
- `app/api/admin/intake-questions/route.ts:13,35,96,133` — tenant is `session || x-tenant-id header || 'tenant_pme_ff9xl'`. Update and delete are by bare `id` (`:43-45`, `:105-106`, `:142-143`).
- `app/api/admin/system-health/route.ts:15` — same pattern; returns audit-log entries and failed-job payloads.
- Fix: require a session via `getTenantContext()`, require role ADMIN or above, add `tenantId` to every `where`.

**SEC-02. Anonymous export of lead personal data.**
- `app/api/analytics/export/route.ts:12-18` — `GET ?tab=leads` returns a CSV of name, phone and email for the seed tenant.
- `app/api/analytics/route.ts:14-21` — leaks staff emails and the escalation log the same way.
- Fix: require a session; remove the fallback.

**SEC-03. Social channel endpoints are open for the seed tenant.**
- Token overwrite and disconnect: `app/api/channels/facebook/route.ts:88-101,174-185`, `app/api/channels/linkedin/route.ts:73-86,168-179`.
- Publishing: `channels/{facebook,instagram,linkedin}/test-post/route.ts:7-13`, and the three `verify` routes.
- OAuth start routes: `app/api/auth/{facebook,instagram,linkedin}/route.ts:6-12`.
- Fix: require a session and a MANAGER-or-above role on all of them.

**SEC-04. Customer portal authentication is fake.**
- `app/api/tenant/[tenant-slug]/portal/auth/request/route.ts:27` — OTP is the constant `'123456'`; nothing is sent.
- `app/[tenant-slug]/portal/login/page.tsx:46` — the page displays the OTP.
- `portal/auth/verify/route.ts:45-50` — cookie `customer_auth_token` is the raw `customer.id`: unsigned, no `secure` flag, no server-side session, 7 days.
- `portal/account/delete/route.ts:12,31` — updates by cookie value with no tenant filter. `portal/account/export/route.ts:12,29` trusts the same cookie.
- `portal/auth/verify/route.ts:32` — no OTP expiry and no attempt counter.
- Fix: random 6-digit OTP stored hashed with expiry and attempt limit, delivered by SMS or WhatsApp; a signed session token (JWT or random token stored server-side) in an `httpOnly`, `secure`, `sameSite` cookie; verify tenant and customer on every portal request; add a real logout route.

**SEC-05. Web-chat OTP is mock unless Twilio is configured, and transcripts are readable by ID.**
- `lib/otp/index.ts:93,101-104` — without `TWILIO_*`, any phone verifies with `123456`. `TWILIO_*` keys are not in `.env` or `.env.example`.
- `app/api/chat/verify-otp/route.ts:17,143-149` — returns the customer's open `conversationId`. `:39` runs `customer.findMany()` with no `where`.
- `app/api/chat/messages/route.ts:14-27` — returns full history for any `conversationId`, no auth.
- `app/api/chat/messages/send/route.ts:6-13,18` — trusts `tenantId` from the body; conversation lookup has no tenant filter.
- `app/api/tenant/[tenant-slug]/webchat/init/route.ts:14` — OTP hardcoded `123456`.
- Fix: fail closed when no SMS provider is configured (outside development); issue a signed chat-session token after OTP and require it on `messages` and `messages/send`; derive tenant from the slug or token, never from the body.

**SEC-06. The engine REST API has no authentication and trusts `tenantId` from the body.**
- `server.ts:92,145,182,217,266,282,338` and the duplicate in `whatsapp-engine/server.ts:64-331`. `cors()` is fully open (`server.ts:47`).
- Routes: `/api/whatsapp/{connect,status,disconnect,send,typing,webchat/inbound,emit}`.
- In the unified server these Express routes are mounted before Next and shadow the session-checked Next routes.
- Effect: anyone with a tenant ID can send WhatsApp messages from the tenant's number, log the session out, forge dashboard events, or read the decrypted tenant phone.
- Fix: require a shared internal secret header (constant-time compare) for server-to-server calls, or validate the next-auth session and take `tenantId` from it; restrict CORS to the app origin; bind the standalone engine to localhost.

**SEC-07. Socket.IO has no authentication; the room is chosen by a client query parameter.**
- `server.ts:70-75`, `whatsapp-engine/server.ts:38-44`, `lib/socket-client.ts:7-12`. CORS `origin: '*'`.
- Any client can join `tenant_<id>` and receive every `new_message`, `compliance_alert`, `whatsapp_qr` and `whatsapp_pairing_code`.
- The public webchat widget joins the same tenant-wide room and filters only in the browser (`app/[tenant-slug]/chat/page.tsx:78-86`).
- Fix: authenticate the handshake (staff: next-auth JWT; visitor: signed chat-session token); the server decides the room; visitors join a per-conversation room only.

**SEC-08. Webhooks accept forged requests.**
- Meta WhatsApp: no `X-Hub-Signature-256` check — `whatsapp-engine/routes/metaWebhook.ts:49-55`.
- Instagram: verified only `if (appSecret && signature)`, HMAC over `JSON.stringify(body)` not the raw body, compared with `!==` — `routes/instagramWebhook.ts:49-61`. GET verify accepts any non-empty token (`:22`).
- Hardcoded default verify token — `metaWebhook.ts:29`, `instagramWebhook.ts:20`.
- iMessage: no auth, `tenantId` from payload — `routes/imessageWebhook.ts:21-39`.
- Email providers: no Svix, SNS or SendGrid verification — `app/api/channels/email/webhook/[provider]/route.ts:27-169`.
- Tenant resolution falls back to "first tenant" — `metaWebhook.ts:65-69,234-236`, `instagramWebhook.ts:75-79`, `imessageWebhook.ts:35-39`.
- Fix: capture the raw body, verify the HMAC with `crypto.timingSafeEqual`, reject when the header is missing, remove default tokens, reject (do not fall back) when the tenant cannot be resolved.

**SEC-09. Unauthenticated SSRF in the SES webhook.**
- `app/api/channels/email/webhook/[provider]/route.ts:84-90` — fetches attacker-supplied `SubscribeURL`.
- Fix: verify the SNS signature first and only fetch URLs on `sns.<region>.amazonaws.com`.

**SEC-10. Legacy OAuth callbacks trust an unsigned `state`, and reflect HTML.**
- `app/api/auth/facebook/callback/route.ts:30-41`, `app/api/auth/linkedin/callback/route.ts:31-35` — `tenantId` comes from base64 JSON in `state`; no session, nonce or signature. An attacker can attach their own account to a victim tenant (`:118-140`).
- Reflected XSS: `error_description` interpolated raw into HTML — `facebook/callback/route.ts:18`, `linkedin/callback/route.ts:18`.
- Nonce is `Math.random` and never stored — `app/api/auth/facebook/route.ts:31`. Success page uses `postMessage(..., '*')`.
- The newer `app/api/oauth/[provider]/{start,callback}` flow does this correctly.
- Fix: migrate the Settings UI to the new flow and delete the legacy routes (see DUP-02).

**SEC-11. Stored XSS in the staff inbox through inbound email.**
- `app/api/channels/email/inbound/route.ts:45,69-72` — no auth or signature; tenant from body or `x-tenant-id` header, else `prisma.tenant.findFirst()`. Creates customers as `optedIn: true` / `SUBSCRIBED` (`:95-96`).
- `lib/email/sanitize.ts:6-28` — regex sanitizer; bypasses include `<svg/onload=…>`, `<img src="x"onerror=…>`, unquoted `javascript:` links, entity-encoded schemes, nested `<scr<script></script>ipt>`.
- `components/chat/EmailChatView.tsx:145` — output goes into `dangerouslySetInnerHTML`.
- Fix: authenticate the inbound endpoint with the provider's signature; replace the regex sanitizer with a maintained library (for example `sanitize-html` or DOMPurify) using an allow-list; render email bodies in a sandboxed iframe; do not mark inbound senders as subscribed.

**SEC-12. Unauthenticated file upload into `public/`.**
- `app/api/marketing/upload/route.ts:16-48` — no auth, 100 MB per request, type check uses the client-declared MIME, original extension kept (`:41-42`).
- `app/api/media/upload/route.ts:36,47` — authenticated, same MIME and extension weakness.
- Fix: require a session; detect type from file bytes; generate the extension from the detected type; store in object storage, not `public/`.

**SEC-13. Tenant isolation at the database level is not reliable.**
- `lib/db/index.ts:86-103` — `getTenantPrisma` runs `set_config(..., false)` (session-level) through a separate `prisma.$executeRawUnsafe`, then runs the query on whatever pooled connection is free. Errors are swallowed. Connections keep whichever tenant or role last touched them.
- `lib/auth/index.ts` login uses `getTenantPrisma('GLOBAL', 'PLATFORM_OWNER')`, and `app/api/bot/intake/complete/route.ts:26-30` sets `PLATFORM_OWNER` on an unauthenticated route, leaving that role on a pooled connection.
- `prisma/migrations/rls_policies.sql` is outside any migration folder (applied by hand via `scripts/apply_rls.ts`) and has no policy for `PlatformConnection`, `DynamicIntakeQuestion`, `InboundMessageJob` or the marketing tables.
- 121 call sites use the bare `prisma` client.
- Runtime effect is **(suspected)**: it depends on whether the DB role bypasses RLS.
- Fix: wrap each request's queries in `prisma.$transaction` and call `set_config(..., true)` (transaction-local) inside it, do not swallow errors, move the RLS SQL into a real migration, add the missing policies, and still add `tenantId` to every `where`.

### High

**SEC-14. Two-factor authentication is never enforced.**
- `lib/auth/index.ts:119-127` — a missing or wrong TOTP code logs "proceeding without it" and login succeeds. `:120` falls back to a hardcoded secret.
- `app/api/auth/register/route.ts:103` returns the TOTP secret in the response.
- Fix: when `twoFactorEnabled`, reject login unless the code verifies; remove the fallback secret.

**SEC-15. Cross-tenant writes through unscoped lookups (IDOR).**
- `app/api/dashboard/messages/send/route.ts:18-20,28-30,40-50` — conversation and customer by `findUnique({id})` with no tenant.
- `app/api/dashboard/customers/[id]/actions/route.ts:76-79` — decrypts any customer's phone and sends to it.
- `app/api/dashboard/customers/[id]/notes/route.ts:48` — note created for an unverified `customerId`.
- `app/api/policy-catalog/route.ts:10,81`, `policy-catalog/chunks/route.ts:17`, `policy-catalog/upload/route.ts:24,43`, `app/api/bot/rag/route.ts:14` — no tenant filter.
- `app/api/bot/intake/complete/route.ts:108` — unauthenticated, returns catalog rows from any tenant.
- `app/api/tenant/[tenant-slug]/checkout/submit/route.ts:41` — catalog lookup has no tenant filter.
- `app/api/channels/email/unsubscribe/route.ts:48` — `cid` lookup has no tenant scope.
- Fix: every lookup by ID must include `tenantId` from the session (use `findFirst({ where: { id, tenantId } })`).

**SEC-16. Missing role checks on sensitive operations.** A VIEWER or AGENT calling the API directly can:
- send a broadcast to all customers — `app/api/dashboard/broadcast/route.ts:99`
- anonymise a customer — `app/api/dashboard/customers/[id]/route.ts:225`
- replace the tenant AI key — `app/api/bot-config/route.ts:60`
- change WhatsApp provider and token — `app/api/whatsapp/meta-config/route.ts:28` (token stored unencrypted at `:45`, `metaVerifyToken` returned to any role at `:19`)
- log out the WhatsApp session — `app/api/whatsapp/disconnect/route.ts:7`
- send WhatsApp to any number — `app/api/whatsapp/send/route.ts:15`
- resume auto-paused email and change quotas — `app/api/channels/email/deliverability/route.ts:100`
- read audit logs — `app/api/settings/logs/route.ts:5`
- bulk import contacts as opted-in — `app/api/contacts/import-csv/route.ts:6`
- Fix: add one shared `requireRole(ctx, [...])` helper and call it in every mutating route. Mirror the page rules in `middleware.ts`.

**SEC-17. `/api/cron/tick` is open when `CRON_SECRET` is unset.**
- `app/api/cron/tick/route.ts:7-14` — the secret is checked only if the env var exists; it is absent from `.env` and `.env.example`. Also accepted as `?secret=`, compared non-constant-time, GET allowed.
- Fix: fail closed when the secret is missing; header only; POST only; constant-time compare.

**SEC-18. Unsubscribe links are unsigned.**
- `app/api/channels/email/unsubscribe/route.ts:10-20,38-59` — accepts raw `email` + `tenantId` or `cid`. GET mutates state, so link scanners unsubscribe recipients.
- Link built at `lib/email/EmailTransportAdapter.ts:28,97`, `lib/email/dispatchCampaign.ts:88`.
- Fix: HMAC-signed token containing tenant and customer; GET shows a confirm page, POST performs the change (and supports RFC 8058 one-click).

**SEC-19. Tracking signature uses a hardcoded default secret (open redirect).**
- `lib/email/tracking.ts:13` reads `ENCRYPTION_SECRET`, which is defined nowhere, so the literal fallback is always used. Compare at `:84` is not timing-safe.
- `app/api/channels/email/track/click/route.ts:35` redirects to the signed URL.
- Fix: use a dedicated required secret, throw at startup if missing, timing-safe compare.

**SEC-20. Hardcoded fallback keys and build-time secrets in the runtime image.**
- `lib/encryption/index.ts:6,9` — falls back to a publicly known AES key if `ENCRYPTION_KEY` is unset.
- `Dockerfile:17-19` — `ENV` placeholders for `DATABASE_URL`, `NEXTAUTH_SECRET` and `ENCRYPTION_KEY` persist into the runtime image. If production does not override them, sessions can be forged and encrypted data read. Whether production overrides them was not verified.
- Fix: remove the fallback and throw at startup; use build `ARG` or a multi-stage build so placeholders never reach the runtime stage.

**SEC-21. Template previews run saved HTML in the dashboard origin.**
- `<iframe srcDoc>` with no `sandbox`: `app/(dashboard)/dashboard/marketing/email/page.tsx:1170,1330,1635`, `components/email/EmailTemplateEditorModal.tsx:641`.
- Templates stored with no server-side sanitisation: `app/api/templates/route.ts:135`, `app/api/dashboard/templates/route.ts:69`.
- Fix: add `sandbox=""` to every preview iframe; sanitise on save.

**SEC-22. Authenticated SSRF in the legacy LinkedIn publisher.**
- `lib/social/linkedinPublisher.ts:271` — `fetch(mediaUrl)` with a URL from the request body (`app/api/marketing/campaigns/route.ts:72,148`).
- Fix: use `lib/marketing/safe-fetch.ts`, or remove with the legacy pipeline (DUP-01).

**SEC-23. Anonymous AI endpoints (free LLM proxy).**
- `app/api/marketing/optimize/route.ts:13`, `app/api/marketing/audit/route.ts:29` — no session, hardcoded tenant, no rate limit or input cap.
- Fix: require a session, use the session tenant, cap input length.

**SEC-24. Intake endpoints accept a bare `customerId`.**
- `app/api/tenant/[tenant-slug]/intake/save/route.ts:10,32-51,111-127` — overwrites intake answers, records consent with the caller's IP, resets lead `status` to `NEW` even if `CONVERTED` (`:113`).
- Fix: require the signed visitor session from SEC-05; never downgrade a converted lead.

### Medium

**SEC-25. No rate limiting on public flows.** Only `lib/auth/rateLimiter.ts` exists: in-memory, per email, login only. `app/api/chat/initiate/route.ts:33` sends an SMS per request with no throttle (SMS cost abuse). `auth/register` and `auth/pre-check` are unthrottled. An attacker can also lock out any known email for 15 minutes. Fix: shared store (Redis or a DB table), limits per IP and per phone.

**SEC-26. User enumeration.** `portal/auth/request/route.ts:34` returns 404 for unknown phones; `app/api/auth/pre-check/route.ts:30` reveals which emails exist. Fix: identical responses.

**SEC-27. Template approval bypass.** `app/api/templates/[id]/simulate-approval/route.ts:21-35` has no env gate; `app/api/dashboard/templates/route.ts:89` accepts client `status` and defaults to `APPROVED`. UI at `app/(dashboard)/dashboard/templates/page.tsx:693-725`. Fix: remove from production builds; never accept status from the client.

**SEC-28. Tokens stored in plaintext or with silent plaintext fallback.** `app/api/whatsapp/meta-config/route.ts:45`, `whatsapp-engine/transport/MetaCloudTransportAdapter.ts:30`, `app/api/channels/facebook/route.ts:114-118`, `channels/linkedin/route.ts:108-110`, `channels/instagram/route.ts:58-60`; reads fall back to the raw value in `lib/social/facebookPublisher.ts:49-54`, `lib/email/ProviderFactory.ts:49-52`. Fix: encrypt always; fail on decrypt error.

**SEC-29. Errors leak internals.** `app/api/analytics/route.ts:256-261` returns a stack trace and writes to a hardcoded Windows path. `app/page.tsx:13-14,26` and `app/landing-page-client.tsx:699-714` show the raw Prisma error to the public. Most routes return HTTP 500 with `err.message` instead of 401, which breaks the redirect in `lib/api-client.ts:20`.

**SEC-30. Impersonation.** Cookie has no expiry (`app/api/superadmin/impersonate/route.ts:51-56`); `lib/marketing/auth.ts:22-25` ignores it; a platform owner without impersonation writes to the seed tenant (`settings/keys/route.ts:10,54`, `settings/branding/route.ts:9,50`, `settings/logs/route.ts:9`, `bot/persona/route.ts:9,37`); the banner shows only on the dashboard home (`app/(dashboard)/dashboard/page.tsx:45,229-230`).

**SEC-31. No security headers** (CSP, HSTS, `X-Frame-Options`, `frame-ancestors`) anywhere in `next.config.mjs` or `server.ts`.

**SEC-32. Host-header trust.** Redirect URIs and unsubscribe origins are built from `Host` / `x-forwarded-proto` when `NEXTAUTH_URL` is unset (`app/api/cron/tick/route.ts:17-19`, `app/api/auth/*/route.ts:26-28`).

**SEC-33. Personal data in logs.** Phone plus message body: `whatsapp-engine/engine-logic.ts:606`, `openwa-logic.ts:149`. Pairing code: `engine-logic.ts:460`. Verify tokens: `metaWebhook.ts:32,37`. Prisma `log: ['query']` outside production (`lib/db/index.ts:73`).

---

## 2. Payments and customer-facing flows

**PAY-01 (Critical, decision). Checkout takes no payment and issues an active policy.**
- `app/api/tenant/[tenant-slug]/checkout/submit/route.ts:81-92` creates `Policy` with `status: 'ACTIVE'`, sets the lead `CONVERTED` (`:104-118`), writes `POLICY_PURCHASED`, returns `amountPaid` (`:142`). Anonymous. Policy number is `Math.random()` over 6 digits (`:75`).
- `stripe` and `@stripe/stripe-js` are in `package.json` but imported nowhere.
- Fix: either integrate Stripe (PaymentIntent or Checkout Session, create the policy only from the verified payment webhook) or remove the checkout and replace it with "request a call back".

**PAY-02 (Critical). Fake card form.**
- `app/[tenant-slug]/checkout/page.tsx:49-51,333-362,458` — plain inputs for card number, expiry and CVC, prefilled, never sent, under a "PCI-DSS Compliant" label.
- Fix: delete the fields. If Stripe is added, use Stripe Elements so card data never touches this server.

**PAY-03 (Critical). Public chat and intake do not work for real customers.**
- `app/[tenant-slug]/chat/page.tsx:56,119,146`, `app/[tenant-slug]/intake/page.tsx:102,199,226` call `/api/tenant/onboarding?slug=` and `/api/tenant/[slug]/webchat/{init,verify}`.
- `tenant/[tenant-slug]/intake/init/route.ts:7`, `webchat/init/route.ts:7`, `webchat/verify/route.ts:7` call `getTenantContext()`, which needs a staff session and ignores the slug.
- Verify returns only `customerId`, so `conversationId` is undefined and no message can be sent.
- Fix: resolve the tenant from the slug, issue the visitor session from SEC-05, return `conversationId`.

**PAY-04 (High). Embed script is hardcoded to localhost.** `app/api/tenant/[tenant-slug]/webchat/embed.js/route.ts:33,91` — iframe `src` and origin check are `http://localhost:3000`; slug interpolated unescaped into JS. Fix: use the configured public URL, escape the slug, add per-tenant allowed domains.

**PAY-05 (High). Consent is not really captured.** Checkout `agreeTerms` defaults to `true`, is never sent, and the server sets `optedIn: true` regardless (`checkout/page.tsx:52`, `submit/route.ts:61`). Tenant chat stores nothing (`chat/page.tsx:107-109`). Intake final submit sends `consent: true` unconditionally (`intake/page.tsx:336`).

**PAY-06 (High). False compliance claims and missing legal pages.** "HIPAA compliant and SOC2 certified" at `config/pricing.ts:126`, `app/landing-page-client.tsx:539,693`, `app/pricing/pricing-client.tsx:370`. No terms page, no cookie notice, footer links are `href="#"`. `app/privacy/page.tsx` covers only Meta tokens. Fix: remove the claims until they are true; add real legal pages.

**PAY-07 (Medium). Portal figures and actions are wrong.**
- "Total Premium Paid" is the sum of catalog `premiumMin` — `app/[tenant-slug]/portal/page.tsx:106-111`.
- Sum insured shown undivided in the portal but divided by 100 in checkout (`checkout/page.tsx:436`) and the staff view, so one side is off by 100×.
- Logout is only a link; the cookie is never cleared.
- Renew leads to checkout, which creates a second policy (`renew/page.tsx:64,74`).
- "Download PDF Certificate" has no handler.

**PAY-08 (Medium). Intake recommendations are hardcoded.** `app/[tenant-slug]/intake/page.tsx:124-147,667,675` — two mock "Apex" plans; buy and expert buttons are `alert()`. Resume link cannot work (`:162-167`); `intake/resume/route.ts:25-31,54-62` only logs the link, hardcoded to localhost.

**PAY-09 (Medium). GDPR endpoints claim more than they do.** `app/api/contacts/[id]/erasure/route.ts:30-48`, `app/api/dashboard/customers/[id]/route.ts:244-258`, `portal/account/delete/route.ts:31-39` anonymise Customer columns only and leave messages, leads (including health answers), notes, policies and email events. `portal/account/export/route.ts:29-72` omits messages, intake data and notes.

---

## 3. AI agent and messaging engine

Design summary: routing and intents are regex and keyword matching. There is no LLM tool calling and no conversation history is sent to the model; every LLM call is single-turn. The history-based `IntakeQualificationSkill` path is only called from `scripts/`.

### High

**AI-01. A mock LLM is wired into production and sends invented coverage statements.**
- `lib/ai/client.ts:192,200-227` — if no key resolves, canned text is returned, including a "covered 100%" answer. Gemini "model not found" returns a canned greeting (`:288-293`).
- Hardcoded claims in agents: `whatsapp-engine/agents/NewCustomerAgent.ts:227`, `ExistingCustomerAgent.ts:219`.
- Fix: on any LLM failure, send a neutral "a human will follow up" message and escalate. Never return coverage facts that did not come from the tenant's documents.

**AI-02. Existing customers are not recognised on WhatsApp.**
- `whatsapp-engine/agents/IdentityResolver.ts:32-46` compares a plaintext phone against `primaryPhone`, which Baileys and Meta handlers store encrypted (`engine-logic.ts:664,675`, `metaWebhook.ts:136,147`). Everyone resolves as a prospect and a duplicate Customer is created (`NewCustomerAgent.ts:110-120`).
- `normalizePhoneNumber` (`IdentityResolver.ts:4-19`) reduces Instagram IDs, email handles and `'webchat_user'` to `'+'`, merging unrelated senders.
- Fix: add a deterministic `phoneHash` (HMAC) column with a unique index per tenant and look up by it. This also removes AI-11.

**AI-03. Recommendations ignore the intake answers.** Intake stores `budget`, `family_size`, `conditions` (`NewCustomerAgent.ts:66,80,94,272`); `RecommendationEngine.ts:38,152-153` reads `budgetMax`, `familySize`, `healthConditions`. `syncLeadRecord` then overwrites the lead with the defaults. Fix: one shared typed field map.

**AI-04. Billing answers are invented and intent matching is by substring.** `whatsapp-engine/agents/ExistingCustomerAgent.ts:61-80,102-104` — `includes('pay')` catches "copay"; the card shows catalog `premiumMin` as the premium and "1st of next month" as the due date.

**AI-05. Job claiming is not atomic.** `whatsapp-engine/InboundJobWorker.ts:56-62,83-101` — `findMany` then unconditional `update`. Two instances process the same job. A `RECEIVED` job can be picked up before the webhook links `conversationId`, then re-queued. Fix: claim with `UPDATE … WHERE status IN (...) RETURNING` or `FOR UPDATE SKIP LOCKED`; enqueue in one statement with the final status.

**AI-06. One hung LLM call stalls all tenants.** No timeout on any LLM or embedding fetch (`lib/ai/client.ts:235,277,311,383`); the poll always takes the same 5 oldest jobs (`InboundJobWorker.ts:56-76`). `LaneManager.ts:6` is in-memory. Fix: `AbortSignal.timeout`, and exclude jobs already in a lane.

**AI-07. Retries are not idempotent and have no backoff.** `InboundJobWorker.ts:242-268,337-346` — intake state mutates before the send; `MessageService.ts:141-195` sends before inserting the row; three attempts burn in about 5 seconds; a crash on the third attempt leaves the job `PROCESSING` forever (`:361`). Fix: write the outbound row first with a `clientMessageId`, then send; exponential backoff; stale-lock recovery for all attempts.

**AI-08. The compliance gate is inbound-only.** Only call site is `AgentRouter.ts:28`. No outbound path is checked. `HardComplianceGate.ts:14-42` misses terms its own documentation lists; `:170-172` swallows escalation errors. STOP is handled only for Baileys and open-wa (`engine-logic.ts:713-723`, `openwa-logic.ts:178-188`). Fix: check outbound text, fail closed, implement opt-out for every channel.

**AI-09. Human handoff does not stop the bot or notify anyone.** `ExistingCustomerAgent.ts:254-266`, `NewCustomerAgent.ts:177-185,492`, `RecommendationEngine.ts:241` leave `automationEnabled` true and emit to room `tenant:<id>`, while sockets join `tenant_<id>`. Fix: set `automationEnabled = false` and use one room-name helper.

**AI-10. Outbound sending is broken for every channel except Baileys WhatsApp.** `MessageService.ts:136` uses the sync `TransportManager.getTransport`, which never returns the Meta Cloud adapter (`getTransportAsync` has no callers). `WEBCHAT` falls through to Baileys (`TransportManager.ts:193-203`). Instagram and iMessage adapters swallow errors and return fake IDs (`InstagramCloudTransportAdapter.ts:17-18,52-54`, `IMessageCloudTransportAdapter.ts:15-17,40-42`). The inbox UI sends every channel through `/api/whatsapp/send` with no error handling (`app/(dashboard)/dashboard/inbox/page.tsx:142-163`).

**AI-11. Inbound customer matching decrypts every customer row per message.** `metaWebhook.ts:101-128` (inside a transaction), `engine-logic.ts:628-655`. Suffix matching can bind to the wrong customer.

**AI-12 (decision). Unofficial WhatsApp clients and fragile sessions.**
- Both `@whiskeysockets/baileys` (a release candidate) and `@open-wa/wa-automate` ship. Both break WhatsApp's terms and risk number bans.
- Auth state is one encrypted blob rewritten on every key change (`whatsapp-engine/auth-state.ts:40-59`).
- Every instance restores all sessions on boot with no leader lock (`server.ts:370-378`), so two instances disconnect each other.
- A transient drop writes `DISCONNECTED` before reconnect is scheduled (`engine-logic.ts:548-551`).
- open-wa bugs: `openwa-logic.ts:109-112,152-164`. Baileys has no group filter (`engine-logic.ts:596-600`).

### Medium

**AI-13. LLM client quality.** `lib/ai/client.ts:233,319` — hardcoded model IDs that are old (`gpt-4-turbo`, `claude-3-5-sonnet-20240620`); whether they still resolve is **(suspected)** not. No retry, backoff or streaming; `temperature: 0.7` for grounded answers; Gemini key in the URL (`:277`); embeddings always go to OpenAI even for local-LLM tenants, and are a constant mock vector without a key (`:380-383`).

**AI-14. Usage limits are partly decorative.** Trial cap counts `senderType: 'BOT'` (`client.ts:31-38`) but replies are saved as `'AGENT'` (`MessageService.ts:185`), and agents pass `bypassTrialCheck=true`. The daily token check is check-then-act. `logTokenUsage` stores no model name.

**AI-15. Document search (RAG) is not real in this environment.** Tenant scoping is correct (`lib/rag/pinecone.ts:112-132`). With no Pinecone keys, `query()` returns the first chunks regardless of the question (`:78-102`). `pageNumber` is wrong for every chunk (`lib/rag/index.ts:87`). `require('pdf-parse')` is called as a function but v2 exports a class (`:22-26`) **(suspected to throw)**. Fixed 1000-character chunks; upsert failures ignored (`:118-121`); old vectors never deleted. `policy-catalog/upload/route.ts:13-47` never stores the file.

**AI-16. Prompt injection.** Customer text and document chunks are concatenated into one message with no delimiters (`ExistingCustomerAgent.ts:211`, `NewCustomerAgent.ts:220,381`). Impact is limited to what the bot says, because there are no tools and no other customers' data in prompts.

**AI-17. The compliance audit gate fails open.** `app/api/marketing/audit/route.ts:12-15` and `app/api/marketing/campaigns/route.ts:86-128` default to `PASS` (score 94) when the AI errors or returns unparseable output.

**AI-18. Documentation does not match code.** `docs/dual_agent_whatsapp_engine_technical_architecture.md` claims optimistic locking, a fail-closed gate on every message, zero hallucination, Meta Cloud sending and context resume. `.agents/skills/intake-qualification/SKILL.md` describes tools that do not exist.

---

## 4. Marketing and email

**MKT-01 (High). Nothing schedules the tick.** No caller of `/api/cron/tick` in the Dockerfile, workflow, `server.ts`, scripts or docs. Scheduled email stays `QUEUED`; scheduled WhatsApp broadcasts are never sent (the tick filters `channel: 'EMAIL'`, `:26`); retry backoffs never fire.

**MKT-02 (High). Journeys never advance.** `app/api/journeys/process-tick/route.ts` is the only caller of `processDueEnrollments`, needs a user session, and nothing calls it. `triggerType` is never evaluated.

**MKT-03 (High). Broadcasts are not resumable.** `lib/email/dispatchCampaign.ts`, `app/api/dashboard/broadcast/route.ts:237` — above 25 recipients the send is a detached promise; a restart leaves the campaign `SENDING` forever. No unique on campaign plus customer; no idempotency key; whole audience loaded in one `findMany` (`:38`).

**MKT-04 (High). No rate limiting or retry; wrong status.** `lib/email/dispatchCampaign.ts:78-128` — stored quotas never enforced; 429 and 5xx recorded as `FAILED`; campaign ends `COMPLETED` even when every send failed (`:125-128`); `DELIVERED` written at provider-accept time (`lib/email/EmailTransportAdapter.ts:126-131`).

**MKT-05 (High). Fake data is sent to real customers.** `lib/email/dispatchCampaign.ts:87` (`POL-58472`), `app/api/dashboard/broadcast/route.ts:261-265` (`'2 days ago'`, `'Oct 24, 2026'`), `app/api/marketing/optimize/route.ts:32-40` (invented licence number and benefits). Fix: skip the recipient or fail validation when a merge field is missing.

**MKT-06 (High). Email compliance is cosmetic.** `{{sender_address}}` is not a postal address (`dispatchCampaign.ts:51-53`); no enforced footer; `validatePreSend` (`lib/email/templateEngine.ts:126-134`) runs only on test-send; List-Unsubscribe only via Resend; free-mail senders silently rewritten (`lib/email/adapters/ResendProviderAdapter.ts:9-11`); a tenant with no config sends through the platform key or `'mock_email_key'` (`lib/email/ProviderFactory.ts:31`).

**MKT-07 (High). The new composer's media pipeline is half-merged.** `lib/marketing/upload-client.ts:21,28,40` calls `/api/media/upload-url`, `/api/media`, `/api/media/complete`; none exist. Nothing creates `MediaAsset`. `lib/marketing/storage.ts:151` returns a URL no route serves. Instagram and YouTube cannot publish through the new pipeline.

**MKT-08 (High). Journey engine bugs** (`lib/email/journeyEngine.ts`): `SEND_EMAIL` uses `sendText` (`:307`); failing steps retry forever and starve others (`:468-484`); no claim before executing (`:197-212`); branch indices unvalidated; quiet hours use server time (`:50`); `SEND_WHATSAPP` sends placeholder text (`:321`).

**MKT-09 (Medium). Providers.** Resend works. SES: no SigV4 (`lib/email/adapters/AmazonSESAdapter.ts`). SendGrid drops headers. SMTP is a stub that always fails. `mock_` or empty keys return `SENT`.

**MKT-10 (Medium). Tracking and A/B do nothing useful.** Open pixel carries only the tenant (`track/open/route.ts:34`); `generateTrackingUrl` is never called; `lib/email/abTesting.ts:22-24,52,64-72` — winner always `TIE`, uneven split, no holdout.

**MKT-11 (Medium). Auto-pause can latch.** `lib/email/tracking.ts:198-212` — all-time rate, skewed denominator, never clears on its own.

**MKT-12 (Medium). Merge tags are not HTML-escaped.** `lib/email/templateEngine.ts:38-49`; `previewText` at `EmailTransportAdapter.ts:107`.

**MKT-13 (Medium). Token refresh gaps.** `refreshThreadsTokens` (`lib/marketing/connections.ts:39`) has no caller; `validToken` (`lib/marketing/oauth.ts:591-644`) takes no lock **(suspected race)**; legacy `PlatformConnection` has no expiry columns.

**MKT-14 (Medium). Legacy publish misreports.** `app/api/marketing/publish/route.ts:51-60,93,121,149,164-166` — no status guard, `SUCCESS` when every platform failed, `reach` from `Math.random()`.

**MKT-15 (Medium). Long work runs inside HTTP requests.** `lib/marketing/publisher.ts:126`, `app/api/cron/tick/route.ts:24-48`; `lib/marketing/storage.ts:138-146` buffers up to 100 MB in memory.

**MKT-16 (Low). Uploads on local disk** (`public/media`, `public/uploads/marketing`, `.data/uploads`) are lost on redeploy. `app/api/email/test-send/route.ts:86-100` bypasses suppression.

---

## 5. Features that look real but are fake

| ID | Screen or endpoint | Location | Reality |
|---|---|---|---|
| FAKE-01 | Billing tab | `components/settings-account-tab.tsx:22-28,54-93` | Hardcoded plan, card and invoices; buttons do nothing |
| FAKE-02 | Team and invites | `components/settings-workspace-tab.tsx:27-58` | Hardcoded teammates; invite is local state |
| FAKE-03 | AI settings | `components/settings-ai-tab.tsx:39-43` | Save shows a banner only |
| FAKE-04 | Guardrails, escalation | `components/bot-guardrails-tab.tsx:24-27`, `bot-escalation-tab.tsx:20-23` | Save shows a banner only |
| FAKE-05 | Bot sandbox, history | `components/bot-sandbox-tab.tsx:21-32`, `bot-history-tab.tsx:7-12,57` | Canned answer; hardcoded versions |
| FAKE-06 | Knowledge upload | `components/bot-knowledge-rag-tab.tsx:55-110` | A timer invents a document; fake "Apex" list |
| FAKE-07 | Dashboard KPIs | `app/(dashboard)/dashboard/page.tsx:48,289,371-436` | Hardcoded percentages, channel split, revenue |
| FAKE-08 | Needs Attention, System Health, bell | `components/needs-attention-widget.tsx:21-46`, `system-health-panel.tsx:17-24`, `notification-bell.tsx:17-42` | Static content for every tenant |
| FAKE-09 | Customer timeline | `app/api/dashboard/customers/[id]/route.ts:157-197` | Invented events, including a "$145 via Stripe" payment |
| FAKE-10 | Analytics | `app/api/analytics/route.ts:74,96-232` | Hardcoded revenue, funnel, channel values |
| FAKE-11 | Report export | `app/api/analytics/export/route.ts:66-82` | "Report sent" with nothing sent |
| FAKE-12 | Bot persona, RAG API | `app/api/bot/persona/route.ts:18-63`, `bot/rag/route.ts:35-66` | Hardcoded; POST saves nothing |
| FAKE-13 | API keys, logs, branding | `app/api/settings/keys/route.ts:36-43,102-112`, `settings/logs/route.ts:34-37`, `settings/branding/route.ts:28-39` | Fake masked keys, always "Connection Successful" |
| FAKE-14 | Integrations connect | `app/api/marketing/integrations/route.ts:76-86` | Writes hardcoded account names |
| FAKE-15 | Sequences | `app/api/sequences/route.ts:15-92` | Seeds demo journeys with fake counts |
| FAKE-16 | AI copy | `app/api/ai/copy/route.ts:61-74` | Silent canned copy without a key |
| FAKE-17 | Superadmin health | `app/superadmin/page.tsx:63,107-108,242,268-271`, `tenants/[id]/tenant-detail-client.tsx:93-98,180` | Stripe status `true`, MRR 0, computed usage, announcements delivered nowhere |
| FAKE-18 | Quote page | `app/[tenant-slug]/quote` | "Coming Soon" |
| FAKE-19 | Pricing contact form | `app/pricing/pricing-client.tsx` | `setTimeout`, no API |
| FAKE-20 | Checkout ID upload | `app/[tenant-slug]/checkout/page.tsx:122,319` | Never uploaded; invented URL in the audit log |
| FAKE-21 | Domain verification | `lib/email/domainVerification.ts` | Real for Resend only; SES and SendGrid stay `PENDING`; never enforced at send |
| FAKE-22 | Template submit | `app/api/templates/[id]/submit/route.ts:52-58`, `templates/route.ts:127-129` | No Meta call; status flip only |

Plan enforcement exists only as AI token limits (`lib/ai/client.ts:44-51`). Suspending a tenant in superadmin is checked nowhere else.

---

## 6. Engineering, build and deployment

**ENG-01 (High). Migrations do not match the schema.** `prisma/migrations/20260718094509_init/migration.sql` creates 16 tables; `prisma/schema.prisma` has 48 models. Docs deploy with `prisma db push` (`docs/deployment/05_...md:149,393`). Fix: baseline a full migration and deploy with `prisma migrate deploy`.

**ENG-02 (High). CI protects nothing.** `.github/workflows/deploy.yml` triggers only on `main`, which is 30 commits behind this branch (default branch is `master`). It runs no type-check, lint or tests. `next.config.mjs` sets `typescript.ignoreBuildErrors` and `eslint.ignoreDuringBuilds` to true. Fix: run `tsc`, lint and tests on pull requests; remove both ignore flags (type-check already passes).

**ENG-03 (High). The Docker image is miswired.**
- `CMD ["npm","run","start"]` is `next start`; `server.ts` (sockets, inbound worker, webhooks) never runs. `start:all` expects `.next/standalone/server.js`, but `output: 'standalone'` is not set in `next.config.mjs`.
- `HEALTHCHECK` calls `/api/tenant/info`, which returns 401 without a session, so the container is always unhealthy.
- Single stage, runs as root, dev dependencies in the image, `npm install --legacy-peer-deps` instead of `npm ci`, no migration step. Patches `node_modules` at build time.
- In split mode Next routes read an in-process `sessions` map that is always empty (`app/api/whatsapp/send/route.ts:5,21`), and `lib/whatsapp/index.ts:75` defaults to the wrong port.
- Fix: decide one runtime shape (decision), add an unauthenticated `/api/health`, multi-stage build, non-root user.

**ENG-04 (High). Tests give false confidence.** `test/email_*.test.ts` are run by nothing; about half re-implement the logic inside the test file (`test/email_suppression_and_tenant_isolation.test.ts` imports nothing from `lib`). `tdd/run-all-tests.ts` runs scripts that need a live database. `scripts/` duplicates most of `tdd/`. `tsconfig.json` excludes `scripts` and `tdd` from type-check. No route, webhook or dispatch path is tested.

**ENG-05 (Medium). Process-level error handling hides crashes.** `server.ts:30-36` swallows `uncaughtException` and `unhandledRejection` and keeps running.

**ENG-06 (Medium). `lib/db/index.ts:6-41` monkey-patches `dns.lookup` globally** and forces public DNS servers. This affects every outbound request in the process.

**ENG-07 (Medium). No observability.** No error monitoring; 316 `console.*` calls; `pino` is installed and used in 2 files.

**ENG-08 (Medium). No pagination.** `app/api/dashboard/{customers,conversations,leads,broadcast}` and `chat/messages` have no `take`/`skip`. `customers/page.tsx:36` filters the whole table in the browser. Polling every 3 s forever (`campaigns/page.tsx:121`) and every 6 s (`marketing/posts/page.tsx:160-164`).

**ENG-09 (Medium). Money stored as floats.** `prisma/schema.prisma:529,694,823` use `Float` for cost and budget, against `CONVENTIONS.md` (integer cents).

**ENG-10 (Medium). Missing or mismatched endpoints.** `marketing/email/page.tsx:401` calls `DELETE /api/dashboard/broadcast/[id]` (no route). `marketing/create/page.tsx:132` expects `{personal}`, API returns `{templates}`. `marketing/posts/page.tsx:597` links to `/dashboard/accounts` (no page).

**ENG-11 (Low). Frontend structure.** 66 of 90 `.tsx` files are client components. Very large files: `components/settings-channels-tab.tsx` (2,153 lines, 51 `useState`), `marketing/email/page.tsx` (1,670), `marketing/create/page.tsx` (1,505), `PostComposerModal.tsx` (1,488), `campaigns/page.tsx` (1,389). 347 uses of `any`. No `loading.tsx` or `not-found.tsx`. One global page title for every tenant page. 38 raw `<img>`. Optimistic updates with no rollback (`sequences/page.tsx:88-103`, `campaigns/page.tsx:1172-1212`). Form labels not tied to inputs on public forms.

**ENG-12 (Low). Unreachable or dead.** Pages with no navigation link: `/dashboard/policy-catalog` (also not covered by any middleware role rule), `/dashboard/marketing/channels`, `/chat`, `/privacy`. Dead code: `lib/r2Client.ts`, `lib/ai/placeholder.ts`, `lib/rag/placeholder.ts`, `components/logout-button.tsx`, `components/ui/button.tsx`, `generateTrackingUrl`, `SmtpProviderAdapter`.

**ENG-13 (Low). Documentation drift.** `README.md` lists Zustand (not installed) and says RLS enforces isolation. `CONVENTIONS.md` lists roles that do not exist. `.env.example` is missing `DIRECT_URL`, `GEMINI_API_KEY`, `NEXT_PUBLIC_SOCKET_URL`, `CRON_SECRET`, `TWILIO_*`, `PINECONE_*`, `WHATSAPP_ENGINE_URL`.

**ENG-14 (Owner action, not a code fix).**
- The local git remote URL for `origin` contains a GitHub access token in plain text. Rotate it and use a credential helper.
- `docs/deployment/01_SERVER_SPECIFICATIONS_AND_CREDENTIALS.md` commits the production server address and root SSH instructions. Remove it from the repository and disable root SSH login.
- A personal PDF sits in the project root (git-ignored). Move it out.

---

## 7. Duplicate systems left by the merge

| ID | Duplicate | Keep | Remove |
|---|---|---|---|
| DUP-01 | Social publishing | `lib/marketing/*` with `ConnectedAccount` / `PublishJob` (atomic claims, backoff, safe fetch) | `lib/social/*`, `PlatformConnection`, `/api/marketing/{campaigns,publish}`, `/dashboard/marketing` legacy page |
| DUP-02 | OAuth | `/api/oauth/[provider]/{start,callback}` | `/api/auth/{facebook,instagram,linkedin}` and `/api/channels/{facebook,instagram,linkedin}`; move `settings-channels-tab.tsx` to the new flow |
| DUP-03 | Template APIs | one of `/api/templates` or `/api/dashboard/templates` | the other |
| DUP-04 | Journeys | `/api/journeys` | `/api/sequences` |
| DUP-05 | Engine server | `server.ts` or `whatsapp-engine/server.ts` | the other (they duplicate the same Express routes) |
| DUP-06 | Public chat | `/[slug]/chat` or `/chat?tenant=` | the other |
| DUP-07 | Auth helpers | `getTenantContext()` | `authed()` in `lib/marketing/auth.ts` |
| DUP-08 | WhatsApp client | one library | the other (see AI-12) |

Which side to keep in DUP-03, DUP-05 and DUP-06 is a recommendation to confirm, not a verified requirement.

---

## 8. Decisions the owner must make before fixing

1. **Payments:** integrate Stripe, or remove online checkout? (PAY-01, PAY-02)
2. **WhatsApp:** stay on unofficial Baileys (ban risk) or move to the official Meta Cloud API? (AI-12, AI-10)
3. **Runtime shape:** one unified server (`server.ts`) or Next plus a separate engine process? (ENG-03, DUP-05)
4. **SMS provider** for OTP delivery. (SEC-04, SEC-05)
5. **Duplicates:** confirm which side of each row in section 7 to keep.
6. **Fake screens:** build them properly, or hide them until they are real? (section 5)
7. **Vector database:** configure Pinecone, or switch to `pgvector` in the existing Postgres? (AI-15)

---

## 9. Recommended fix order

| Phase | Goal | Items | Done when |
|---|---|---|---|
| 0 | Owner actions | ENG-14 | Token rotated, credentials doc removed |
| 1 | Close anonymous access | SEC-01, 02, 03, 06, 07, 12, 17, 23; remove every `'tenant_pme_ff9xl'` fallback | Every non-public route returns 401 without a session; a test proves it for each |
| 2 | Customer identity | SEC-04, 05, 24, 25, 26; PAY-03, PAY-04 | Portal and chat use real OTP and signed sessions; anonymous visitors can chat |
| 3 | Inbound trust | SEC-08, 09, 10, 11, 18, 19, 20 | Forged webhooks rejected; no default secrets; app refuses to start without required env |
| 4 | Tenant isolation and roles | SEC-13, 14, 15, 16, 30 | Cross-tenant test suite passes; role matrix test passes |
| 5 | Stop harm to customers | PAY-01, PAY-02, PAY-06, AI-01, AI-04, MKT-05, SEC-27 | No fake payment, no invented facts or data sent to customers |
| 6 | Make the engine correct | AI-02, 03, 05, 06, 07, 08, 09, 10, 11 | No duplicate replies under two instances; handoff stops the bot |
| 7 | Deploy and CI | ENG-01, 02, 03, 05, 07; MKT-01, MKT-02 | CI runs checks on pull requests; container healthy; tick scheduled |
| 8 | Email and marketing correctness | MKT-03 to MKT-15, SEC-21, 22, 28 | Broadcast survives a restart; statuses are truthful |
| 9 | Replace or hide fake UI, remove duplicates | Sections 5 and 7, PAY-05, 07, 08, 09 | No screen shows invented data |
| 10 | Quality | AI-13 to AI-18, ENG-04, 06, 08 to 13, SEC-29, 31, 32, 33 | Real test suite; pagination; headers |

---

## 10. What is already good

- `lib/marketing/publisher.ts`: atomic job claims, backoff, ambiguous failures sent to review.
- `lib/marketing/safe-fetch.ts`: connect-time DNS check, redirect re-check, size and time caps.
- `/api/oauth/[provider]`: random state bound to the user, timing-safe compare, PKCE.
- `lib/encryption`: AES-256-GCM with random IVs (the weakness is only the fallback key).
- No SQL injection found; no secrets committed in tracked files.
- `tsc --noEmit` passes with 0 errors.
- Document search is correctly scoped per tenant.
- Leads, inbox, customers, campaigns and the new social suite pages are wired to real APIs.

## 11. Limits of this audit

- Static reading only. No endpoint was called and no exploit was run, except a scratch copy of the sanitizer regexes to confirm SEC-11.
- Production environment variables were not seen. SEC-05, SEC-17, SEC-19 and SEC-20 depend on them.
- No dependency vulnerability scan (`npm audit`) was run.
- Mobile layout and accessibility were read from code, not tested in a browser.
