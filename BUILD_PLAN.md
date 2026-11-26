# OneAIAssist — Build Plan: Email Marketing, then WhatsApp Marketing

- **Written:** 2026-11-26, against branch `markettingihub_merged` (commit `6b6126b`)
- **Goal:** bring email marketing, then WhatsApp marketing, to the core level of Zoho Campaigns / Zoho Marketing Automation.
- **Companion file:** `AUDIT_REPORT.md` (IDs such as `MKT-03` below refer to it).

## 0. Rules for the implementing agent

Read these before every step. They override anything that seems convenient.

1. **Build one step at a time.** Do only the step you were asked to do. Stop when its "Done when" checks pass and report what you changed.
2. **Do not remove or rewrite existing features.** No deleting pages, routes, libraries or the social suite. Add alongside. If something must change to make a step work, change the minimum and say so.
3. **Do not work on login, 2FA, roles or route authentication.** That is the last phase. Do not make it worse either: every new route must call `getTenantContext()` and use its `tenantId`.
4. **Multi-tenant always.** Every new table has `tenantId String` with an index. Every query has `tenantId` in its `where`. Never read `tenantId` from a request body, query string or header. Never add a fallback tenant.
5. **In background workers, use the bare `prisma` client with an explicit `tenantId` in every query.** Do not use `getTenantPrisma` there (see `SEC-13`: it sets the tenant on a different pooled connection).
6. **No invented data.** Never substitute a placeholder for a missing value in anything sent to a contact or shown as a metric. Missing data means skip, fail validation, or show "no data".
7. **Database changes go through `prisma migrate dev --name <step>`**, producing a migration folder. Do not use `prisma db push`. If the migration history blocks this (the existing history covers 16 of 48 models), stop and report; do not reset the database.
8. **Official WhatsApp Cloud API only** for all new WhatsApp work. Do not add features to Baileys or open-wa.
9. **Never print, log or commit values from `.env`.** Add new variable names to `.env.example` with empty values.
10. **Each step ends with tests** that import the real code (not copies of it) and are run by `npm test`.
11. **Re-read the code before editing.** Line numbers below are from commit `6b6126b`.

## 1. Baseline: what works today (checked by running the app locally)

Run with `next dev` only (the WhatsApp engine was not started), against the test database, logged in as a seeded tenant admin.

| Check | Result |
|---|---|
| App starts, database connects | Yes (`Ready in 3.4s`) |
| Login with a seeded account | Works |
| `/dashboard`, `/dashboard/marketing/email`, `/dashboard/campaigns`, `/dashboard/templates`, `/dashboard/sequences`, `/dashboard/customers`, `/dashboard/settings` | All load (HTTP 200) |
| Email settings, domains, deliverability, analytics, templates, broadcast list, journeys, customers, tags APIs | All respond 200 |
| Test tenant data | 2 contacts, 1 template, 1 sending domain, email provider configured, 0 campaigns, 0 journeys, 0 tags |
| `tsc --noEmit` | 0 errors |

Not exercised, on purpose: sending a campaign and calling `/api/cron/tick` (both would send real email).

Two things seen while running that the plan must respect:
- `GET /api/dashboard/customers` returns each contact's `otpCode` to the browser. Do not copy this pattern into new contact APIs; select fields explicitly.
- `GET /api/whatsapp/meta-config` returns the access token to the browser. Step W1 must return a masked value.

## 2. How email sending works today, and why it must change

Read these files first:

- `app/api/dashboard/broadcast/route.ts` — creates the campaign. For "send now" it sets status `COMPLETED` **before** sending (`:185`) and `sent` to the audience size. Up to 25 recipients it sends inside the HTTP request; above 25 it starts a detached promise (`:237`).
- `lib/email/dispatchCampaign.ts` — loads the whole audience in one query (`:38`), creates `BroadcastJob` rows (`:68`) but never reads them back, sends 5 at a time with no pacing (`:78`), counts in memory, and always finishes as `COMPLETED` (`:125-128`).
- `app/api/cron/tick/route.ts` — the only thing that sends scheduled campaigns. Nothing calls it.
- `prisma/schema.prisma` — `BroadcastCampaign` (`:498`), `BroadcastJob` (`:543`), `CampaignStatus` (`:93`), `BroadcastJobStatus` (`:103`), `TenantEmailConfig` (`:956`), `GlobalSuppression` (`:994`), `EmailEvent` (`:1017`).

