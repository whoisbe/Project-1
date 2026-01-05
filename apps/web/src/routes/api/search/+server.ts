/**
 * Search API endpoint for AI Search MVP
 * 
 * GET /api/search
 * 
 * Query params:
 * - q (string, required): Search query
 * - mode (keyword|semantic|hybrid): Search mode, default: hybrid
 * - limit (number): Max results, default: 10, max: 50
 * - section_path (string, optional): Filter by section path
 * - source (string, optional): Filter by source
 * - rerank (true|false): Enable reranking, default: true
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { keywordSearch, type KeywordSearchResult } from '$lib/search/keywordSearch.js';
import { vectorSearch, type VectorSearchResult } from '$lib/search/vectorSearch.js';
import { rrfFuse } from '$lib/search/rrf.js';
import { getReranker } from '$lib/search/rerank/index.js';
import type { RerankCandidate } from '$lib/search/rerank/types.js';

/**
 * Response type for search API
 */
type SearchResponse = {
	query: string;
	mode: string;
	limit: number;
	filters: {
		section_path?: string;
		source?: string;
	};
	timings_ms: {
		keyword?: number;
		vector?: number;
		rrf?: number;
		rerank?: number;
		total: number;
	};
	results: Array<{
		id: string;
		title: string;
		url: string;
		section_path: string;
		snippet: string;
		keyword_rank?: number;
		vector_rank?: number;
		vector_score?: number;
		rrf_score?: number;
		rerank_score?: number;
	}>;
};

/**
 * Parses and validates query parameters
 */
function parseQueryParams(url: URL): {
	q: string;
	mode: 'keyword' | 'semantic' | 'hybrid';
	limit: number;
	filters: { section_path?: string; source?: string };
	rerank: boolean;
} {
	const q = url.searchParams.get('q')?.trim() || '';
	if (!q) {
		throw error(400, { message: 'Query parameter "q" is required and cannot be empty' });
	}

	const modeParam = url.searchParams.get('mode')?.toLowerCase() || 'hybrid';
	if (!['keyword', 'semantic', 'hybrid'].includes(modeParam)) {
		throw error(400, {
			message: `Invalid mode: "${modeParam}". Must be one of: keyword, semantic, hybrid`
		});
	}
	const mode = modeParam as 'keyword' | 'semantic' | 'hybrid';

	const limitParam = url.searchParams.get('limit');
	let limit = 10;
	if (limitParam) {
		const parsed = parseInt(limitParam, 10);
		if (isNaN(parsed) || parsed < 1) {
			throw error(400, { message: 'Invalid limit: must be a positive number' });
		}
		limit = Math.min(parsed, 50); // Cap at 50
	}

	const section_path = url.searchParams.get('section_path')?.trim() || undefined;
	const source = url.searchParams.get('source')?.trim() || undefined;

	const rerankParam = url.searchParams.get('rerank');
	let rerank = true; // Default to true
	if (rerankParam !== null) {
		const rerankLower = rerankParam.toLowerCase();
		if (rerankLower === 'false' || rerankLower === '0') {
			rerank = false;
		} else if (rerankLower === 'true' || rerankLower === '1') {
			rerank = true;
		} else {
			throw error(400, {
				message: `Invalid rerank parameter: "${rerankParam}". Must be "true" or "false"`
			});
		}
	}

	return {
		q,
		mode,
		limit,
		filters: {
			section_path,
			source
		},
		rerank
	};
}

/**
 * Measures execution time of an async function
 */
async function measureTime<T>(fn: () => Promise<T>): Promise<{ result: T; timeMs: number }> {
	const start = performance.now();
	const result = await fn();
	const end = performance.now();
	return { result, timeMs: Math.round(end - start) };
}

/**
 * GET /api/search handler
 */
