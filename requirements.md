# Project 1 — AI Search MVP (Typesense Docs)

## Purpose
Build a production-style AI-powered documentation search system demonstrating:
- Hybrid search (keyword + vector)
- Two-stage retrieval (retrieve → rerank)
- Real-world ingestion pipeline
- Modern SvelteKit UI
- Clear, explainable relevance signals

This project serves as a portfolio-grade reference implementation for AI-driven search systems.

---

## Core User Story
As a user, I want to search developer documentation using natural language and keywords, filter results by section, and understand *why* results were returned.

---

## Non-Goals
- No chatbot-style conversational UI
- No full RAG answer generation (search-first system)
- No self-hosted reranker in v1
- No multi-tenant auth or billing

---

## Functional Requirements

### Search Modes
- Keyword-only search
- Semantic (vector) search
- Hybrid search (default)
- Hybrid uses Reciprocal Rank Fusion (RRF)

### Retrieval Pipeline
1. Accept user query
2. Generate query embedding (OpenAI)
3. Run keyword search in Typesense
4. Run vector search in Typesense
5. Fuse results using RRF
6. Rerank top-N results using hosted rerank API
7. Return ranked results with explanation metadata

### Result Explanation ("Why this result?")
Each result must expose:
- Keyword rank
- Vector rank
- RRF score
- Rerank score
- Highlighted text snippet

### Filtering
- Filter by `section_path` (facet)
- Filter by `source` (default: typesense-docs)

---

## Dataset Requirements
- Source: Typesense documentation site
- Acquisition via Firecrawl crawl API
- Content format: Markdown
- Each page must be chunked by heading hierarchy

---

## Chunking Rules
- Split by markdown headings (#, ##, ###)
- Target chunk size: 300–800 tokens
- Preserve code blocks
- Generate `section_path` from heading hierarchy

---

## Embeddings
- Provider: OpenAI
- Model: text-embedding-3-small
- Generated during ingestion
- Stored as vectors in Typesense

---

## Search Engine
- Engine: Typesense
- Collection: docs_chunks
- Vector search enabled
- Facets enabled on section_path and source

---

## Reranking
- Provider: Hosted Rerank API (Cohere-style)
- Applied to top 25–50 fused results
- Input: query + compact candidate text
- Output: reordered results with relevance score

---

## Frontend (SvelteKit)
- Search page with query input
- Mode selector (Keyword / Semantic / Hybrid)
- Facet filters
- Results list
- Detail page per result
- Expandable “Why this result?” panel

---

## API Endpoints
- GET /api/search
- GET /api/doc/:id

---

## Evaluation (Lightweight)
- Maintain eval/queries.jsonl
- Metrics: Recall@10, MRR@10
- CLI script to compute metrics

---

## Deployment (Target)
- SvelteKit: Vercel
- Typesense: Fly.io or Render
- Ingestion: local or CI-triggered

---

## Success Criteria
- Hybrid search outperforms keyword-only for vague queries
- Reranking visibly improves top results
- Demo can be explained in <3 minutes

