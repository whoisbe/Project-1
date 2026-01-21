# AI-Powered Documentation Search (Hybrid Retrieval + Evaluation)

This project is a **production-style AI search system** for technical documentation.  
It demonstrates modern search fundamentals — **hybrid retrieval, reranking, explainability, and offline evaluation** — without hiding complexity behind a chatbot interface.

The goal is to show how high-quality search systems are **designed, measured, and iterated** in real-world environments.

---

## What This Project Does

- Ingests and indexes technical documentation end-to-end  
  *(load → chunk → embed → index)*
- Supports **three retrieval modes**:
  - **Keyword** (lexical search)
  - **Semantic** (vector similarity)
  - **Hybrid** (keyword + vector with Reciprocal Rank Fusion)
- Applies **two-stage ranking** with a hosted reranker
- Exposes **explainable ranking signals** (keyword rank, vector rank, fusion score, rerank score)
- Provides a modern **search-first UI** (no chat abstraction)
- Includes a **reproducible offline evaluation framework** using standard IR metrics

---

## What This Project Intentionally Does *Not* Do

- ❌ No chatbot or conversational RAG interface  
- ❌ No answer synthesis or hallucination-prone generation  
- ❌ No fine-tuning or training pipelines  
- ❌ No performance benchmarking or production hardening  

This is a **retrieval and ranking system**, not a chat demo.

---

## Architecture Overview
Offline (Ingestion)
───────────────────
Documentation Source
        ↓
Load → Normalize → Chunk (by headings)
        ↓
OpenAI Embeddings
        ↓
Typesense Index (keyword + vector)

Online (Query)
──────────────
User Query
   ↓
Keyword Search + Vector Search
   ↓
Reciprocal Rank Fusion (RRF)
   ↓
Hosted Reranker (Top-N)
   ↓
Ranked Results + Explainability Signals

---

## Key Design Decisions

- **Hybrid Retrieval by Default**  
  Combines lexical precision with semantic recall using Reciprocal Rank Fusion.

- **Two-Stage Ranking**  
  Fast retrieval followed by a higher-quality reranking step.

- **Search-First UX**  
  Users see ranked documents and relevance signals, not generated answers.

- **Evaluation-Driven Development**  
  Retrieval quality is validated using Recall@k and nDCG@k on hand-labeled queries.

- **Minimal, Composable Stack**  
  Each component can be swapped without redesigning the system.

---

## Evaluation

The project includes an offline evaluation pipeline:

- Hand-labeled ground truth queries
- Programmatic generation of evaluation runs
- Metrics:
  - **Recall@5**
  - **nDCG@5**

### Example Results (k = 5)

| Mode     | Recall@5 | nDCG@5 |
|----------|----------|--------|
| Hybrid   | ~0.23    | ~0.23  |
| Semantic | ~0.17    | ~0.16  |
| Keyword  | ~0.13    | ~0.13  |

Hybrid retrieval consistently outperforms keyword-only and semantic-only approaches, validating the system design.

---

## Repository Structure

apps/web/              # SvelteKit UI + search API
ingest/                # Ingestion pipeline (load, chunk, embed, index)
packages/config/       # Shared, typed configuration
docs/                  # Architecture, decisions, runbook, status
eval/                  # Ground truth, eval logs, metrics
scripts/               # Smoke tests and evaluation scripts

---

## Running Locally

See **`docs/runbook.md`** for complete, copy-pasteable instructions:

- Environment setup
- Starting Typesense locally
- Running ingestion
- Launching the web app
- Running smoke tests and evaluation

---

## Why This Project Exists

Most AI demos focus on *answers*.  
This project focuses on **retrieval quality**, **ranking correctness**, and **measurement** — the hard parts that determine whether AI systems are actually useful.

It’s designed as:
- A reference implementation for modern search systems
- A foundation for agentic routing and adaptive retrieval
- A portfolio-grade demonstration of applied AI + search engineering

---

## Tech Stack

- **Search Engine:** Typesense  
- **Embeddings:** OpenAI  
- **Reranking:** Cohere  
- **Frontend:** SvelteKit  
- **Runtime:** Node.js  
- **Infra:** Docker  
- **Evaluation:** Recall@k, nDCG@k, hand-labeled ground truth  

---

## Status

The system is fully functional with:
- End-to-end ingestion
- Search API
- UI
- Evaluation framework

Next planned phase: **Agentic query routing** (Phase 2C).

See **`docs/status.md`** for current progress.

---

## License

MIT
