# Search API Endpoint

## Endpoint
`GET /api/search`

## Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `q` | string | Yes | - | Search query (cannot be empty) |
| `mode` | string | No | `hybrid` | Search mode: `keyword`, `semantic`, or `hybrid` |
| `limit` | number | No | `10` | Maximum number of results (max: 50) |
| `section_path` | string | No | - | Filter results by section path |
| `source` | string | No | - | Filter results by source |
| `version` | string | No | `latest` | Filter by docs version: `latest` (default), `all`, or version string (e.g., `30.0`, `0.25.1`) |
| `rerank` | boolean | No | `true` | Enable reranking (only applies to hybrid mode) |

## Response Format

```json
{
  "query": "string",
  "mode": "keyword|semantic|hybrid",
  "limit": 10,
  "filters": {
    "section_path": "string (optional)",
    "source": "string (optional)",
    "docs_version": "number | null (optional, present when version filter is applied)"
  },
  "timings_ms": {
    "keyword": 123,
    "vector": 456,
    "rrf": 5,
    "rerank": 789,
    "total": 1373
  },
  "results": [
    {
      "id": "string",
      "title": "string",
      "url": "string",
      "section_path": "string",
      "snippet": "string",
      "keyword_rank": 1,
      "vector_rank": 2,
      "vector_score": 0.95,
      "rrf_score": 0.0328,
      "rerank_score": 0.89
    }
  ]
}
```

## cURL Examples

### Keyword Search
```bash
curl "http://localhost:5173/api/search?q=authentication&mode=keyword&limit=10"
```

### Semantic (Vector) Search
```bash
curl "http://localhost:5173/api/search?q=how%20to%20authenticate%20users&mode=semantic&limit=10"
```

### Hybrid Search (Default)
```bash
curl "http://localhost:5173/api/search?q=authentication&mode=hybrid&limit=10"
```

### Hybrid Search with Filters
```bash
curl "http://localhost:5173/api/search?q=authentication&mode=hybrid&limit=10&section_path=/api&source=typesense-docs"
```

### Hybrid Search without Reranking
```bash
curl "http://localhost:5173/api/search?q=authentication&mode=hybrid&limit=10&rerank=false"
```

### Hybrid Search with Custom Limit
```bash
curl "http://localhost:5173/api/search?q=authentication&mode=hybrid&limit=25"
```

### Search with Version Filtering

#### Latest Version (Default)
```bash
curl "http://localhost:5173/api/search?q=vector%20search"
# or explicitly
curl "http://localhost:5173/api/search?q=vector%20search&version=latest"
```

#### All Versions
```bash
curl "http://localhost:5173/api/search?q=vector%20search&version=all"
```

#### Specific Version
```bash
curl "http://localhost:5173/api/search?q=vector%20search&version=30.0"
curl "http://localhost:5173/api/search?q=vector%20search&version=0.25.1"
```

## Error Responses

### 400 Bad Request
```json
{
  "message": "Query parameter \"q\" is required and cannot be empty"
}
```

### 502 Bad Gateway
```json
{
  "message": "Typesense service unavailable: Connection failed..."
}
```

or

```json
{
  "message": "OpenAI embedding service unavailable: Failed to generate embedding"
}
```

### 500 Internal Server Error
```json
{
  "message": "Internal server error: ..."
}
```

## Notes

- All API keys are handled server-side only (no browser exposure)
- Reranking failures are logged but don't fail the request (falls back to non-reranked results)
- Timings are measured in milliseconds
- Results include explainability fields (`keyword_rank`, `vector_rank`, `rrf_score`, `rerank_score`) when available