export const GET: RequestHandler = async ({ url }) => {
	const startTime = performance.now();

	try {
		// Parse and validate query parameters
		const { q, mode, limit, filters, rerank } = parseQueryParams(url);

		const timings: SearchResponse['timings_ms'] = {
			total: 0
		};

		let results: SearchResponse['results'] = [];

		// Handle different search modes
		if (mode === 'keyword') {
			// Keyword-only search
			const { result: keywordResults, timeMs: keywordTime } = await measureTime(() =>
				keywordSearch(q, filters, limit)
			);
			timings.keyword = keywordTime;

			results = keywordResults.map((r) => ({
				id: r.id,
				title: r.title,
				url: r.url,
				section_path: r.section_path,
				snippet: r.snippet,
				keyword_rank: r.keyword_rank
			}));
		} else if (mode === 'semantic') {
			// Semantic (vector) search only
			const { result: vectorResults, timeMs: vectorTime } = await measureTime(() =>
				vectorSearch(q, filters, limit)
			);
			timings.vector = vectorTime;

			results = vectorResults.map((r) => ({
				id: r.id,
				title: r.title,
				url: r.url,
				section_path: r.section_path,
				snippet: r.snippet,
				vector_rank: r.vector_rank,
				vector_score: r.vector_score
			}));
		} else {
			// Hybrid search: keyword + vector + RRF fusion
			// Run both searches in parallel
			const [keywordPromise, vectorPromise] = [
				measureTime(() => keywordSearch(q, filters, limit)),
				measureTime(() => vectorSearch(q, filters, limit))
			];

			const [{ result: keywordResults, timeMs: keywordTime }, { result: vectorResults, timeMs: vectorTime }] =
				await Promise.all([keywordPromise, vectorPromise]);

			timings.keyword = keywordTime;
			timings.vector = vectorTime;

			// Fuse results using RRF
			const { result: fusedResults, timeMs: rrfTime } = await measureTime(() =>
				rrfFuse(keywordResults, vectorResults, { k: 60, limit })
			);
			timings.rrf = rrfTime;

			// Convert fused results to response format
			results = fusedResults.map((r) => ({
				id: r.id,
				title: r.title,
				url: r.url,
				section_path: r.section_path,
				snippet: r.snippet,
				keyword_rank: r.keyword_rank,
				vector_rank: r.vector_rank,
				rrf_score: r.rrf_score
			}));

			// Apply reranking if enabled
			if (rerank) {
				const reranker = getReranker();
				if (reranker) {
					try {
						// Rerank top N (N = min(50, fused.length))
						const topN = Math.min(50, results.length);
						const candidatesToRerank = results.slice(0, topN);

						// Convert to RerankCandidate format
						const candidates: RerankCandidate[] = candidatesToRerank.map((r) => ({
							id: r.id,
							title: r.title,
							section_path: r.section_path,
							snippet: r.snippet,
							url: r.url
						}));

						// Rerank
						const { result: rerankedResults, timeMs: rerankTime } = await measureTime(() =>
							reranker.rerank(q, candidates)
						);
						timings.rerank = rerankTime;

						// Create a map of reranked results by id for quick lookup
						const rerankedMap = new Map(
							rerankedResults.map((rr) => [rr.id, { rerank_score: rr.rerank_score, reranked: rr }])
						);

						// Update results with rerank scores and reorder
						// First, update all results with rerank scores (if they were reranked)
						const updatedResults = results.map((r) => {
							const reranked = rerankedMap.get(r.id);
							if (reranked) {
								return {
									...r,
									rerank_score: reranked.rerank_score
								};
							}
							return r;
						});

						// Split into reranked and non-reranked
						const reranked = updatedResults.filter((r) => r.rerank_score !== undefined);
						const notReranked = updatedResults.filter((r) => r.rerank_score === undefined);

						// Sort reranked by rerank_score (descending), then append non-reranked
						reranked.sort((a, b) => (b.rerank_score || 0) - (a.rerank_score || 0));

						// Combine: reranked first (sorted by rerank_score), then non-reranked (preserve original order)
						results = [...reranked, ...notReranked];
					} catch (rerankError: any) {
						// Log rerank error but don't fail the request
						console.error('Reranking failed, falling back to non-reranked results:', rerankError);
						// Results already contain fused results without rerank_score, so we can just continue
					}
				}
				// If reranker is null (disabled), results already contain fused results without rerank_score
			}
		}

		// Ensure we don't exceed the requested limit
		results = results.slice(0, limit);

		// Calculate total time
		const endTime = performance.now();
		timings.total = Math.round(endTime - startTime);

		// Return response
		const response: SearchResponse = {
			query: q,
			mode,
			limit,
			filters,
			timings_ms: timings,
			results
		};

		return json(response);
	} catch (err: any) {
		// Handle validation errors (400)
		if (err.status === 400) {
			throw err;
		}

		// Handle Typesense connection errors (502)
		if (
			err?.message?.includes('Connection failed') ||
			err?.message?.includes('ECONNREFUSED') ||
			err?.message?.includes('ENOTFOUND') ||
			err?.httpStatus === 503
		) {
			throw error(502, {
				message: `Typesense service unavailable: ${err.message || 'Connection failed'}`
			});
		}

		// Handle OpenAI embedding errors (502)
		if (
			err?.message?.includes('query embedding') ||
			err?.message?.includes('OpenAI') ||
			err?.status === 429 ||
			err?.status === 500 ||
			err?.status === 502 ||
			err?.status === 503
		) {
			throw error(502, {
				message: `OpenAI embedding service unavailable: ${err.message || 'Failed to generate embedding'}`
			});
		}

		// Handle other errors (500)
		console.error('Search API error:', err);
		throw error(500, {
			message: `Internal server error: ${err.message || 'Unknown error'}`
		});
	}
};

