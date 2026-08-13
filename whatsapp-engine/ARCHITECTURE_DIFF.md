# ARCHITECTURE_DIFF.md: OneAI Assist WhatsApp Integration Refactoring

## 1. Existing vs. Target Message & Auth Flows

### 1.1 Inbound Message Flow
*   **Existing Flow:**
    *   Baileys `messages.upsert` notifies `connectTenant`.
    *   Database transaction reads and decrypts all customers to find phone number match.
    *   If no match, creates `Customer` and `CustomerChannel`.
    *   Finds/creates open `Conversation`.
    *   Saves message (`direction = INBOUND`, `senderType = CUSTOMER`) and emits `new_message` to Socket.io namespace room `tenant_<tenantId>`.
    *   If `TenantAIConfig.isActive`, calls `runAIAgentAutoResponse` to generate AI text reply, then sends via Baileys and saves/emits.
*   **Target Flow:**
    *   Use a standardized `IMessageTransport` contract.
    *   Inbound raw events mapped to channel-agnostic `CanonicalMessage` via `WhatsAppNormalizer`.
    *   Capture `fromMe` messages (outbound from connected physical phone), record in DB (`direction = OUTBOUND`, `source = HUMAN`), broadcast, and **skip AI processing**.
    *   Check case-insensitive tenant-configurable `stopKeyword` (default "STOP"). If matched, set `automationEnabled = false` on `Conversation` (opt-out).
    *   Support conversation status/modes (`AI_ACTIVE`, `HUMAN_HANDOFF`, `STOPPED`).
    *   Show typing indicator (`sendPresenceUpdate("composing")`) during AI synthesis, cleanly wrapped in `try...finally`.

### 1.2 Outbound Message Flow
*   **Existing Flow:**
    *   Next.js UI makes `POST /api/whatsapp/send` -> Proxied to Engine `POST /api/whatsapp/send` `{ tenantId, to, text, conversationId }`.
    *   Engine looks up socket from `sessions` Map.
    *   Cleans phone format for JID.
    *   Sends text via `sock.sendMessage(jid, { text })`.
    *   Creates DB message record (`direction = OUTBOUND`, `senderType = AGENT`) and emits `new_message` Socket.io event.
*   **Target Flow:**
    *   Expose a single generic endpoint `POST /api/whatsapp/send` in Next.js that accepts text and/or `mediaId`/`mimeType`.
    *   `MessageService` processes this call securely:
        *   Checks `clientMessageId` for idempotency.
        *   Resolves `mediaId` to secure internal file path.
        *   Determines message type from MIME type (e.g. `image/png` -> image, `video/mp4` -> video) and routes to correct transport method.
        *   Saves record and updates status.
    *   Real-time events strictly scoped to Socket.io room `tenant:<tenantId>`.

### 1.3 Auth Flow
*   **Existing Flow:**
    *   `getDatabaseAuthState(tenantId)`: reads, decrypts (AES-256-GCM), parses, and mounts Baileys auth credentials.
    *   Saves dynamically using debounced Neon PG write.
    *   Terminal disconnect (401/405/loggedOut) wipes database auth via `clearDatabaseAuthState(tenantId)`.
*   **Target Flow (Preserved & Enhanced):**
    *   Keep the PostgreSQL-backed encrypted auth state provider.
    *   Add LRU `messageCache` (1000 items) and `msgRetryCounterCache` inside the tenant's socket connection logic.
    *   Ensure Baileys retry handshake relies on `getMessage()` callback checking the LRU message cache.

---

## 2. Identified Risks & Mitigation Strategies

*   **Risk 1: Database Auth Corruption / Connection Starvation**
    *   *Mitigation:* Retain the existing debounced saves and `makeCacheableSignalKeyStore` wrapping. Never fallback to local files or plaintext storage.
*   **Risk 2: Multi-tenant Isolation Leak**
    *   *Mitigation:* Keep the server-side context lookup `getTenantContext()` in Next.js routes. Do not trust tenantId from client payloads. Ensure Socket.io namespaces use `tenant:<tenantId>` exclusively.
*   **Risk 3: AI Loop Spontaneous Echoing on fromMe**
    *   *Mitigation:* Filter outbound messages created on phone (`event.key.fromMe`). Store them in database so the dashboard stays in sync, but bypass the AI synthesis logic completely.
*   **Risk 4: Database Migrations**
    *   *Mitigation:* Create additive-only schema changes. No tables or columns dropped.

---

## 3. Files to Be Touched / Created

*   **New Files:**
    *   `whatsapp-engine/transport/IMessageTransport.ts` (Interface)
    *   `whatsapp-engine/transport/TransportManager.ts` (Dynamic Manager)
    *   `app/api/media/upload/route.ts` (Media upload handling)
*   **Modified Files:**
    *   `prisma/schema.prisma` (Database models & enums)
    *   `whatsapp-engine/engine-logic.ts` (Add LRU caching, msg retry, fromMe tracking, normalizer, STOP keywords, typing)
    *   `whatsapp-engine/server.ts` (Extend `POST /api/whatsapp/send`, register typing/media routes and namespaces)
    *   `app/api/whatsapp/send/route.ts` (Next.js proxy route)
