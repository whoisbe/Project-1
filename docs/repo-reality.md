# Repo Reality — Factual Context for Antigravity

Strictly factual snapshot of the codebase structure, scripts, commands, and configuration.

---

## File Tree

### Top Level
```
Project 1/
├── apps/web/                    # SvelteKit application
├── docs/                        # Documentation
├── infra/                       # Infrastructure (docker-compose.yml)
├── ingest/                      # Ingestion pipeline
├── packages/config/             # Shared configuration package
├── scripts/                     # Utility scripts
├── utils/                       # Python utilities (legacy?)
├── .gitignore
├── package-lock.json            # Root lockfile (npm)
└── requirements.md              # Project requirements
```

### Key Directories

**`apps/web/`**
```
apps/web/
├── package.json                 # npm scripts: dev, build, test
├── package-lock.json
├── src/
│   ├── routes/
│   │   ├── +page.svelte        # Search UI
│   │   ├── +layout.svelte      # Layout wrapper
│   │   └── api/search/
│   │       ├── +server.ts      # Search API endpoint
│   │       ├── README.md
│   │       └── RESPONSE_EXAMPLE.md
│   └── lib/
│       ├── search/             # Search backend modules
│       │   ├── keywordSearch.ts
│       │   ├── vectorSearch.ts
│       │   ├── rrf.ts
│       │   ├── diversify.ts
│       │   └── rerank/
│       │       ├── cohere.ts
│       │       ├── index.ts
│       │       └── types.ts
│       └── url/
│           └── normalizeDocUrl.ts  # Adds .html suffix for clicks
├── svelte.config.js
├── vite.config.js
└── vitest.config.ts
```

**`ingest/`**
```
ingest/
├── package.json                 # npm scripts: load-docs, typecheck
├── package-lock.json
├── source/
│   ├── run.ts                  # Entry: load docs → pages.jsonl
│   ├── localDocs.ts            # Local repo loader
│   └── README.md
├── transform/
│   ├── run.ts                  # Entry: chunk pages → chunks.jsonl
│   └── chunk.ts                # Chunking logic
├── embed/
│   ├── run.ts                  # Entry: embed chunks → chunks_embedded.jsonl
│   └── openai.ts               # OpenAI embedding client
├── index/
│   ├── run.ts                  # Entry: index into Typesense
│   └── typesense.ts            # Indexing logic
├── typesense/
│   ├── schema.ts               # Collection schema
│   ├── client.ts               # Typesense client
│   └── reset-collection.ts     # Drop/recreate collection script
├── out/                        # Pipeline outputs
│   ├── pages.jsonl
│   ├── chunks.jsonl
│   └── chunks_embedded.jsonl
└── REINDEX_GUIDE.md
```

**`packages/config/`**
```
packages/config/
├── package.json
├── package-lock.json
├── src/
│   └── index.ts                # Env var validation + typed config export
└── tsconfig.json
```

**`infra/`**
```
infra/
└── docker-compose.yml          # Typesense service definition
```

**`scripts/`**
```
scripts/
├── smoke-search.mjs            # Smoke test for search API
└── count-by-version.ts         # Version counting utility
```

---

## Detected Scripts and Commands

### Package Manager
- **Type:** npm (detected via `package-lock.json` files)
- **Workspace setup:** No root `package.json` (monorepo-style, but no workspace config)
- **Installation:** Must run `npm install` in each workspace independently

### npm Scripts

**`apps/web/package.json`**
- `npm run dev` → `vite dev` (start dev server on port 5173)
- `npm run build` → `vite build`
- `npm run preview` → `vite preview`
- `npm test` → `vitest`
- `npm run check` → `svelte-kit sync && svelte-check --tsconfig ./tsconfig.json`

**`ingest/package.json`**
- `npm run load-docs` → `tsx source/run.ts`
- `npm run typecheck` → `tsc --noEmit`

**`packages/config/package.json`**
- `npm run typecheck` → `tsc --noEmit`

### Direct Commands (tsx)

**Ingestion Pipeline:**
- `npx tsx source/run.ts` - Load docs from local repo
- `npx tsx transform/run.ts` - Chunk pages
- `npx tsx embed/run.ts` - Generate embeddings
- `npx tsx index/run.ts` - Index into Typesense
- `npx tsx typesense/reset-collection.ts` - Reset collection schema

**Options for `index/run.ts`:**
- `--batch-size=100` (default: 100)
- `--input-file=path/to/chunks_embedded.jsonl`
- `--debug` (logs first document payload)

### Node Scripts

**`scripts/smoke-search.mjs`**
- `node scripts/smoke-search.mjs`
- Uses `BASE_URL` env var (default: `http://localhost:5173`)
- Tests multiple queries across all search modes

### Docker Compose Commands

**`infra/docker-compose.yml`**
- `docker compose up -d` - Start Typesense in background
- `docker compose down` - Stop Typesense
- `docker compose logs -f typesense` - View logs
- `docker compose ps` - Check status

