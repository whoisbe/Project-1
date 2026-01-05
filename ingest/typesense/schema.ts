/**
 * Typesense collection schema for documentation chunks
 * 
 * This schema defines the structure for storing chunked documentation
 * with support for hybrid search (keyword + vector) and faceted filtering.
 */

export const DOCS_CHUNKS_COLLECTION = 'docs_chunks';

/**
 * Typesense collection schema for docs_chunks
 * 
 * Compatible with Typesense create-collection API.
 * Supports:
 * - Keyword search on title, section_path, and content
 * - Vector search on embeddings
 * - Faceted filtering on section_path, source, and tags
 */
export const docsChunksSchema = {
	name: DOCS_CHUNKS_COLLECTION,
	fields: [
		{
			name: 'id',
			type: 'string',
			// Unique identifier for each chunk (stable hash: url + section_path + chunk_index)
			// Required field, indexed for lookups
		},
		{
			name: 'url',
			type: 'string',
			// Source URL of the documentation page
			// Indexed for searchability and reference
			index: true,
		},
		{
			name: 'title',
			type: 'string',
			// Page title for display and keyword search
			// Indexed for keyword search relevance
			index: true,
		},
		{
			name: 'section_path',
			type: 'string',
			// Hierarchical path derived from markdown headings (e.g., "Getting Started / Installation")
			// Faceted to enable filtering by documentation section
			facet: true,
			index: true,
		},
		{
			name: 'content',
			type: 'string',
			// The chunk content (markdown text, 300-800 tokens)
			// Primary field for keyword search
			index: true,
		},
		{
			name: 'source',
			type: 'string',
			// Source identifier (default: "typesense-docs")
			// Faceted to enable filtering by source
			facet: true,
			index: true,
		},
		{
			name: 'tags',
			type: 'string[]',
			// Optional array of tags for additional categorization
			// Faceted to enable multi-select tag filtering
			facet: true,
			optional: true,
			index: false,
		},
		{
			name: 'embedding',
			type: 'float[]',
			// Vector embedding from OpenAI text-embedding-3-small (1536 dimensions)
			// Pre-computed embeddings stored for semantic/vector search
			// Dimensions: 1536 (OpenAI text-embedding-3-small standard output)
			// Typesense will use these pre-computed vectors for similarity search
		},
	],
	// No default_sorting_field specified - results are sorted by relevance (keyword/vector/hybrid)
	// rather than a static field
} as const;

