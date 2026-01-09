/**
 * Vector (semantic) search function for AI Search MVP
 * 
 * Performs pure vector search using Typesense Vector Search API.
 * No keyword search logic - this is vector-only.
 */

import Typesense from 'typesense';
import OpenAI from 'openai';
import { config } from '@repo/config';

/**
 * Typesense collection name for documentation chunks
 */
const DOCS_CHUNKS_COLLECTION = 'docs_chunks';

/**
 * Result type for vector search
 */
export type VectorSearchResult = {
	id: string;
	title: string;
	url: string;
	section_path: string;
	snippet: string;
	vector_rank: number;
	vector_score?: number;
	docs_version?: number; // numeric version score, or 0 for unversioned
};

/**
 * Filter options for vector search
 */
export type VectorSearchFilters = {
	section_path?: string;
	source?: string;
	docs_version?: number; // numeric version score, or 0 for unversioned
	_filterBy?: string; // Internal: pre-built filter_by clause for OR handling
};

/**
 * Typesense client instance (singleton pattern)
 */
let typesenseClientInstance: Typesense.Client | null = null;

/**
 * Gets or creates a Typesense client instance
 */
function getTypesenseClient(): Typesense.Client {
	if (typesenseClientInstance) {
		return typesenseClientInstance;
	}

	const { host, port, protocol, apiKey } = config.typesense;

	typesenseClientInstance = new Typesense.Client({
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

	return typesenseClientInstance;
}

/**
 * OpenAI client instance (singleton pattern)
 */
let openaiClientInstance: OpenAI | null = null;

/**
 * Gets or creates an OpenAI client instance
 */
function getOpenAIClient(): OpenAI {
	if (openaiClientInstance) {
		return openaiClientInstance;
	}

	openaiClientInstance = new OpenAI({
		apiKey: config.openai.apiKey
	});

	return openaiClientInstance;
}

/**
 * Generates embedding for a query string using OpenAI
 */
async function generateQueryEmbedding(query: string): Promise<number[]> {
	const client = getOpenAIClient();
	const model = config.openai.embedModel;

	try {
		const response = await client.embeddings.create({
			model,
			input: query
		});

		if (!response.data || response.data.length === 0) {
			throw new Error('OpenAI embeddings API returned no data');
		}

		return response.data[0].embedding;
	} catch (error: any) {
		const errorMessage = error?.message || 'Unknown error';
		const status = error?.status;

		if (status === 401 || status === 403) {
			throw new Error(
				`Authentication failed while generating query embedding: ${errorMessage}. ` +
				`Please check your OPENAI_API_KEY.`
			);
		}

		if (status === 429) {
			throw new Error(
				`Rate limit exceeded while generating query embedding: ${errorMessage}. ` +
				`Please try again later.`
			);
		}

		throw new Error(
			`Failed to generate query embedding: ${errorMessage}`
		);
	}
}

/**
 * Performs vector search using Typesense Vector Search API
 * 
 * @param query - Search query string (will be embedded)
 * @param filters - Optional filters for section_path and source
 * @param limit - Maximum number of results to return (k parameter)
 * @returns Array of search results with vector rank and score
 */
export async function vectorSearch(
	query: string,
	filters: VectorSearchFilters = {},
	limit: number = 50
): Promise<VectorSearchResult[]> {
	// Generate query embedding
	const queryEmbedding = await generateQueryEmbedding(query);

	// Use pre-built filter_by if provided (for OR clause handling)
	// Otherwise, build filter_by from individual filters (legacy behavior)
	let filterBy: string | undefined;
	
	if (filters._filterBy !== undefined) {
		filterBy = filters._filterBy;
	} else {
		// Build filter_by clause from individual filters
		const filterParts: string[] = [];
		if (filters.section_path) {
			filterParts.push(`section_path:=${filters.section_path}`);
		}
		if (filters.source) {
			filterParts.push(`source:=${filters.source}`);
		}
		if (filters.docs_version !== undefined && filters.docs_version !== null) {
			// Filter for specific version (0 means unversioned)
			filterParts.push(`docs_version:=${filters.docs_version}`);
		}
		filterBy = filterParts.length > 0 ? filterParts.join(' && ') : undefined;
	}

	const client = getTypesenseClient();

	// Perform vector search using multi_search endpoint to avoid query string length limits
	// multi_search uses POST and can handle large vector queries
	// Build vector_query string: embedding:([...values], k:limit)
	const embeddingStr = queryEmbedding.join(',');
	const vectorQuery = `embedding:([${embeddingStr}], k:${limit})`;

	const searchParams = {
		q: '*', // Required parameter but not used for vector-only search
		vector_query: vectorQuery,
		filter_by: filterBy,
		per_page: limit
	};

	try {
		// Use multi_search which uses POST and can handle large payloads
		// Format: { searches: [{ collection: 'name', ...params }] }
		const multiSearchParams = {
			searches: [
				{
					collection: DOCS_CHUNKS_COLLECTION,
					...searchParams
				}
			]
		};

		const multiSearchResults = await client.multiSearch.perform(multiSearchParams, {});
		
		// Extract results from multi_search response
		// multi_search returns { results: [{ hits: [...], ... }] or [{ error: '...' }] }
		if (!multiSearchResults.results || multiSearchResults.results.length === 0) {
			return [];
		}
		
		const firstResult = multiSearchResults.results[0];
		
		// Check if the result contains an error
		if ((firstResult as any).error) {
			throw new Error(`Vector search error: ${(firstResult as any).error}`);
		}
		
		const searchResults = firstResult;

		// Map Typesense results to our output shape
		const results: VectorSearchResult[] = (searchResults.hits || []).map((hit, index) => {
			const doc = hit.document as any;

			// Extract snippet from content (first ~200 chars)
			// Vector search doesn't provide keyword highlights, so we use truncated content
			let snippet = '';
			if (doc.content) {
				snippet = doc.content.substring(0, 200);
				if (doc.content.length > 200) {
					snippet += '...';
				}
			}

			// Extract vector score if available
			// Typesense may provide similarity score in hit object
			const vectorScore = (hit as any).vector_distance !== undefined
				? 1 - (hit as any).vector_distance // Convert distance to similarity (assuming cosine similarity, distance = 1 - similarity)
				: undefined;

			return {
				id: doc.id || '',
				title: doc.title || '',
				url: doc.url || '',
				section_path: doc.section_path || '',
				snippet: snippet || '',
				vector_rank: index + 1, // 1-based rank
				vector_score: vectorScore,
				docs_version: doc.docs_version !== undefined ? doc.docs_version : 0
			};
		});

		return results;
	} catch (error: any) {
		const errorMessage = error?.message || 'Unknown error';
		const httpStatus = error?.httpStatus;

		if (httpStatus === 401 || httpStatus === 403) {
			throw new Error(
				`Authentication failed while performing vector search: ${errorMessage}. ` +
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

		if (error?.message?.includes('vector_query') || error?.message?.includes('vector')) {
			throw new Error(
				`Vector search failed: ${errorMessage}. ` +
				`Please check that the collection has vector search enabled and the embedding field is properly configured.`
			);
		}

		throw new Error(
			`Failed to perform vector search: ${errorMessage}`
		);
	}
}

