# OneAI Assist — Multi-Tenant System Architecture & Technical Diagrams

> [!NOTE]
> **Platform**: OneAI Assist Multi-Tenant AI SaaS Architecture  
> **Infrastructure**: Next.js 14 App Router + Neon Serverless PostgreSQL (RLS) + Node.js WhatsApp Engine (:3001) + Google Gemini / OpenAI RAG Pipeline + Pinecone Vector Store + Cloudflare R2

---

## Executive Overview

This document contains the authoritative technical architecture diagrams and specification for **OneAI Assist**, detailing all system layers, API request lifecycles, database Row-Level Security (RLS) tenant isolation models, real-time WhatsApp engine messaging, and the RAG (Retrieval-Augmented Generation) intelligence subsystem.

---

## 1. High-Level Technical Architecture Diagram

![OneAIAssist Multi-Tenant AI SaaS Platform Architecture](./images/architecture_diagram.jpg)

### Architecture Layer Breakdown

#### Layer 1: Client Interfaces (User Access & Channels)
- **Agency Dashboard (`/dashboard/*`)**: Next.js React UI for agency administrators, managers, and sales agents (Templates, Broadcasts, Leads, Bot Config, Analytics).
- **WhatsApp Client App**: Customer mobile messaging interface for real-time AI bot interactions and lead intake workflows.
- **Customer Self-Service Portal (`/pme/portal`)**: Tenant-branded portal for policyholders to view active coverage, download documents, and request claims.
- **Public Policy Checkout (`/pme/checkout`)**: Public direct-purchase landing page for instant health insurance policy quotes and payment.

#### Layer 2: Application & API Gateway (Routing, Auth & Real-time Engine)
- **Next.js 14 App Router API & NextAuth Middleware**: Handles HTTP route handlers, JWT authentication, role RBAC checks (`ADMIN`, `MANAGER`, `AGENT`), and SSR page rendering.
- **PostgreSQL Row-Level Security (RLS) Tenant Extractor**: Extracts tenant context (`tenantId`, `role`) from session tokens or request headers and executes `SELECT set_config('app.current_tenant_id', ...)` for 100% multi-tenant data isolation.
- **WhatsApp Baileys & OpenWA Engine Server (`Node.js :3001`)**: Dedicated Node.js microservice handling real-time WhatsApp WebSockets, incoming message webhooks, QR code session generation, and `Socket.io` bi-directional event broadcasts.

#### Layer 3: AI & RAG Subsystem (Intelligence Layer)
- **Vector Embedder**: Google Gemini `text-embedding-004` / OpenAI `text-embedding-3-small` generating 768-dimensional dense vector embeddings.
- **RAG Pipeline Engine**: Text chunking engine (1000-char chunks, 200-char overlap) and Top-K Cosine Similarity Retriever (`lib/rag/index.ts` & `retrieve.ts`).
- **Generative LLM Engine**: Multi-model support including Google Gemini 1.5 Flash, GPT-4 Turbo, and Claude 3.5 Sonnet for high-quality, guardrailed agent replies.

#### Layer 4: Multi-Tenant Storage Tier (Persistent Storage & Assets)
- **Neon Serverless PostgreSQL Database**: Primary relational database with RLS enabled (`Tenant`, `User`, `Customer`, `Lead`, `PolicyCatalogItem`, `Policy`, `PolicyDocumentChunk`, `Conversation`, `Message`, `BroadcastCampaign`, `EscalationLog`).
- **Pinecone Vector Store**: Multi-tenant vector index with strict per-tenant namespace isolation (`policy-docs-tenant-001`, `policy-docs-tenant-002`).
- **Cloudflare R2 Object Storage**: S3-compatible, encrypted storage for original policy PDF documents and asset attachments.

---

### Real-Time Conversation Flow

```mermaid
graph TD
    Step1["1. Customer sends inquiry on WhatsApp"] --> Step2["2. Message routed to Engine Server (:3001)"]
    Step2 --> Step3["3. Context & Data retrieved via RAG (Pinecone + PostgreSQL)"]
    Step3 --> Step4["4. AI generates response (Gemini 1.5 Flash LLM)"]
    Step4 --> Step5["5. Instant reply sent back to customer on WhatsApp"]
```

---

## 2. High-Level Component Interaction Diagram

