# Knowledge Base & RAG Architecture — Technical Documentation

## Executive Overview
The **OneAIAssist Knowledge Base & RAG (Retrieval-Augmented Generation) Subsystem** allows insurance agencies to upload policy documents (PDFs), chunk and embed textual policy rules, and provide intelligent, context-aware AI bot responses for client inquiries and automated onboarding workflows.

---

## Technical Architecture Diagram

```mermaid
graph TD
    subgraph Client Tier
        UI_Dash["Agency Dashboard<br/>(/dashboard/bot-config)"]
        UI_WA["WhatsApp Mobile App<br/>(Client Conversations)"]
        UI_Portal["Customer Portal<br/>(/pme/portal)"]
    end

    subgraph Application & API Tier
        API_Upload["PDF Ingestion API<br/>(/api/policy-catalog/upload)"]
        API_Catalog["Catalog API<br/>(/api/policy-catalog)"]
        RAG_Engine["RAG Pipeline<br/>(lib/rag/index.ts)"]
        RAG_Retriever["Vector Retriever<br/>(lib/rag/retrieve.ts)"]
        WA_Server["WhatsApp Engine<br/>(Baileys / OpenWA Node Server)"]
    end

    subgraph AI Model Tier
        AI_Embed["Google Gemini text-embedding-004 /<br/>OpenAI text-embedding-3-small"]
        AI_LLM["Google Gemini 1.5 Flash /<br/>GPT-4 Turbo / Claude 3.5"]
    end

    subgraph Multi-Tenant Storage Tier
        DB_PG[("PostgreSQL (Neon DB)<br/>- RLS Isolation<br/>- PolicyCatalogItem<br/>- PolicyDocumentChunk")]
        DB_Vector[("Pinecone / pgvector<br/>(Tenant Namespace Vector Index)")]
        R2_Store[("Cloudflare R2 Object Storage<br/>(Original Policy PDFs)")]
    end

    %% Flow Connections
    UI_Dash -->|Upload PDF| API_Upload
    API_Upload -->|Store Original File| R2_Store
    API_Upload -->|Extract Text & Chunk| RAG_Engine
    RAG_Engine -->|Generate Vector Floating Array| AI_Embed
    AI_Embed -->|Return 768-dim Vector| RAG_Engine
    RAG_Engine -->|Upsert Vectors| DB_Vector
    RAG_Engine -->|Write Text Chunks| DB_PG

    UI_WA <-->|Send / Receive Msgs| WA_Server
    WA_Server -->|Query RAG Bot| RAG_Retriever
    RAG_Retriever -->|Similarity Search| DB_Vector
    DB_Vector -->|Return Top-K Chunk IDs| RAG_Retriever
    RAG_Retriever -->|Fetch Chunk Text| DB_PG
    RAG_Retriever -->|Augment Prompt Context| AI_LLM
    AI_LLM -->|Stream Bot Answer| WA_Server
```

---

## 1. Sequence Diagrams

### 1.1 Document Upload & Vector Indexing Sequence

```mermaid
sequenceDiagram
    autonumber
    actor Admin as Agency Admin
    participant API as /api/policy-catalog/upload
    participant Parser as PDF Parser (pdf-parse)
    participant Embed as Gemini Embeddings API (text-embedding-004)
    participant VectorDB as Pinecone Vector Store
    participant DB as PostgreSQL (Neon RLS)
    participant Onboarding as Onboarding Engine

    Admin->>API: Upload Policy PDF File
    API->>Parser: Extract Raw Text & Page Numbers
    Parser-->>API: Document Text Chunks (1000 chars, 200 overlap)
    API->>Embed: Request Vector Embeddings (Batch Chunks)
    Embed-->>API: 768-dimensional Dense Vectors
    API->>VectorDB: Upsert Vectors (Namespace: tenantId)
    API->>DB: Insert PolicyCatalogItem & PolicyDocumentChunk
    API->>Onboarding: Update Progress (productAdded = true)
    API-->>Admin: 200 OK (Indexed & Cataloged)
```

### 1.2 Real-Time RAG Inquiry & AI Answer Sequence

```mermaid
sequenceDiagram
    autonumber
    actor Client as Customer (WhatsApp)
    participant WA as Baileys Engine Server (Socket.io)
    participant Bot as RAG Response Engine (lib/rag/retrieve.ts)
    participant VectorDB as Pinecone Index (tenantId)
    participant DB as PostgreSQL PolicyDocumentChunk
    participant LLM as Gemini 1.5 Flash Model

    Client->>WA: "What individual plans cover NY with monthly premium under $150?"
    WA->>Bot: Forward Customer Message Context
    Bot->>VectorDB: Cosine Similarity Search (Embedding query vector)
    VectorDB-->>Bot: Return Top-K Vector Match IDs
    Bot->>DB: SELECT chunkText FROM PolicyDocumentChunk WHERE pineconeVectorId IN (...)
    DB-->>Bot: Context Text Chunks (Policy Details & Exclusions)
    Bot->>LLM: System Prompt + Context Chunks + User Question
    LLM-->>Bot: Structured Natural Language Answer
    Bot->>WA: Send Auto-Reply Message
    WA-->>Client: Receive Answer on WhatsApp
```

