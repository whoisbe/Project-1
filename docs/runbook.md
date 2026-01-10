# Runbook — Copy/Paste Commandbook

Quick reference for running the system locally. All commands verified on macOS/zsh.

---

## Prerequisites

### Required
- **Node.js:** Version 20+ (inferred from `@types/node: ^20.0.0` in dependencies)
- **Docker:** For running Typesense locally
- **npm:** Package manager (each workspace has its own `package-lock.json`)

### Environment File
- **Location:** `.env` at project root
- **Required vars:** See `packages/config/src/index.ts` for full schema
- **Example:** Copy from `apps/web/src/lib/config-example.ts` (if exists) or create from schema

---

## Setup Steps

### 1. Install Dependencies

Run in each workspace:

```bash
cd packages/config
npm install

cd ../../ingest
npm install

cd ../apps/web
npm install
```

**Note:** No root-level `npm install` needed (no root package.json).

---

## Start Typesense

### Using Docker Compose

```bash
cd infra
docker compose up -d
```

**Verify health:**
```bash
curl http://localhost:8108/health
```

**Expected output:**
```json
{"ok":true}
```

**Check logs:**
```bash
docker compose logs -f typesense
```

**Stop Typesense:**
```bash
docker compose down
```

### Configuration
- **Port:** `8108` (host) → `8108` (container)
- **API key:** From `TYPESENSE_API_KEY` env var (defaults to `xyz` in docker-compose)
- **Data volume:** `typesense-data` (persisted between restarts)
- **Image:** `typesense/typesense:29.0`

---

## Run Web Dev Server

```bash
cd apps/web
npm run dev
```

**Server URL:** `http://localhost:5173` (default Vite port)

**Available endpoints:**
- UI: `http://localhost:5173`
- API: `http://localhost:5173/api/search`

**Stop server:** `Ctrl+C`

---

## Ingestion Pipeline

Run in sequence from `ingest/` directory.

### Step 1: Load Docs from Local Repo

```bash
cd ingest
npm run load-docs
# or
npx tsx source/run.ts
```

**Input:** Local repo at `DOCS_REPO_PATH` (from env)
**Output:** `ingest/out/pages.jsonl`

**Expected:** Console logs show page count and output path.

### Step 2: Transform Pages into Chunks

```bash
npx tsx transform/run.ts
```

**Input:** `ingest/out/pages.jsonl`
**Output:** `ingest/out/chunks.jsonl`

**Expected:** Console logs show pages processed, chunks generated, average chunks per page.

### Step 3: Generate Embeddings

```bash
npx tsx embed/run.ts
```

**Input:** `ingest/out/chunks.jsonl`
**Output:** `ingest/out/chunks_embedded.jsonl`

**Resume support:** Skips already-embedded chunks if output file exists.

**Expected:** Console logs show chunks processed, skipped (if resuming), embeddings generated.

**Optional:** Set `EMBED_BATCH_SIZE` env var (default: 100).

### Step 4: Reset Typesense Collection (if schema changed)

```bash
npx tsx typesense/reset-collection.ts
```

**Note:** Only needed after schema changes. Drops and recreates `docs_chunks` collection.

### Step 5: Index into Typesense

```bash
npx tsx index/run.ts
```

**Input:** `ingest/out/chunks_embedded.jsonl`
**Output:** Indexed documents in Typesense `docs_chunks` collection

**Options:**
- `--batch-size=100` (default: 100)
- `--input-file=path/to/chunks_embedded.jsonl` (default: `ingest/out/chunks_embedded.jsonl`)
- `--debug` (logs first document payload)

**Expected:** Console logs show total indexed, failed, skipped invalid, duration, indexing rate.

### Complete Pipeline (All Steps)

```bash
cd ingest
npm run load-docs
npx tsx transform/run.ts
npx tsx embed/run.ts
npx tsx typesense/reset-collection.ts
npx tsx index/run.ts
```

---

## Smoke Test

### Run Smoke Test

```bash
node scripts/smoke-search.mjs
```

**Base URL:** Uses `BASE_URL` env var (default: `http://localhost:5173`)

**What it tests:**
- Multiple queries across all search modes (keyword, semantic, hybrid)
- Validates no duplicate URLs
- Checks mode consistency (correct ranking fields)
- Verifies rerank score presence in hybrid mode

**Expected:** Console output shows query results with timing and any issues detected.

