# Search API Response Example

## Example Response with New Fields

```json
{
  "query": "authentication",
  "mode": "hybrid",
  "limit": 10,
  "filters": {},
  "timings_ms": {
    "keyword": 42,
    "vector": 1188,
    "rrf": 0,
    "total": 1189
  },
  "rerank_applied": false,
  "warnings": [
    "rerank_skipped: disabled by query parameter"
  ],
  "results": [
    {
      "id": "abc123",
      "title": "Authentication",
      "url": "https://typesense.org/docs/cloud-management-api/v1/authentication.html",
      "section_path": "Cloud Management API > Authentication",
      "snippet": "Authentication is required for...",
      "keyword_rank": 1,
      "vector_rank": null,
      "rrf_score": 0.01639344262295082
    },
    {
      "id": "def456",
      "title": "Authentication",
      "url": "https://typesense.org/docs/30.0/api/authentication.html",
      "section_path": "API Reference > Authentication",
      "snippet": "API authentication uses...",
      "keyword_rank": null,
      "vector_rank": 1,
      "rrf_score": 0.01639344262295082
    }
  ]
}
```

## Response Fields

### New Fields

- **`rerank_applied`** (boolean): Indicates whether reranking was successfully applied to the results
  - `true`: Reranking was applied and results include `rerank_score`
  - `false`: Reranking was not applied (skipped or failed)

- **`warnings`** (string[]): Array of warning messages about the search process
  - `"rerank_skipped: disabled by query parameter"` - Rerank was explicitly disabled via `rerank=false`
  - `"rerank_skipped: provider not configured or disabled"` - Reranker provider is not configured
  - `"rerank_failed: HTTP 429"` - Rerank API returned an error (rate limit, etc.)
  - `"rerank_failed: <error message>"` - Other rerank failures

## Diversification

Results are automatically diversified by URL:
- Before fusion: Keyword and vector results are diversified separately
- After reranking: Final results are diversified to ensure unique URLs
- Preserves order: First occurrence of each URL is kept

This ensures no duplicate URLs appear in the results, improving result diversity.

## Example Scenarios

### Rerank Applied Successfully
```json
{
  "rerank_applied": true,
  "warnings": [],
  "results": [
    {
      "rerank_score": 0.9997347,
      ...
    }
  ]
}
```

### Rerank Skipped (Disabled)
```json
{
  "rerank_applied": false,
  "warnings": ["rerank_skipped: disabled by query parameter"]
}
```

### Rerank Failed (Rate Limited)
```json
{
  "rerank_applied": false,
  "warnings": ["rerank_failed: Cohere API rate limit exceeded (429): ..."]
}
```

### Rerank Skipped (Not Configured)
```json
{
  "rerank_applied": false,
  "warnings": ["rerank_skipped: provider not configured or disabled"]
}
```

