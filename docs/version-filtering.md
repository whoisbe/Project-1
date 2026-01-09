# Version Filtering Implementation

## Overview

The search API now supports filtering by documentation version to implement "prefer latest docs version" behavior. The `docs_version` field is stored as a numeric score derived from semantic version strings.

## Version Format

Versions are parsed from URLs matching the pattern: `https://typesense.org/docs/<version>/...`

- **Versioned URLs**: `https://typesense.org/docs/30.0/...` → `docs_version: 30_000_000`
- **Versioned URLs**: `https://typesense.org/docs/0.25.1/...` → `docs_version: 25_001`
- **Unversioned URLs**: `https://typesense.org/docs/...` → `docs_version: null`

The numeric score is calculated as: `major * 1_000_000 + minor * 1_000 + patch`

## API Usage

### Query Parameter: `version`

- **`latest`** (default): Show only the latest version
- **`all`**: Show all versions (no version filter)
- **`<number>`**: Show specific version (e.g., `30.0`, `0.25.1`)

## Example API Calls

### 1. Default (Latest Version)

```bash
curl "http://localhost:5173/api/search?q=vector%20search"
```

This defaults to `version=latest` and will:
- Determine the latest version present in the index
- Filter results to only show that version
- Cache the latest version in memory for subsequent requests

**Response includes:**
```json
{
  "query": "vector search",
  "mode": "hybrid",
  "filters": {
    "docs_version": 30000000
  },
  "results": [...]
}
```

### 2. All Versions

```bash
curl "http://localhost:5173/api/search?q=vector%20search&version=all"
```

Shows results from all versions (no version filtering).

**Response includes:**
```json
{
  "query": "vector search",
  "mode": "hybrid",
  "filters": {},
  "results": [...]
}
```

### 3. Specific Version

```bash
curl "http://localhost:5173/api/search?q=vector%20search&version=0.25.1"
```

Shows only results from version `0.25.1` (converted to numeric score `25_001`).

**Response includes:**
```json
{
  "query": "vector search",
  "mode": "hybrid",
  "filters": {
    "docs_version": 25001
  },
  "results": [...]
}
```

### 4. Combined with Other Filters

```bash
curl "http://localhost:5173/api/search?q=vector%20search&version=latest&section_path=API%20Reference&source=typesense-docs"
```

Combines version filtering with section path and source filters.

## Implementation Details

### Files Modified

1. **`ingest/transform/chunk.ts`**
   - Added `parseDocsVersion()` function
   - Added `docs_version` field to `ChunkRecord` type
   - Parses version from URL during chunking

2. **`ingest/typesense/schema.ts`**
   - Added `docs_version` field (int32, optional, facet-enabled)

3. **`apps/web/src/lib/search/keywordSearch.ts`**
   - Added `docs_version` to filter types
   - Added version filtering logic

4. **`apps/web/src/lib/search/vectorSearch.ts`**
   - Added `docs_version` to filter types
   - Added version filtering logic

5. **`apps/web/src/routes/api/search/+server.ts`**
   - Added `version` query parameter parsing
   - Added `getLatestVersion()` function with caching
   - Integrated version filtering into search flow

6. **`ingest/embed/run.ts`**
   - Updated `ChunkRecord` interface to include `docs_version`

### Latest Version Detection

The latest version is determined by:
1. Querying Typesense facets for all distinct `docs_version` values
2. Finding the maximum numeric value
3. Caching the result in memory for the server lifetime

If no versioned docs exist, the filter is not applied (all results shown).

## Reindexing

After implementing this feature, you need to reindex your documentation. See `ingest/REINDEX_GUIDE.md` for detailed instructions.

Quick reindex commands:
```bash
cd ingest
npx tsx source/run.ts          # Load pages
npx tsx transform/run.ts       # Generate chunks with docs_version
npx tsx embed/run.ts           # Generate embeddings (optional)
npx tsx typesense/reset-collection.ts  # Reset collection schema
npx tsx index/run.ts           # Index into Typesense
```

## Notes

- The `docs_version` field is optional, so existing chunks without this field will still work
- Latest version cache is per server instance (restart to refresh)
- Version filtering applies to both keyword and vector search results
- Unversioned URLs (with `docs_version: null`) are excluded when filtering by a specific version

