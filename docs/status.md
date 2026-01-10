# Project Status — AI Search MVP

## Project Overview

Production-style AI-powered documentation search system demonstrating hybrid search (keyword + vector), two-stage retrieval (retrieve → fuse → rerank), and explainable relevance signals.

**What it does:**
- Ingests Typesense documentation from local repo filesystem
- Indexes chunks with OpenAI embeddings into Typesense
- Provides search API with keyword, semantic, and hybrid modes
- Uses Reciprocal Rank Fusion (RRF) for hybrid search
- Applies hosted reranker (Cohere) to top-N results
- Diversifies results by URL to eliminate duplicates
- Filters by documentation version (latest/unversioned by default)
- Exposes all ranking signals for explainability
- Provides SvelteKit UI for search queries

**What it doesn't:**
- No chatbot-style conversational UI
- No full RAG answer generation (search-first system)
- No self-hosted reranker
- No multi-tenant auth or billing
- No Firecrawl (uses local repo only)

---

## Current State Checklist

### ✅ Ingestion Pipeline (`ingest/`)
- [x] Local docs loader (`source/run.ts`) - reads Markdown from local repo
- [x] Page normalization - extracts title, constructs URL, handles index.md/README.md
- [x] Chunking (`transform/run.ts`) - splits by headings, 300–800 tokens, preserves code blocks
- [x] Version parsing - extracts `docs_version` from URLs (numeric score format)
- [x] Embedding generation (`embed/run.ts`) - OpenAI text-embedding-3-small, batch processing, resume support
- [x] Typesense indexing (`index/run.ts`) - bulk upsert, schema validation, progress tracking
- [x] Output paths - `ingest/out/pages.jsonl`, `chunks.jsonl`, `chunks_embedded.jsonl`

### ✅ Search Backend (`apps/web/src/lib/search/`)
- [x] Keyword search (`keywordSearch.ts`) - Typesense keyword search with highlighting
- [x] Vector search (`vectorSearch.ts`) - OpenAI query embeddings + Typesense vector search
- [x] RRF fusion (`rrf.ts`) - Reciprocal Rank Fusion with configurable `k=60`
- [x] Reranking (`rerank/cohere.ts`) - Cohere reranker with rate limiting and fallback
- [x] URL diversification (`diversify.ts`) - removes duplicate URLs, preserves order
- [x] Version filtering - latest/unversioned policy, exact version queries

### ✅ API Endpoint (`apps/web/src/routes/api/search/`)
- [x] `GET /api/search` - supports keyword, semantic, hybrid modes
- [x] Query parameters - `q`, `mode`, `limit`, `section_path`, `source`, `version`, `rerank`
- [x] Version policy - `latest` (default), `all`, or specific version string
- [x] Observability - `timings_ms`, `rerank_applied`, `warnings` array
- [x] Error handling - 400 (validation), 502 (service unavailability), graceful rerank fallback
- [x] Response format - includes all ranking signals (`keyword_rank`, `vector_rank`, `rrf_score`, `rerank_score`)

### ✅ UI (`apps/web/src/routes/`)
- [x] Search interface (`+page.svelte`) - query input, mode selector, limit selector, rerank toggle
- [x] Results display - card layout, clickable titles, section paths, highlighted snippets
- [x] "Why this result?" panels - collapsible explainability metadata
- [x] URL normalization - adds `.html` suffix for clickable links (no `.html` in indexed URLs)
- [x] URL synchronization - query params reflect state, auto-search on page load

### ✅ Configuration (`packages/config/`)
- [x] Environment variable validation - Zod schema with clear error messages
- [x] Required env vars - Typesense, OpenAI, Cohere, Docs repo path
- [x] Type-safe config - exported `Config` type, validated at module load

### ✅ Testing (`scripts/`)
- [x] Smoke test (`smoke-search.mjs`) - tests multiple queries across all modes
- [x] Validation checks - duplicate URLs, mode consistency, rerank score presence

---

## Repo Map

### Key Folders

**`apps/web/`** - SvelteKit application
- `src/routes/api/search/+server.ts` - Search API endpoint
- `src/lib/search/` - Search backend modules (keyword, vector, rrf, rerank, diversify)
- `src/lib/url/normalizeDocUrl.ts` - URL normalization (adds .html for clicks)
- `src/routes/+page.svelte` - Search UI
- `package.json` - npm scripts: `dev`, `build`, `test`

**`ingest/`** - Ingestion pipeline
- `source/run.ts` - Load docs from local repo → `out/pages.jsonl`
- `transform/run.ts` - Chunk pages → `out/chunks.jsonl`
- `embed/run.ts` - Generate embeddings → `out/chunks_embedded.jsonl`
- `index/run.ts` - Index into Typesense
- `typesense/` - Schema, client, reset collection script

**`packages/config/`** - Shared configuration
- `src/index.ts` - Environment variable validation and typed config export

**`infra/`** - Infrastructure
- `docker-compose.yml` - Typesense service (port 8108, API key from env)

**`scripts/`** - Utility scripts
- `smoke-search.mjs` - Smoke test for search API (tests multiple queries)

**`docs/`** - Documentation
- `architecture.md` - High-level system architecture
- `decisions.md` - Technical decisions and rationale
- `version-filtering.md` - Version filtering implementation details
- `REINDEX_GUIDE.md` - Instructions for reindexing

### Most Important Files

1. **`apps/web/src/routes/api/search/+server.ts`** - Main search API endpoint
2. **`ingest/index/run.ts`** - Indexing entry point
3. **`packages/config/src/index.ts`** - Environment variable schema
4. **`infra/docker-compose.yml`** - Typesense service definition
5. **`ingest/typesense/schema.ts`** - Typesense collection schema
6. **`apps/web/src/lib/search/rrf.ts`** - RRF fusion implementation
7. **`scripts/smoke-search.mjs`** - Verification test script

