# Search UI Implementation

## Expected UI Layout

### Search Form Section
- **Large search input field** at the top, with placeholder "Enter your search query..."
- **Search button** next to the input (disabled when loading or empty query)
- **Control row** below the input with:
  - **Mode selector**: Dropdown with options (Keyword, Semantic, Hybrid) - default: Hybrid
  - **Limit selector**: Dropdown with options (5, 10, 25, 50) - default: 10
  - **Rerank checkbox**: Toggle for reranking (default: checked)

### Results Section
- **Results header**: Shows count and timing (e.g., "Found 10 results (234ms)")
- **Result cards** with:
  - **Title**: Clickable link (opens in new tab) to the document URL
  - **Metadata line**: Section path + small badges showing keyword_rank, vector_rank, rrf_score, rerank_score (only if present)
  - **Snippet**: Highlighted text with `<mark>` tags rendered as yellow highlights
  - **Collapsible "Why this result?" panel**: Shows detailed ranking information when expanded

### Styling
- Clean, minimal design with light borders and subtle colors
- Blue accent color (#4a90e2) for links and buttons
- Yellow highlights (#ffeb3b) for search term matches in snippets
- Gray badges for metadata
- Responsive layout that works on different screen sizes

## Manual Test Checklist

### Test 1: Basic Hybrid Search
1. Navigate to the search page
2. Enter query: `authentication`
3. Ensure mode is "Hybrid" and rerank is enabled
4. Click "Search"
5. **Expected**:
   - Loading state shows "Searching..."
   - Results appear with titles, snippets, and metadata
   - Each result shows keyword_rank, vector_rank, rrf_score, and rerank_score
   - Snippets contain highlighted terms
   - URL updates to include query params: `?q=authentication&mode=hybrid&limit=10`
   - "Why this result?" panels can be expanded to show detailed scores

### Test 2: Keyword-Only Search
1. Enter query: `typesense`
2. Change mode to "Keyword"
3. Set limit to 5
4. Click "Search"
5. **Expected**:
   - Only keyword_rank is shown (no vector_rank, rrf_score, or rerank_score)
   - Results are sorted by keyword relevance
   - URL updates: `?q=typesense&mode=keyword&limit=5`
   - Snippets show highlighted matches

### Test 3: Semantic Search with Rerank Disabled
1. Enter query: `how to configure vector search`
2. Change mode to "Semantic"
3. Uncheck "Rerank" toggle
4. Set limit to 25
5. Click "Search"
6. **Expected**:
   - Only vector_rank and vector_score are shown
   - No rerank_score appears
   - Results are sorted by vector similarity
   - URL updates: `?q=how+to+configure+vector+search&mode=semantic&limit=25&rerank=false`
   - Snippets are plain text (no highlights, as vector search doesn't provide them)

### Test 4: URL State Persistence
1. Perform a search with custom settings
2. Copy the URL
3. Open in a new tab
4. **Expected**:
   - Form fields are populated from URL params
   - Search automatically executes if query param exists
   - Results are displayed

### Test 5: Error Handling
1. Stop Typesense server (or use invalid query)
2. Enter a query and search
3. **Expected**:
   - Error message appears in red box
   - Form remains functional
   - No results displayed

## Features Implemented

✅ Query input with validation
✅ Mode selector (keyword/semantic/hybrid)
✅ Limit selector (5/10/25/50)
✅ Rerank toggle
✅ Loading states
✅ Error handling
✅ Results display with metadata
✅ HTML snippet rendering (safe, with `<mark>` highlights)
✅ Collapsible "Why this result?" panels
✅ URL state synchronization
✅ Auto-search on page load if query param exists
✅ Responsive design

