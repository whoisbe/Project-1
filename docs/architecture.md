# Architecture Overview — AI Search MVP (Typesense Docs)

## High-Level Flow

### Offline (Ingestion) — UPDATED (No Firecrawl)
Local Typesense docs repo (filesystem)
  → Markdown files
    → Normalize + metadata extraction (url/title/source)
      → Chunk by headings (300–800 tokens)
        → OpenAI Embeddings
          → Typesense Index (docs_chunks)

### Online (Query)
User query (SvelteKit UI)
  → API: /api/search
    → Query embedding (OpenAI)
      → Typesense keyword search + Typesense vector search
        → RRF fusion (hybrid)
          → Hosted reranker (top N)
            → Results + explanation metadata
              → UI renders list + “Why this result?”

---

## Components

### Ingestion Pipeline (ingest/)
- Local docs loader (reads Markdown files from a local repo path)
- Markdown normalizer (extract title, construct url)
- Heading-based chunker
- Embedding generator (OpenAI)
- Typesense indexer

### Runtime Services
- SvelteKit (UI + API routes)
- Typesense (search backend)
- Hosted Rerank API

---

## Design Principles
- Search-first, not chat-first
- Explainable relevance
- Engine-agnostic retrieval layer
- Deterministic ingestion (local repo source, no crawl limits)