---

## How to Verify Quickly

### 1. Search API Health Check

```bash
curl "http://localhost:5173/api/search?q=what%20is%20typesense&limit=5" | jq '.results | length'
```

**Expected:** Returns 5 results with `query: "what is typesense"`, `mode: "hybrid"`, `rerank_applied: true`

### 2. Version Filtering Check

```bash
curl "http://localhost:5173/api/search?q=vector%20search&version=latest&limit=5" | jq '.filters.docs_version, .resolved_version.mode'
```

**Expected:** Returns `30000000` (or latest numeric version) and `"latest"` mode

### 3. Rerank Fallback Check

```bash
curl "http://localhost:5173/api/search?q=vector%20search&rerank=false" | jq '.rerank_applied, .warnings'
```

**Expected:** Returns `false` and `["rerank_skipped: disabled by query parameter"]`

### 4. Mode Consistency Check

```bash
curl "http://localhost:5173/api/search?q=vector%20search&mode=keyword&limit=3" | jq '.results[] | {title, keyword_rank, vector_rank}'
```

**Expected:** All results have `keyword_rank` set, `vector_rank` is null/undefined

---

## Known Gotchas / Traps

### Environment Variables
- **Location:** `.env` file at project root (3 levels up from `packages/config/src/`)
- **Validation:** Fails fast at module load with clear error messages listing missing vars
- **Required vars:** `TYPESENSE_HOST`, `TYPESENSE_PORT`, `TYPESENSE_PROTOCOL`, `TYPESENSE_API_KEY`, `OPENAI_API_KEY`, `OPENAI_EMBED_MODEL`, `RERANK_PROVIDER`, `COHERE_API_KEY`, `COHERE_RERANK_MODEL`, `DOCS_REPO_PATH`, `DOCS_BASE_URL`, `DOCS_SOURCE_ID`

### Typesense Ports
- **Docker:** Exposes port `8108` (mapped from container port 8108)
- **Default API key:** `xyz` (from docker-compose, override via `TYPESENSE_API_KEY` env var)
- **Health check:** `curl http://localhost:8108/health`

### Reranker Failures
- **Behavior:** Rerank failures are logged but don't fail the request
- **Fallback:** Returns fused results without `rerank_score` if rerank fails
- **Warning:** `warnings` array includes `"rerank_failed: HTTP 429"` or similar
- **Common causes:** Cohere API rate limits, network timeouts, invalid API key

### Docs Version Field
- **Format:** Numeric score `major*1_000_000 + minor*1_000 + patch`
- **Unversioned:** `docs_version: null` or `0` (treated as unversioned in "latest" filter)
- **Latest policy:** "latest" filter shows latest version OR unversioned (`docs_version:=<latest> || docs_version:=0`)
- **Cache:** Latest version cached in memory per server start (restart to refresh)

### URL Normalization
- **Indexed URLs:** No `.html` suffix (canonical format: `https://typesense.org/docs/guide/ranking-and-relevance`)
- **Clickable URLs:** UI adds `.html` suffix via `normalizeDocUrl()` function
- **Directory URLs:** URLs ending with `/` are left as-is

### Package Manager
- **Setup:** npm (monorepo without root package.json, each workspace has own package-lock.json)
- **Installation:** Must run `npm install` in each workspace: `apps/web/`, `ingest/`, `packages/config/`

### Ingestion Pipeline Order
- **Must run in sequence:** `source/run.ts` → `transform/run.ts` → `embed/run.ts` → `index/run.ts`
- **Resume support:** Embed stage can resume (skips already-embedded chunks)
- **Schema changes:** Must run `typesense/reset-collection.ts` before indexing after schema changes

---

## What's Next

### Phase 2A: Evaluation Metrics
**Acceptance Criteria:**
- [ ] Create `eval/queries.jsonl` with labeled query-doc pairs
- [ ] Implement Recall@10 and MRR@10 calculation
- [ ] CLI script to compute metrics over eval set
- [ ] Document baseline performance numbers

**Likely Files:**
- `eval/queries.jsonl` (new)
- `scripts/compute-metrics.ts` (new)
- `docs/evaluation.md` (new)

### Phase 2B: Performance Optimization
**Acceptance Criteria:**
- [ ] Profile search latency (keyword, vector, rerank stages)
- [ ] Optimize embedding batch size for query-time latency
- [ ] Add result caching (query → results cache)
- [ ] Benchmark before/after improvements

**Likely Files:**
- `apps/web/src/lib/search/cache.ts` (new)
- `apps/web/src/routes/api/search/+server.ts` (modify)
- `docs/performance.md` (new)

### Phase 2C: UI Enhancements
**Acceptance Criteria:**
- [ ] Add facet filters UI (section_path, source dropdowns)
- [ ] Add version selector (latest/all/specific version)
- [ ] Improve result cards (better highlighting, metadata badges)
- [ ] Add loading states and error boundaries

**Likely Files:**
- `apps/web/src/routes/+page.svelte` (modify)
- `apps/web/src/lib/components/` (new, if componentizing)

---

## Statistics

- **551** documentation pages indexed
- **4,830+** chunks generated and embedded
- **3** search modes (keyword, semantic, hybrid)
- **0** duplicate URLs in results (verified via smoke tests)
- **1536** embedding dimensions (OpenAI text-embedding-3-small)
- **60** RRF `k` parameter (for reciprocal rank fusion)
