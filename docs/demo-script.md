# Demo Script (2–3 Minutes) — AI Search MVP

## Goal
In under 3 minutes, demonstrate:
- keyword vs semantic vs hybrid search
- reranking impact
- filters/facets
- explainable relevance (“Why this result?”)
- that this is a real ingest → embed → index pipeline, not a toy

---

## Setup (before recording)
Have these ready:
- App running locally (or deployed)
- Typesense index already populated with Typesense docs
- A browser tab open to:
  - the app home page
  - Typesense docs (to click through URLs)
- Ensure “Why this result?” panel is enabled

Optional but recommended:
- A quick architecture diagram screenshot ready (from `docs/architecture.md`)

---

## 0:00–0:10 — One-liner + what you’re about to show
Say:
> "This is an AI-powered documentation search MVP. It loads the Typesense docs from a local repository, chunks by headings, generates OpenAI embeddings, indexes into Typesense, then does hybrid retrieval with RRF fusion and a hosted reranker."

---

## 0:10–0:50 — Query #1: keyword vs semantic vs hybrid
### Query
Type: **`auto embedding field`** (or similar docs-flavored query)

1) Run **Keyword mode**
- Point out exact-match behavior
- Show a relevant doc may be lower if wording differs

2) Run **Semantic mode**
- Point out concept-level matching

3) Run **Hybrid mode** (default)
- Say: “Hybrid combines both and tends to be more reliable across query styles.”

What to highlight:
- The top result relevance improves in Hybrid
- The results list feels “docs-native” (title + section + snippet)

---

## 0:50–1:15 — Apply a facet filter
Use Section filter (derived from heading path), e.g.:
- Filter by: **Vector Search** (or closest available section)

Say:
> “The corpus is chunked by headings, so we can facet by section_path and keep results scoped.”

---

## 1:15–1:45 — “Why this result?” explanation
Open the top result’s **Why this result?** panel.

Point out:
- keyword rank
- vector rank
- RRF fusion score
- rerank score
- snippet highlights

Say:
> “This is important because it makes relevance explainable and debuggable—no black box.”

---

## 1:45–2:15 — Query #2: show reranking impact
### Query
Type something slightly vague:
- **`typo tolerance instant search`**
or
- **`search-as-you-type latency`**

In Hybrid mode:
- mention: “We retrieve candidates fast, then rerank the top N.”

If your UI shows rerank score or a toggle:
- briefly show “before rerank” vs “after rerank” ordering (even a small difference is fine)

Say:
> “Two-stage retrieval is common in production: retrieve broadly, then rerank for precision.”

---

## 2:15–2:35 — Click-through to source docs
Open a result and click **Open in Docs**.

Say:
> “Each result is tied to the original source URL, and each chunk is a section of the documentation.”

---

## 2:35–3:00 — Close with architecture + next steps
Show the architecture diagram (quickly) and end with:

> “This project is intentionally search-first. The next step is layering a RAG answer experience on top of proven retrieval—without hiding relevance issues behind a chat UI.”

---

## Recommended Queries (pick 2–3)
- `auto embedding field`
- `vector search configuration`
- `typo tolerance instant search`
- `synonyms and relevance`
- `filtering facets`
- `collection schema fields`

---

## Recording Checklist
- Keep it under 3 minutes
- Keep narration crisp: problem → approach → proof
- Don’t over-explain: show the toggles, the filters, the “why”
- End with: “hybrid + rerank + explainability” as your punchline