---

## Environment Variables

**Schema Location:** `packages/config/src/index.ts`

**Validation:** Zod schema, validated at module load (fails fast with clear errors)

**Required Variables:**

| Variable | Type | Description | Example |
|----------|------|-------------|---------|
| `TYPESENSE_HOST` | string | Typesense hostname | `localhost` |
| `TYPESENSE_PORT` | string (numeric) | Typesense port | `8108` |
| `TYPESENSE_PROTOCOL` | `http` \| `https` | Typesense protocol | `http` |
| `TYPESENSE_API_KEY` | string | Typesense API key | `xyz` (or your key) |
| `OPENAI_API_KEY` | string | OpenAI API key | (your key) |
| `OPENAI_EMBED_MODEL` | string | OpenAI embedding model | `text-embedding-3-small` |
| `RERANK_PROVIDER` | string | Reranker provider | `cohere` |
| `COHERE_API_KEY` | string | Cohere API key | (your key) |
| `COHERE_RERANK_MODEL` | string | Cohere rerank model | `rerank-english-v3.0` |
| `DOCS_REPO_PATH` | string | Absolute path to local docs repo | `/path/to/typesense-docs` |
| `DOCS_BASE_URL` | string (URL) | Base URL for docs | `https://typesense.org/docs` |
| `DOCS_SOURCE_ID` | string | Source identifier | `typesense-docs` |

**Optional Variables:**

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `EMBED_BATCH_SIZE` | number | `100` | Batch size for embedding generation |
| `BASE_URL` | string | `http://localhost:5173` | Base URL for smoke test |

**Environment File:**
- **Location:** `.env` at project root
- **Loading:** `packages/config/src/index.ts` loads from project root (3 levels up from config package)

---

## Ports and Hosts

### Local Services

| Service | Host | Port | Protocol | Notes |
|---------|------|------|----------|-------|
| **Typesense** | `localhost` | `8108` | `http` | Docker container (via docker-compose) |
| **SvelteKit Dev Server** | `localhost` | `5173` | `http` | Default Vite port |

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `http://localhost:5173` | GET | Search UI (SvelteKit page) |
| `http://localhost:5173/api/search` | GET | Search API endpoint |
| `http://localhost:8108/health` | GET | Typesense health check |

### Search API Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `q` | string | Yes | - | Search query |
| `mode` | `keyword` \| `semantic` \| `hybrid` | No | `hybrid` | Search mode |
| `limit` | number | No | `10` | Max results (max: 50) |
| `section_path` | string | No | - | Filter by section path |
| `source` | string | No | - | Filter by source |
| `version` | `latest` \| `all` \| `<number>` | No | `latest` | Filter by docs version |
| `rerank` | `true` \| `false` | No | `true` | Enable reranking |

---

## Output Paths

### Ingestion Pipeline Outputs

| Stage | Input | Output | Location |
|-------|-------|--------|----------|
| **Load** | Local repo | `pages.jsonl` | `ingest/out/pages.jsonl` |
| **Transform** | `pages.jsonl` | `chunks.jsonl` | `ingest/out/chunks.jsonl` |
| **Embed** | `chunks.jsonl` | `chunks_embedded.jsonl` | `ingest/out/chunks_embedded.jsonl` |
| **Index** | `chunks_embedded.jsonl` | Typesense documents | Typesense `docs_chunks` collection |

---

## Key Implementation Details

### Version Format
- **Storage:** `docs_version` as `int32` (numeric score)
- **Conversion:** `major * 1_000_000 + minor * 1_000 + patch`
- **Examples:** `30.0` → `30_000_000`, `0.25.1` → `25_001`, unversioned → `null` or `0`
- **Latest policy:** "latest" filter shows `docs_version:=<latest> || docs_version:=0` (includes unversioned)

### URL Normalization
- **Indexed URLs:** No `.html` suffix (canonical: `https://typesense.org/docs/guide/ranking-and-relevance`)
- **Clickable URLs:** UI adds `.html` via `normalizeDocUrl()` function
- **Logic:** If URL doesn't end with `/` or `.html`, append `.html`

### Search Pipeline
1. **Keyword search** → Typesense keyword search with highlighting
2. **Vector search** → OpenAI query embedding + Typesense vector search
3. **RRF fusion** → Reciprocal Rank Fusion (k=60)
4. **Diversification** → Remove duplicate URLs (before fusion + after rerank)
5. **Reranking** → Cohere reranker on top-N (max 50), with fallback if fails
6. **Response** → Include all ranking signals and timings

### Error Handling
- **400:** Invalid query parameters (validation errors)
- **502:** Service unavailability (Typesense connection failed, OpenAI embedding failed)
- **500:** Internal server errors
- **Rerank failures:** Logged in `warnings` array, request succeeds without rerank