Problems this causes: a restart loses the campaign (`MKT-03`), scheduled campaigns never send (`MKT-01`), stored quotas are never enforced and provider rate-limit errors become permanent failures (`MKT-04`), statuses and counters are untrue.

## 3. Target design (applies to email now, WhatsApp later)

- **The database is the queue.** `BroadcastJob` is one row per recipient per campaign. No Redis or other new infrastructure.
- **API routes only write rows.** No route sends a message. "Send now" means `scheduledAt = now`.
- **One worker process does the sending.** It is a separate long-running Node process (`npm run worker`), independent of how Next is started. It loops every few seconds: start due campaigns, claim due jobs, send them, finish campaigns.
- **Safe with more than one worker.** Jobs are claimed with `FOR UPDATE SKIP LOCKED`.
- **Counters come from the job table**, computed with `groupBy`, never incremented in memory.
- **Channel-neutral.** The worker picks a sender by `campaign.channel`. Step E1 implements `EMAIL` only and must leave a clear place for `WHATSAPP` (step W3).

---

## Part 1 — Email marketing

### E1. Sending engine (full specification)

**Goal:** scheduled and immediate email campaigns are sent by a background worker at a safe speed, survive restarts, never double-send, and report true status.

#### E1.1 Schema changes

`BroadcastJob` — add:
- `channel Channel` (copy of the campaign channel, so the worker can filter without a join)
- `recipient String` (the email address at enqueue time)
- `variant String?` (`"A"` / `"B"`, used by E9; fill `"A"` now)
- `providerMessageId String?`
- `lockedAt DateTime?`, `lockedBy String?`
- `@@unique([campaignId, customerId])`
- `@@index([tenantId, status, scheduledFor])`

`BroadcastJobStatus` — add `SKIPPED_SUPPRESSED`, `SKIPPED_INVALID`, `CANCELLED`. Keep the existing values.

`BroadcastCampaign` — add `totalRecipients Int @default(0)`, `audienceBuiltAt DateTime?`, `startedAt DateTime?`, `completedAt DateTime?`, `lastError String?`, and `@@index([status, scheduledAt])`.

Before adding the unique index, the migration must handle existing duplicate `(campaignId, customerId)` rows (keep the newest).

#### E1.2 Changes to the create-campaign route

In `app/api/dashboard/broadcast/route.ts`, **EMAIL branch only**:
- Create the campaign as `QUEUED` with `scheduledAt = scheduledAt ?? now`, and `sent = 0`.
- Do not call `dispatchEmailCampaign`. Return `202` with the campaign.
- Accept an optional `Idempotency-Key` header; if a campaign with the same key and tenant was created in the last 24 hours, return it instead of creating another (needs `idempotencyKey String?` with `@@unique([tenantId, idempotencyKey])`).
- Leave the WhatsApp branch exactly as it is. It is replaced in W3.

#### E1.3 The worker

New files: `worker/index.ts` (loop and shutdown), `worker/campaignRunner.ts` (the four phases below), `worker/senders/emailSender.ts` (sends one job). Add script `"worker": "tsx worker/index.ts"` and include it in `dev:all`.

Each loop runs four phases in order:

1. **Start due campaigns.** Atomically move campaigns from `QUEUED` to `SENDING` where `scheduledAt <= now` (one `updateMany` per campaign with `status: 'QUEUED'` in the `where`; proceed only if `count === 1`). Set `startedAt`.
2. **Build the audience** for campaigns in `SENDING` with `audienceBuiltAt = null`. Use the existing `SegmentationService.buildUnifiedCustomerFilter`. Read contacts in pages of 1,000 by cursor, and `createMany({ skipDuplicates: true })` jobs with `status: PENDING`, `scheduledFor = now`. Contacts with no email get `SKIPPED_INVALID`. When all pages are done, set `totalRecipients` and `audienceBuiltAt`. This must be safe to run twice (the unique index guarantees it).
3. **Claim and send jobs.** For each tenant that has due jobs:
   - Skip the tenant if `TenantEmailConfig.isAutoPaused` is true.
   - Compute the allowance: `min(hourlySendRate − sent in last 60 min, dailySendQuota − sent in last 24 h, per-loop cap)`. Count from `BroadcastJob` rows with `status = SENT` and `processedAt` in the window. If the allowance is 0, skip the tenant this loop.
   - Claim up to the allowance in one raw SQL statement: `UPDATE "BroadcastJob" SET status='PROCESSING', "lockedAt"=now(), "lockedBy"=$worker, attempts=attempts+1 WHERE id IN (SELECT j.id FROM "BroadcastJob" j JOIN "BroadcastCampaign" c ON c.id=j."campaignId" WHERE j."tenantId"=$tenant AND j.channel='EMAIL' AND j.status='PENDING' AND j."scheduledFor"<=now() AND c.status='SENDING' ORDER BY j."scheduledFor" LIMIT $n FOR UPDATE OF j SKIP LOCKED) RETURNING *`. Use bound parameters, not string interpolation.
   - Iterate tenants in rotating order so one large tenant cannot starve the others.
   - For each claimed job, call the email sender (E1.4) with limited concurrency (default 5).
4. **Finish campaigns.** For each `SENDING` campaign with `audienceBuiltAt` set and no `PENDING` or `PROCESSING` jobs: compute counts by `groupBy` status, write `sent`, `failed`, `completedAt`, and set status `COMPLETED`, or `FAILED` if zero jobs were `SENT`.

Also every loop: **recover stale locks** — jobs in `PROCESSING` with `lockedAt` older than 10 minutes go back to `PENDING`.

Loop interval, per-loop cap, concurrency and stale timeout come from env variables with sane defaults. On `SIGTERM` the worker stops claiming, waits for in-flight sends, then exits.

#### E1.4 Sending one job

In `worker/senders/emailSender.ts`:

1. Re-check the campaign is still `SENDING`. If `PAUSED`, put the job back to `PENDING` without counting an attempt. If `CANCELLED`, set the job `CANCELLED`.
2. Suppression: call `EmailSuppressionService.isEmailSuppressed(tenantId, recipient)`. If suppressed, set `SKIPPED_SUPPRESSED`.
3. Render subject and body using the same code `dispatchCampaign.ts` uses today (move it into a shared function; do not change rendering behaviour in this step — the placeholder problem at `dispatchCampaign.ts:87` is fixed in E5).
4. Send through the existing `EmailTransportAdapter`. Pass the job ID as an idempotency key to the provider when the provider supports one (check the Resend API documentation; do not assume).
5. Result handling:
   - Success: `SENT`, `processedAt = now`, store `providerMessageId`.
   - Temporary failure (HTTP 429, 5xx, network error, timeout): if `attempts < 5`, set `PENDING` with `scheduledFor = now + backoff` (1 min, 5 min, 30 min, 2 h) and store `lastError`; otherwise `FAILED`.
   - Permanent failure (other 4xx, invalid address): `FAILED` with `lastError`.

For this to work, the provider adapters must return the HTTP status or a `retryable` flag instead of only throwing a string. Change `lib/email/types.ts` and the adapters minimally to carry it.

Add a request timeout (30 s) to provider calls.

#### E1.5 Pause, resume, cancel

`app/api/dashboard/broadcast/[id]/status/route.ts` already changes status. Adjust so that:
- pause: `SENDING → PAUSED` (jobs stay `PENDING`)
- resume: `PAUSED → SENDING` if `startedAt` is set, otherwise `→ QUEUED`
- cancel: campaign `CANCELLED`, and all `PENDING` jobs `CANCELLED`

#### E1.6 What happens to the old code

- `dispatchEmailCampaign` stays in the file but is no longer called for email campaigns. Mark it `@deprecated` with a pointer to the worker.
- `app/api/cron/tick/route.ts`: remove only the email-campaign block (`:24-49`). Leave the social publisher call.
- Do not touch `lib/marketing/*`, `lib/social/*`, `whatsapp-engine/*`, `lib/auth/*`.

#### E1.7 Tests (must import the real worker code)

