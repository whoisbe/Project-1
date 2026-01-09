# Reindexing Guide: Adding docs_version Field

This guide explains how to reindex your documentation after adding the `docs_version` field to support version filtering.

## Overview

The `docs_version` field was added to:
- Enable filtering by documentation version (latest, all, or specific version)
- Support "prefer latest docs version" behavior in search results

The field is:
- **Type**: `int32` (optional, facet-enabled)
- **Format**: Numeric score calculated as `major*1_000_000 + minor*1_000 + patch`
- **Examples**:
  - `30.0` → `30_000_000`
  - `0.25.1` → `25_001`
  - Unversioned URLs → `null`

## Reindexing Steps

### Step 1: Regenerate chunks.jsonl

The `docs_version` field is added during the transform stage, so you need to regenerate `chunks.jsonl`:

```bash
cd ingest
npx tsx transform/run.ts
```

This will:
- Read from `ingest/out/pages.jsonl` (if it exists, or regenerate it first)
- Parse `docs_version` from each page URL
- Write updated chunks to `ingest/out/chunks.jsonl` with the new `docs_version` field

**Note**: If `pages.jsonl` doesn't exist or is outdated, regenerate it first:
```bash
npx tsx source/run.ts
```

### Step 2: Regenerate chunks_embedded.jsonl (Optional)

Since `docs_version` doesn't affect content, you **don't need to re-embed** if you only want to add the version field. However, if you want to ensure consistency or if content has changed, regenerate embeddings:

```bash
npx tsx embed/run.ts
```

This will:
- Read from `ingest/out/chunks.jsonl`
- Generate embeddings for chunks that don't already have embeddings (resume support)
- Write to `ingest/out/chunks_embedded.jsonl`

**Note**: The embedding script has resume support, so it will skip chunks that already have embeddings. To force a full re-embed, delete `chunks_embedded.jsonl` first.

### Step 3: Drop and Recreate Collection

The Typesense schema has been updated to include the `docs_version` field. Drop and recreate the collection:

```bash
npx tsx typesense/reset-collection.ts
```

This will:
- Drop the existing `docs_chunks` collection
- Recreate it with the updated schema (including `docs_version`)

### Step 4: Re-index into Typesense

Index the updated chunks into Typesense:

```bash
npx tsx index/run.ts
```

This will:
- Read from `ingest/out/chunks_embedded.jsonl`
- Validate chunks (including `docs_version` field)
- Bulk upsert into Typesense

## Complete Reindexing Command Sequence

For a complete reindex from scratch:

```bash
cd ingest

# 1. Load pages from local docs repo
npx tsx source/run.ts

# 2. Transform pages into chunks (includes docs_version)
npx tsx transform/run.ts

# 3. Generate embeddings (optional if content unchanged)
npx tsx embed/run.ts

# 4. Reset Typesense collection
npx tsx typesense/reset-collection.ts

# 5. Index chunks into Typesense
npx tsx index/run.ts
```

## Verification

After reindexing, verify the `docs_version` field is working:

1. **Check API response includes version filter**:
   ```bash
   curl "http://localhost:5173/api/search?q=vector%20search&version=latest"
   ```

2. **Test different version filters**:
   ```bash
   # Latest version (default)
   curl "http://localhost:5173/api/search?q=vector%20search"
   
   # All versions
   curl "http://localhost:5173/api/search?q=vector%20search&version=all"
   
   # Specific version
   curl "http://localhost:5173/api/search?q=vector%20search&version=0.25.1"
   ```

3. **Check response includes docs_version in filters**:
   The API response should include `filters.docs_version` when a version filter is applied.

## Troubleshooting

### Issue: Collection schema mismatch

**Error**: `Invalid document schema while upserting`

**Solution**: Make sure you've run `npx tsx typesense/reset-collection.ts` to update the schema.

### Issue: docs_version is null for all chunks

**Cause**: URLs don't match the expected pattern `https://typesense.org/docs/<version>/...`

**Solution**: Check that your source URLs follow the expected format. Unversioned URLs will have `docs_version: null`, which is expected.

### Issue: Latest version not detected

**Cause**: The latest version cache hasn't been populated yet, or no versioned docs exist in the index.

**Solution**: The API will query Typesense on the first request to determine the latest version. If no versioned docs exist, it will return all results (no version filter).

## Notes

- The `docs_version` field is optional, so existing chunks without this field will still work (they'll be treated as unversioned).
- The latest version is cached in memory per server start, so restart the server if you reindex and want the cache refreshed.
- Version filtering is applied to both keyword and vector search results.