**Common failures:**
- **Typesense not running:** `Connection failed` or `ECONNREFUSED`
- **Web server not running:** `fetch failed` or connection refused
- **Missing env vars:** Config validation error (lists missing vars)
- **OpenAI key invalid:** Embedding generation fails (check `OPENAI_API_KEY`)
- **Reranker errors:** Warnings about rerank failures (check `COHERE_API_KEY`)

### Interpreting Failures

**Typesense Connection Error:**
```
Error: Connection failed
```
**Fix:** Start Typesense with `docker compose up -d` in `infra/` directory.

**Config Validation Error:**
```
Configuration validation failed. Missing or invalid environment variables:
  - TYPESENSE_HOST: required
  - OPENAI_API_KEY: required
```
**Fix:** Set all required env vars in `.env` file at project root.

**OpenAI Embedding Error:**
```
OpenAI embedding service unavailable: Failed to generate embedding
```
**Fix:** Check `OPENAI_API_KEY` and `OPENAI_EMBED_MODEL` in `.env`.

**Reranker Error:**
```
warnings: ["rerank_failed: HTTP 429: Rate limit exceeded"]
```
**Fix:** Check `COHERE_API_KEY` and `COHERE_RERANK_MODEL`. This doesn't fail the request (graceful fallback).

---

## Troubleshooting

### Typesense Connection Issues

**Error:** `Typesense service unavailable: Connection failed`

**Check:**
```bash
curl http://localhost:8108/health
```

**If not responding:**
```bash
cd infra
docker compose ps
docker compose logs typesense
```

**Fix:** Restart Typesense:
```bash
docker compose down
docker compose up -d
```

### Environment Variable Errors

**Error:** `Configuration validation failed. Missing or invalid environment variables`

**Check:** `.env` file exists at project root with all required vars:
- `TYPESENSE_HOST` (e.g., `localhost`)
- `TYPESENSE_PORT` (e.g., `8108`)
- `TYPESENSE_PROTOCOL` (e.g., `http`)
- `TYPESENSE_API_KEY` (e.g., `xyz` or your key)
- `OPENAI_API_KEY` (your OpenAI API key)
- `OPENAI_EMBED_MODEL` (e.g., `text-embedding-3-small`)
- `RERANK_PROVIDER` (e.g., `cohere`)
- `COHERE_API_KEY` (your Cohere API key)
- `COHERE_RERANK_MODEL` (e.g., `rerank-english-v3.0`)
- `DOCS_REPO_PATH` (absolute path to local docs repo)
- `DOCS_BASE_URL` (e.g., `https://typesense.org/docs`)
- `DOCS_SOURCE_ID` (e.g., `typesense-docs`)

**Fix:** Add missing vars to `.env` file.

### Indexing Failures

**Error:** `Invalid document schema while upserting`

**Fix:** Reset collection schema:
```bash
cd ingest
npx tsx typesense/reset-collection.ts
```

**Error:** `No pages were loaded. Please check DOCS_REPO_PATH configuration.`

**Fix:** Verify `DOCS_REPO_PATH` points to valid local docs repo directory with Markdown files.

### Embedding Failures

**Error:** `OpenAI embedding service unavailable`

**Check:**
- `OPENAI_API_KEY` is set and valid
- `OPENAI_EMBED_MODEL` matches model name (e.g., `text-embedding-3-small`)
- Network connectivity to OpenAI API

**Fix:** Verify API key and model name in `.env` file.

### Reranker Failures

**Warning:** `rerank_failed: HTTP 429` or `rerank_failed: Cohere API rate limit exceeded`

**Behavior:** Search request succeeds but without reranking (graceful fallback).

**Fix:** Check `COHERE_API_KEY` and `COHERE_RERANK_MODEL`. Rate limits are handled with exponential backoff, but may still fail under heavy load.

---

## Verification Commands

### Search API Health

```bash
curl "http://localhost:5173/api/search?q=what%20is%20typesense&limit=5" | jq '.results | length'
```

**Expected:** Returns `5`.

### Version Filtering

```bash
curl "http://localhost:5173/api/search?q=vector%20search&version=latest&limit=5" | jq '.filters.docs_version'
```

**Expected:** Returns numeric version (e.g., `30000000`).

### Mode Consistency

```bash
curl "http://localhost:5173/api/search?q=vector%20search&mode=keyword&limit=3" | jq '.results[0] | {keyword_rank, vector_rank}'
```

**Expected:** `keyword_rank` is set, `vector_rank` is null.

### Rerank Status

```bash
curl "http://localhost:5173/api/search?q=vector%20search&rerank=false" | jq '.rerank_applied, .warnings'
```

**Expected:** `false` and `["rerank_skipped: disabled by query parameter"]`.