Use Node's built-in test runner through `tsx` (no new dependency), in `test/worker/`, wired into `npm test`. Use a fake provider adapter injected into the sender; never call a real provider from tests.

1. A campaign scheduled 1 minute ahead is not sent before its time and is sent after.
2. 200 recipients; the worker is stopped after about 50; a new worker finishes; every recipient has exactly one `SENT` job and the fake provider received exactly 200 calls.
3. Two workers run at once on one campaign; no recipient is sent twice.
4. `hourlySendRate = 50`; after one pass no more than 50 are `SENT`; the rest remain `PENDING`.
5. Pausing stops new sends within one loop; resuming continues without duplicates.
6. The fake provider returns 429 twice, then success; the job ends `SENT` with `attempts = 3` and delays were applied.
7. Tenant A is auto-paused; tenant B's campaign still sends.
8. A suppressed address ends `SKIPPED_SUPPRESSED` and the provider is not called.
9. A campaign where every send fails ends `FAILED`, not `COMPLETED`.
10. Running the audience build twice creates no duplicate jobs.

#### E1.8 Done when

- All ten tests pass under `npm test`, and `npm run test:typecheck` passes.
- With `next dev` and `npm run worker` running, a campaign created in the UI moves `QUEUED → SENDING → COMPLETED` and the campaigns page shows counts that match the job table.
- No email is sent from inside any HTTP request handler (search the email branch of the broadcast route to confirm).
- Report: files changed, the migration name, new env variables, and anything that could not be done as specified.

---

### E2 to E10 (outline; each will be expanded to full detail before it is built)

**E2. Contacts and lists.**
New `ContactList` and `ContactListMember` tables. Custom fields as a `CustomFieldDefinition` table plus a JSON column on `Customer`. Rebuild CSV import as a real file upload processed in the background, with duplicate handling by email, row limits and an import report (fixes `contacts/import-csv`, which today marks every row as subscribed). A proper consent model: status, source, timestamp and proof per contact. Explicit field selection in contact APIs (no `otpCode`).
*Done when:* importing a 10,000-row file works, re-importing creates no duplicates, and imported contacts are not auto-subscribed without a stated consent source.

**E3. Segments.**
Saved `Segment` table with a rule tree (and / or) over tags, lists, custom fields, consent, and activity ("opened in last N days", "clicked campaign X", "never opened"). Extends `lib/email/segmentation.ts`. Live audience count endpoint. Campaigns reference a segment ID.
*Done when:* a saved segment shows a correct live count and a campaign sent to it reaches exactly those contacts. Activity rules depend on E7 data.

**E4. Sender and domain setup.**
Enforce at send time that the from-address domain is a `VERIFIED` `TenantSendingDomain` for that tenant; the worker fails the campaign with a clear error otherwise. Remove the silent rewrite of free-mail senders (`ResendProviderAdapter.ts:9-11`) and the `mock_email_key` path (`ProviderFactory.ts:31`); a tenant with no provider configured cannot send. Decide per provider: finish SES and SMTP properly or hide them in the UI (`MKT-09`).
*Done when:* a tenant cannot send from an unverified domain, and the error tells them what to fix.

**E5. Templates and merge fields.**
HTML-escape merge values (`MKT-12`). A missing merge value never becomes a placeholder: each field has a defined fallback set by the template author, or the recipient is skipped with status `SKIPPED_INVALID` and a reason (fixes `MKT-05`). A compliance footer with postal address and unsubscribe link is appended by the system on every marketing email, not left to the template (`MKT-06`). Add a postal address field to tenant settings. Sanitise template HTML on save and add `sandbox` to preview iframes (`SEC-21`).
*Done when:* no marketing email can leave without a working unsubscribe link and address, and a template with a script tag cannot run script in the dashboard.

**E6. Campaign flow.**
One clear flow in the UI: details, audience (segment), content, review, schedule. Pre-send checklist (verified domain, subject present, audience size, unsubscribe present). Test send that respects suppression. Live progress from the job table. Fix the missing `DELETE /api/dashboard/broadcast/[id]` route (`ENG-10`).
*Done when:* every status shown in the UI matches the database, and delete works.

