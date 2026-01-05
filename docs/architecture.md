# Architecture Overview — AI Search MVP (Typesense Docs)

## Goal
A portfolio-grade, production-style documentation search system demonstrating:
- Hybrid retrieval (keyword + vector)
- Two-stage ranking (retrieve → fuse → hosted rerank)
- Real ingestion pipeline (crawl → chunk → embed → index)
- Explainable relevance (“Why this result?”)

---

## High-Level Flow

### Offline (Ingestion)
Firecrawl (crawl docs)
→ Markdown pages
→ Normalize + clean
→ Chunk by headings (300–800 tokens)
→ OpenAI embeddings (text-embedding-3-small)
→ Typesense collection: `docs_chunks`

### Online (Query)
User query (SvelteKit UI)
→ API: `/api/search`
→ Query embedding (OpenAI)
→ Typesense keyword search
→ Typesense vector search
→ RRF fuse (hybrid)
→ Hosted rerank (top N)
→ Results + explanation metadata
→ UI renders list + “Why this result?”

---

## Components

### 1) Web App (SvelteKit) — `apps/web`
Responsibilities:
- Search UI:
  - query input
  - mode selector (keyword / semantic / hybrid)
  - facet filters (section_path, source)
  - results list + detail page
- API routes:
  - `GET /api/search`
  - `GET /api/doc/:id`

Notes:
- UI should display “Why this result?” signals:
  - keyword_rank, vector_rank, rrf_score, rerank_score
  - snippet highlights

### 2) Search Backend (Typesense)
Collection: `docs_chunks`

Responsibilities:
- Store chunked docs + metadata
- Provide keyword search over `title`, `section_path`, `content`
- Provide vector search over `embedding`
- Provide facets for:
  - `section_path`
  - `source`

### 3) Hosted Reranker (External API)
Responsibilities:
- Accept: query + list of candidate texts (top N from fused retrieval)
- Return: reordered candidates with relevance scores

Used only in v1 (no local reranker service required).

### 4) Ingestion Pipeline — `ingest`
Stages:
1. Crawl:
   - Use Firecrawl Crawl API
   - Seed URL: `DOCS_SEED_URL` (Typesense docs)
2. Normalize:
   - Extract `url`, `title`, `markdown`
3. Chunk:
   - Split by headings (#, ##, ###)
   - Preserve code blocks
   - Add `section_path`
4. Embed:
   - OpenAI embeddings for each chunk
5. Index:
   - Create/update Typesense collection
   - Upsert documents

---

## Data Model

### Page Record (pre-chunk)
- url
- title
- markdown
- source
- crawl_time

### Chunk Document (indexed)
- id (stable hash: url + section_path + chunk_index)
- url
- title
- section_path (facet)
- content
- source (facet, default: typesense-docs)
- tags (optional facet)
- embedding (vector)

---

## Retrieval & Ranking

### Search Modes
- Keyword:
  - Typesense keyword search only
- Semantic:
  - Typesense vector search only
- Hybrid (default):
  - Keyword + vector retrieval
  - Fuse with RRF
  - Rerank top N with hosted API

### RRF Fusion
Inputs:
- ranked keyword list
- ranked vector list

Output:
- fused ranking using:
  - `RRF(d) = Σ 1 / (k + rank_i(d))`
  - recommended `k = 60`

### Rerank (Top N)
- N = 25–50
- Candidate text = `title + section_path + snippet(content)`

---

## Operational Considerations

### Environments
- Local:
  - Docker Compose runs Typesense (`infra/docker-compose.yml`)
  - SvelteKit runs locally
- Deploy:
  - SvelteKit on Vercel
  - Typesense on Fly.io or Render
  - Ingest locally or via CI job

### Config
Use `.env` for:
- Typesense connection + API key
- OpenAI API key + embedding model
- Hosted reranker provider key
- Firecrawl API key + seed URL

---

## Design Principles
- Search-first, not chat-first
- Explainability built in
- Keep components replaceable:
  - reranker provider can change
  - search engine can later swap to OpenSearch/Elasticsearch
- Minimal scope for v1; production-style structure

---

## Non-Goals
- No chatbot UI
- No full RAG answer generation
- No migrations, audits, or “health check” deliverables
- No self-hosted reranker in v1