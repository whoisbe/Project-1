# Key Technical Decisions — AI Search MVP

This document records **intentional design decisions** for the AI Search MVP.
It exists to:
- Keep scope tight
- Prevent over-engineering
- Provide context for AI-assisted development (Cursor, Copilot)
- Explain *why* certain choices were made

---

## Why Typesense (First)

**Decision:** Use Typesense as the initial search engine.

**Rationale:**
- Fast to stand up locally and in cloud environments
- Excellent developer experience
- Native support for:
  - keyword search
  - vector search
  - facets
- Ideal for rapid MVPs and portfolio demos

**Trade-off:**
- Fewer advanced pipelines than OpenSearch/Elasticsearch

**Future Option:**
- Architecture is engine-agnostic; OpenSearch or Elasticsearch can be swapped in later.

---

## Why Firecrawl for Data Acquisition

**Decision:** Use Firecrawl Crawl API for ingesting documentation.

**Rationale:**
- Purpose-built for LLM-friendly crawling
- Produces clean markdown
- Handles site traversal and content extraction
- Reduces time spent on scraping infrastructure

**Trade-off:**
- External dependency
- Requires API key

**Future Option:**
- Replace with custom crawler or GitHub-based ingestion if needed.

---

## Why Chunk by Headings (Not Fixed Windows)

**Decision:** Chunk documents by markdown heading hierarchy.

**Rationale:**
- Preserves semantic coherence
- Aligns chunks with how docs are written
- Improves embedding quality and relevance
- Makes section-level faceting possible

**Trade-off:**
- Slightly more complex than token-window chunking

---

## Why OpenAI Embeddings

**Decision:** Use OpenAI Embeddings (`text-embedding-3-small`).

**Rationale:**
- High-quality semantic representations
- Stable API and documentation
- Good cost-to-quality ratio
- Widely understood by engineers and clients

**Trade-off:**
- External dependency
- Cost per request

**Future Option:**
- Swap to local or open-source embeddings if required.

---

## Why Hybrid Search + RRF

**Decision:** Default search mode is hybrid (keyword + vector) with RRF fusion.

**Rationale:**
- Keyword search excels at precision
- Vector search excels at recall
- RRF:
  - is simple
  - is robust
  - requires no score normalization
  - is easy to explain in demos

**Trade-off:**
- Two searches per query

---

## Why Two-Stage Retrieval (Reranking)

**Decision:** Apply hosted reranking to top N results.

**Rationale:**
- Significantly improves relevance
- Mirrors production search architectures
- Keeps initial retrieval fast
- Demonstrates modern IR best practices

**Trade-off:**
- Extra latency
- External API dependency

**Scope Control:**
- Rerank only top 25–50 results

---

## Why Hosted Reranker (v1)

**Decision:** Use a hosted rerank API instead of a local cross-encoder.

**Rationale:**
- Faster to implement
- Fewer moving parts
- Production-grade quality out of the box
- Keeps v1 focused on retrieval design, not ML ops

**Trade-off:**
- Vendor dependency
- API cost

**Future Option:**
- Replace with self-hosted cross-encoder service.

---

## Why SvelteKit for the UI

**Decision:** Use SvelteKit for frontend and API routes.

**Rationale:**
- Excellent developer experience
- Fast iteration
- Clean server + client model
- Works well with search-as-you-type patterns

---

## Why No Chat UI

**Decision:** Exclude chatbot-style conversational UI.

**Rationale:**
- Chat often hides weak retrieval
- Search quality should stand on its own
- Keeps scope tight and credible
- Aligns with enterprise search use cases

**Future Option:**
- Layer chat/RAG on top of proven retrieval later.

---

## Why Explainable Results

**Decision:** Expose ranking signals in the UI.

**Rationale:**
- Builds trust
- Helps debug relevance
- Demonstrates deep understanding of search systems
- Differentiates this project from shallow demos

---

## Explicit Non-Goals

This project intentionally does **not** include:
- Training or instructional features
- Data migrations
- Performance audits or health checks
- Full RAG answer generation
- Multi-tenant auth or billing
- Self-hosted ML infrastructure

---

## Guiding Principle

> **Demonstrate modern search fundamentals clearly, simply, and honestly — without hiding complexity behind a chat interface.**

This project is meant to show *how you think*, not just what you can wire together.