**E7. Tracking and compliance.**
Signed tokens (dedicated secret, required at startup) for open pixel, click redirect and unsubscribe, each carrying tenant, contact and campaign (`SEC-18`, `SEC-19`). Rewrite links at send time; record opens and clicks per contact per campaign. Unsubscribe: GET shows a confirmation page, POST performs it, plus `List-Unsubscribe` and one-click headers on every provider. Provider webhooks: verify signatures, resolve tenant from the provider message ID stored in E1, de-duplicate events, separate hard and soft bounces (`SEC-08`, `SEC-09`). Auto-pause computed over a rolling window (`MKT-11`).
*Done when:* you can see who opened and who clicked which link; a forged webhook or unsubscribe request is rejected; a hard-bounced address is never mailed again.

**E8. Reports.**
Per campaign: recipients, sent, delivered, opened, clicked, bounced, unsubscribed, complained, failed, with rates and the contact list behind each number. Per-link click counts. Tenant-level deliverability page from real events. Remove hardcoded values from email analytics.
*Done when:* every number is computed from events or jobs and opens a list of the contacts behind it.

**E9. A/B testing.**
Send variant A and B to a test portion of the audience, hold the remainder, pick the winner by rate after the chosen duration, then send the winner to the rest (replaces `lib/email/abTesting.ts` logic, `MKT-10`). Implemented as worker phases using the `variant` column from E1.
*Done when:* the remainder receives only the winning version, and the report shows both variants' rates.

**E10. Automations.**
Run the existing journey builder from the worker: a claim step so two workers never run the same enrollment, attempt caps and backoff, triggers that fire on real events (contact created, tag added, joined list, opened, clicked), tenant time zone for quiet hours, exit on unsubscribe or bounce, validated branch targets (`MKT-02`, `MKT-08`). Email steps go through the E1 queue.
*Done when:* a new contact receives a three-step welcome series on schedule with no manual action, and a failing step does not block other enrollments.

**Later extras (not in this plan):** signup forms, double opt-in, send-time optimisation, click heatmaps, reports by device and location.

---

## Part 2 — WhatsApp marketing (outline; starts after E8)

Reuses E1 (queue and worker), E2 (contacts), E3 (segments), E10 (automations).

**W1. Connection.** Per-tenant settings for WhatsApp Business Account ID, Phone Number ID and access token, stored encrypted, returned masked. A "test connection" action that calls the Graph API. Fix the transport selection so Meta Cloud is actually used for these tenants (`AI-10`). Click-to-connect (Embedded Signup) is added later, after Meta approves the app as a Tech Provider.

**W2. Templates.** Create templates with header, body, footer, buttons and variables. Submit to Meta through the Graph API. Sync approval status by webhook and by a periodic pull. Only `APPROVED` templates can be used. Remove the simulate-approval path from production (`SEC-27`).

**W3. Broadcasts.** A `whatsappSender` for the E1 worker. Per-tenant throttling to Meta's messaging tier. Replace the WhatsApp branch of the broadcast route with enqueue-only. No placeholder values in variables (`MKT-05`).

**W4. Delivery tracking.** Verified webhook (raw body signature) that maps `phone_number_id` to the correct tenant with no fallback, and updates each job to sent, delivered, read or failed with Meta's error code (`SEC-08`).

**W5. Replies and opt-out.** Inbound replies land in the existing inbox and are linked to the campaign. STOP keywords opt the contact out on this channel. Enforce the 24-hour customer service window: outside it, only approved templates can be sent.

**W6. Reports and journeys.** Campaign report like E8. WhatsApp template steps inside E10 automations.

**Owner preparation for Part 2:** WhatsApp product added to the Meta app, a test number, a system-user access token with `whatsapp_business_messaging` and `whatsapp_business_management`, the app secret, and a public HTTPS address for webhooks (a tunnel for local testing).


## How each step is reviewed

After the implementing agent reports a step as finished, the reviewer:

1. Reads the full diff and checks it against the rules in section 0 (nothing removed, tenant ID on every query, no placeholders, a real migration).
2. Runs `npm run test:typecheck` and `npm test`.
3. Runs the app and the worker locally against the test database and walks through the step's "Done when" checks.
4. Reports pass or fail with file and line references. The next step starts only after a pass.