```mermaid
graph TB
    subgraph Layer 1: Client Interfaces
        Dash["Agency Dashboard<br/>(/dashboard/*)"]
        Portal["Customer Portal<br/>(/pme/portal)"]
        Checkout["Public Checkout<br/>(/pme/checkout)"]
        WhatsAppClient["WhatsApp Mobile App"]
    end

    subgraph Layer 2: Application & API Gateway
        AuthSession["NextAuth.js Auth & Session Token"]
        RLSContext["PostgreSQL RLS Context Extractor<br/>(lib/tenant/index.ts)"]
        API_Routes["Next.js App Router Route Handlers<br/>(/api/*)"]
        WA_Engine["WhatsApp Baileys/OpenWA Engine<br/>(Node.js :3001 via Socket.io)"]
    end

    subgraph Layer 3: AI & RAG Subsystem
        Embed_Engine["Google Gemini text-embedding-004<br/>(768-dim Vectors)"]
        RAG_Pipeline["RAG Ingestion & Similarity Retriever<br/>(lib/rag/index.ts & retrieve.ts)"]
        LLM_Engine["Google Gemini 1.5 Flash /<br/>GPT-4 / Claude 3.5 Sonnet"]
    end

    subgraph Layer 4: Multi-Tenant Storage Tier
        DB_Postgres[("Neon PostgreSQL Database<br/>- Row-Level Security (RLS)<br/>- Tenants, Users, Leads, Policies, Customers")]
        DB_Vector[("Pinecone Vector Store<br/>(Isolated Per-Tenant Namespaces)")]
        R2_Store[("Cloudflare R2 Object Storage<br/>(Original Policy PDFs)")]
    end

    %% Flow Connections
    Dash --> AuthSession
    Portal --> AuthSession
    Checkout --> RLSContext

    AuthSession --> RLSContext
    RLSContext --> API_Routes

    WhatsAppClient <-->|WhatsApp Protocol| WA_Engine
    WA_Engine <-->|Socket.io / HTTP| RAG_Pipeline

    API_Routes --> RAG_Pipeline
    RAG_Pipeline --> Embed_Engine
    RAG_Pipeline --> LLM_Engine

    RAG_Pipeline --> DB_Vector
    RAG_Pipeline --> DB_Postgres
    API_Routes --> R2_Store
    API_Routes --> DB_Postgres
```

---

## 3. Multi-Tenant Database ER Diagram (Prisma & RLS)

```mermaid
erDiagram
    TENANT ||--|{ USER : contains
    TENANT ||--|{ LEAD : owns
    TENANT ||--|{ CUSTOMER : manages
    TENANT ||--|{ POLICY_CATALOG_ITEM : offers
    TENANT ||--|{ POLICY : issues
    TENANT ||--|{ BROADCAST_CAMPAIGN : schedules
    TENANT ||--|{ ESCALATION_LOG : logs
    POLICY_CATALOG_ITEM ||--|{ POLICY_DOCUMENT_CHUNK : chunks

    TENANT {
        string id PK
        string name
        string slug
    }
    USER {
        string id PK
        string tenantId FK
        string email
        string role
    }
    CUSTOMER {
        string id PK
        string tenantId FK
        string displayName
        string primaryPhone
        string email
    }
    LEAD {
        string id PK
        string tenantId FK
        string customerId FK
        string status
        string source
    }
    POLICY_CATALOG_ITEM {
        string id PK
        string tenantId FK
        string policyId
        string name
        int premiumMin
        int premiumMax
        int sumInsured
    }
    POLICY_DOCUMENT_CHUNK {
        string id PK
        string tenantId FK
        string policyCatalogId FK
        string chunkText
        int pageNumber
        string pineconeVectorId
    }
    ESCALATION_LOG {
        string id PK
        string tenantId FK
        string userQuestion
        string reason
        datetime triggeredAt
    }
```

---

## 4. WhatsApp Engine Integration Sequence Diagram

```mermaid
sequenceDiagram
    autonumber
    actor Admin as Agency Administrator
    participant Dashboard as Settings UI (/dashboard/settings)
    participant API as Next.js API (/api/whatsapp/connect)
    participant WAServer as Baileys/OpenWA Engine (Port 3001)
    participant Socket as Socket.io Channel
    participant WA as WhatsApp Web Servers

    Admin->>Dashboard: Click "Connect via QR Code"
    Dashboard->>API: POST /api/whatsapp/connect (tenantId, engine='OPENWA')
    API->>WAServer: Request Session Initialization
    WAServer->>WA: Connect Protocol & Request QR Raw Bytes
    WA-->>WAServer: Return QR String
    WAServer->>Socket: Emit 'whatsapp_qr' event
    Socket-->>Dashboard: Receive QR Data & Render QR Code Component
    Admin->>Dashboard: Scan QR Code using WhatsApp App
    WA-->>WAServer: Authenticated Session Established
    WAServer->>Socket: Emit 'whatsapp_status' (status='CONNECTED')
    WAServer->>API: Update Database WhatsAppStatus
    Socket-->>Dashboard: Update UI Badge to CONNECTED
```

---

## 5. End-to-End RAG Ingestion & Real-Time Query Sequence

```mermaid
sequenceDiagram
    autonumber
    actor User as Client / Customer
    participant Engine as WhatsApp Engine Server (:3001)
    participant RAG as RAG Pipeline (lib/rag)
    participant VectorDB as Pinecone Vector Store
    participant DB as PostgreSQL (Neon RLS)
    participant AI as Gemini 1.5 Flash Model

    User->>Engine: Send Question ("What is covered under Apex Family Gold?")
    Engine->>RAG: Forward Query Context
    RAG->>AI: Generate Query Embedding (text-embedding-004)
    AI-->>RAG: 768-dim Query Vector
    RAG->>VectorDB: Nearest Neighbor Cosine Search (Top-K=3, namespace=tenantId)
    VectorDB-->>RAG: Vector Match IDs & Scores
    RAG->>DB: Fetch PolicyDocumentChunk text matching Vector Match IDs
    DB-->>RAG: Exact Context Text Snippets
    RAG->>AI: Prompt = System Guardrails + Context Snippets + Query
    AI-->>RAG: Natural Language Answer
    RAG->>Engine: Send Formatted Message
    Engine-->>User: Deliver Answer to Customer on WhatsApp
```
