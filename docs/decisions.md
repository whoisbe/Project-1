# Key Technical Decisions (UPDATED)

## Why Typesense First
- Fast setup
- Excellent DX
- Native vector search
- Search-as-you-type support

## Why Local Docs Repo Instead of Firecrawl (UPDATED)
- Deterministic and repeatable ingestion
- No rate limits or credit constraints
- Faster iteration while tuning chunking/embedding/ranking
- Cleaner “rebuild index” workflow (CI-friendly)

## Why Hosted Reranker
- Faster to implement
- Production-grade relevance
- Keeps v1 focused on retrieval design

## Why RRF for Hybrid Search
- Simple and robust
- No score normalization needed
- Easy to explain and justify

## Why No Chat UI
- Demonstrates strong retrieval fundamentals
- Chat can be layered later
- Keeps scope tight and credible