---

## 2. AI Models Specification

### 2.1 Vector Embedding Models
* **Primary Embedding Model**: `text-embedding-004` (Google Gemini Embeddings API)
* **Secondary / Fallback Model**: `text-embedding-3-small` (OpenAI Embeddings API)
* **Dimensionality**: 768 / 1536 dense vector floating-point array
* **Purpose**: Converts extracted policy text chunks into high-dimensional semantic vector representations for similarity search.

### 2.2 Generative LLM Completion Models
* **Google Gemini 1.5 Flash** (`gemini-1.5-flash`): Default high-performance model for real-time RAG prompt completions and automated WhatsApp customer interactions.
* **GPT-4 Turbo** (`gpt-4-turbo`): Supported provider option for complex multi-policy reasoning.
* **Claude 3.5 Sonnet** (`claude-3-5-sonnet`): Supported provider option for strict policy guardrails.

---

## 3. Storage & Database Schema

After policy document upload and embedding generation, data is persisted across three distinct storage tiers:

### Tier 1: Vector Database (`Pinecone` & `pgvector`)
* **Content**: Numerical embedding floating-point arrays and vector IDs (`pineconeVectorId`).
* **Tenant Isolation**: Isolated by `tenantId` namespace in Pinecone or RLS-scoped rows in `pgvector`.
* **Purpose**: Performs sub-100ms cosine similarity / nearest-neighbor vector retrieval.

### Tier 2: Relational Database (`PostgreSQL / Neon DB`)
Data is stored across two primary Prisma models with Row-Level Security (RLS) enabled:

#### `PolicyCatalogItem` Table
Stores policy metadata displayed in the **Product Catalog** and **Knowledge Base** tabs:
```prisma
model PolicyCatalogItem {
  id               String   @id @default(cuid())
  tenantId         String
  policyId         String   // e.g. POL-HEALTH-001
  name             String   // e.g. Apex Care Basic Individual Health Plan
  insurerName      String   // e.g. Apex Health Care
  states           String[] // e.g. ["NY", "CA", "FL"]
  premiumMin       Int      // Minimum monthly premium in cents
  premiumMax       Int      // Maximum monthly premium in cents
  sumInsured       Int      // Maximum coverage limit in cents
  active           Boolean  @default(true)
  extractedSummary String   @db.Text
  pdfUrl           String   // Public or signed URL of original PDF document
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
}
```

#### `PolicyDocumentChunk` Table
Stores granular text chunks extracted from policy documents for RAG context building:
```prisma
model PolicyDocumentChunk {
  id               String   @id @default(cuid())
  tenantId         String
  policyCatalogId  String?  // Foreign key to PolicyCatalogItem
  policyId         String?  
  chunkText        String   @db.Text
  pageNumber       Int
  pineconeVectorId String   // Reference ID matching the vectorstore
  createdAt        DateTime @default(now())
}
```

### Tier 3: Object Storage (`Cloudflare R2`)
* **Content**: Raw original policy PDF files uploaded by agency managers.
* **Access**: Accessible via secure signed URLs saved in `PolicyCatalogItem.pdfUrl`.

---

## 4. RAG Document Ingestion Workflow

1. **Upload & Parsing**: PDF bytes are uploaded to `/api/policy-catalog/upload` and parsed into raw text using `pdf-parse`.
2. **AI Summary Generation**: An initial plain-language policy summary is generated using `gemini-1.5-flash` and stored in `PolicyCatalogItem.extractedSummary`.
3. **Chunking**: Full document text is split into chunks of `1000` characters with an overlap of `200` characters.
4. **Vector Embedding**: Each text chunk is passed to `embedder.getEmbedding(chunkText)` to produce vector embeddings.
5. **Vectorstore Ingestion**: Embedding vectors are upserted into **Pinecone** / **`pgvector`** under the active `tenantId` namespace.
6. **Relational Database Write**: Chunk text rows and metadata are saved to `PolicyDocumentChunk` and `PolicyCatalogItem` tables inside an RLS-scoped Prisma transaction.
7. **Onboarding Progress Trigger**: Automatically updates `TenantOnboardingProgress.productAdded = true` to complete Step 5 of the agency setup checklist.

---

## 5. Summary of API Endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/policy-catalog` | `GET` | Fetches tenant policy items for Product Catalog & Knowledge Base tabs |
| `/api/policy-catalog` | `POST` | Creates a new policy catalog record and triggers onboarding completion |
| `/api/policy-catalog/upload` | `POST` | Ingests policy PDF, extracts text, generates embeddings & indexes RAG vectors |
| `/api/policy-catalog/chunks` | `GET` | Retrieves indexed text chunks for a specific policy ID |
| `/api/tenant/onboarding` | `GET` | Dynamic checklist status evaluation including `productAdded` |
