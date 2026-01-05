/**
 * Keyword search function for AI Search MVP
 * 
 * Performs pure keyword search using Typesense Documents Search API.
 * No vector/semantic search logic - this is keyword-only.
 */

import Typesense from 'typesense';
import { config } from '@repo/config';

/**
 * Typesense collection name for documentation chunks
 */
const DOCS_CHUNKS_COLLECTION = 'docs_chunks';

/**
 * Result type for keyword search
 */
export type KeywordSearchResult = {
	id: string;
	title: string;
	url: string;
	section_path: string;
	snippet: string;
	keyword_rank: number;
};

/**
 * Filter options for keyword search
 */
export type KeywordSearchFilters = {
	section_path?: string;
	source?: string;
};

/**
 * Typesense client instance (singleton pattern)
 */
let clientInstance: Typesense.Client | null = null;

/**
 * Gets or creates a Typesense client instance
 */
function getTypesenseClient(): Typesense.Client {
	if (clientInstance) {
		return clientInstance;
	}

	const { host, port, protocol, apiKey } = config.typesense;

	clientInstance = new Typesense.Client({
		nodes: [
			{
				host,
				port,
				protocol
			}
		],
		apiKey,
		connectionTimeoutSeconds: 10,
		numRetries: 3,
		retryIntervalSeconds: 0.1
	});

	return clientInstance;
}

/**
 * Performs keyword search using Typesense Documents Search API
 * 
 * @param query - Search query string
 * @param filters - Optional filters for section_path and source
 * @param limit - Maximum number of results to return
 * @returns Array of search results with keyword rank and snippet
 */
export async function keywordSearch(
	query: string,
	filters: KeywordSearchFilters = {},
	limit: number = 50
): Promise<KeywordSearchResult[]> {
	const client = getTypesenseClient();

	// Build filter_by clause
	const filterParts: string[] = [];
	if (filters.section_path) {
		filterParts.push(`section_path:=${filters.section_path}`);
	}
	if (filters.source) {
		filterParts.push(`source:=${filters.source}`);
	}
	const filterBy = filterParts.length > 0 ? filterParts.join(' && ') : undefined;

	// Perform search
	const searchParams = {
		q: query,
		query_by: 'content,title,section_path',
		filter_by: filterBy,
		per_page: limit,
		// Enable highlighting to get snippets
		highlight_full_fields: 'content',
		highlight_affix_num_tokens: 5
	};

	try {
		const searchResults = await client
			.collections(DOCS_CHUNKS_COLLECTION)
			.documents()
			.search(searchParams);

		// Map Typesense results to our output shape
		const results: KeywordSearchResult[] = (searchResults.hits || []).map((hit, index) => {
			const doc = hit.document as any;
			
			// Extract snippet from highlights if available
			// Typesense highlights can be:
			// 1. An object with field names as keys: { content: ['snippet1', 'snippet2'] }
			// 2. An array of highlight objects: [{ field: 'content', snippet: '...' }]
			let snippet = '';
			
			if (hit.highlights) {
				// Handle object format: { content: ['snippet1', 'snippet2'] }
				if (typeof hit.highlights === 'object' && !Array.isArray(hit.highlights)) {
					const contentHighlights = (hit.highlights as any).content;
					if (Array.isArray(contentHighlights) && contentHighlights.length > 0) {
						snippet = contentHighlights[0];
					} else if (typeof contentHighlights === 'string') {
						snippet = contentHighlights;
					}
				}
				// Handle array format: [{ field: 'content', snippet: '...' }]
				else if (Array.isArray(hit.highlights) && hit.highlights.length > 0) {
					const contentHighlight = hit.highlights.find((h: any) => h.field === 'content');
					if (contentHighlight) {
						if (typeof contentHighlight.snippet === 'string') {
							snippet = contentHighlight.snippet;
						} else if (Array.isArray(contentHighlight.snippet) && contentHighlight.snippet.length > 0) {
							snippet = contentHighlight.snippet[0];
						} else if (Array.isArray(contentHighlight.snippets) && contentHighlight.snippets.length > 0) {
							snippet = contentHighlight.snippets[0];
						}
					} else if (hit.highlights[0]?.snippet) {
						// Fallback to first highlight snippet
						snippet = typeof hit.highlights[0].snippet === 'string' 
							? hit.highlights[0].snippet 
							: (Array.isArray(hit.highlights[0].snippet) ? hit.highlights[0].snippet[0] : '');
					}
				}
			}
			
			// If no highlight available, use truncated content
			if (!snippet && doc.content) {
				snippet = doc.content.substring(0, 200);
				if (doc.content.length > 200) {
					snippet += '...';
				}
			}

			return {
				id: doc.id || '',
				title: doc.title || '',
				url: doc.url || '',
				section_path: doc.section_path || '',
				snippet: snippet || '',
				keyword_rank: index + 1 // 1-based rank
			};
		});

		return results;
	} catch (error: any) {
		const errorMessage = error?.message || 'Unknown error';
		const httpStatus = error?.httpStatus;

		if (httpStatus === 401 || httpStatus === 403) {
			throw new Error(
				`Authentication failed while performing keyword search: ${errorMessage}. ` +
				`Please check your TYPESENSE_API_KEY.`
			);
		}

		if (httpStatus === 404) {
			throw new Error(
				`Collection '${DOCS_CHUNKS_COLLECTION}' not found. ` +
				`Please ensure the collection exists and is indexed.`
			);
		}

		if (error?.message?.includes('ECONNREFUSED') || error?.message?.includes('ENOTFOUND')) {
			throw new Error(
				`Connection failed to Typesense server at ${config.typesense.protocol}://${config.typesense.host}:${config.typesense.port}. ` +
				`Please check that Typesense is running and TYPESENSE_HOST/TYPESENSE_PORT are correct.`
			);
		}

		throw new Error(
			`Failed to perform keyword search: ${errorMessage}`
		);
	}
}

