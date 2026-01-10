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
 * - version (latest|all|<number>): Filter by docs version, default: latest
 *   - "latest": Show only latest version (default)
 *   - "all": Show all versions
 *   - "<number>": Show specific version (e.g., "30.0" or "0.25.1")
 * - rerank (true|false): Enable reranking, default: true
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { keywordSearch, type KeywordSearchResult } from '$lib/search/keywordSearch.js';
import { vectorSearch, type VectorSearchResult } from '$lib/search/vectorSearch.js';
import { rrfFuse } from '$lib/search/rrf.js';
import { getReranker } from '$lib/search/rerank/index.js';
import type { RerankCandidate } from '$lib/search/rerank/types.js';
import { diversifyByUrl } from '$lib/search/diversify.js';
import Typesense from 'typesense';
import { config } from '@repo/config';
import { logSearchQuery } from '$lib/server/logger.js';
import { routeQuery, type AgentDecision } from '$lib/search/agent.js';

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
		docs_version?: number; // numeric version score, or 0 for unversioned
	};
	resolved_version?: {
		mode: 'latest' | 'all' | 'exact';
		score?: number;
	} | null;
	applied_filter_by?: string | null;
	agent_decision?: AgentDecision | null;
	timings_ms: {
		keyword?: number;
		vector?: number;
		rrf?: number;
		rerank?: number;
		total: number;
	};
	rerank_applied: boolean;
	warnings: string[];
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
		docs_version?: number; // numeric version score, or 0 for unversioned
	}>;
};

/**
 * Cached latest version (computed once per server start)
 */
let cachedLatestVersion: number | null = null;

/**
 * Typesense client instance for version detection
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
 * Converts version string (e.g., "30.0", "0.25.1") to numeric score
 * Format: major*1_000_000 + minor*1_000 + patch
 */
function parseVersionString(versionStr: string): number | null {
	const parts = versionStr.split('.').map(part => parseInt(part, 10));

	// Validate all parts are valid numbers
	if (parts.some(part => isNaN(part))) {
		return null;
	}

	const major = parts[0] || 0;
	const minor = parts[1] || 0;
	const patch = parts[2] || 0;

	// Convert to numeric score: major*1_000_000 + minor*1_000 + patch
	return major * 1_000_000 + minor * 1_000 + patch;
}

/**
 * Determines the latest docs version present in the index
 * Caches result in memory for subsequent requests
 */
async function getLatestVersion(): Promise<number | null> {
	// Return cached value if available
	if (cachedLatestVersion !== null) {
		return cachedLatestVersion;
	}

	try {
		const client = getTypesenseClient();

		// Query Typesense to get the maximum docs_version value
		// Use a facet query to get distinct docs_version values
		const searchParams = {
			q: '*',
			query_by: 'url', // Use an indexed field (url is indexed) - required by Typesense
			per_page: 0, // Don't need actual results
			facet_by: 'docs_version',
			max_facet_values: 1000 // Get all distinct versions
		};

		const result = await client
			.collections('docs_chunks')
			.documents()
			.search(searchParams);

		// Extract facet values for docs_version
		const facets = (result as any).facet_counts || [];
		const docsVersionFacet = facets.find((f: any) => f.field_name === 'docs_version');

		if (!docsVersionFacet || !docsVersionFacet.counts || docsVersionFacet.counts.length === 0) {
			// No versioned docs found
			cachedLatestVersion = null;
			return null;
		}

		// Find the maximum version value (excluding 0, which represents unversioned)
		const versionValues = docsVersionFacet.counts
			.map((item: any) => item.value)
			.filter((val: any) => val !== null && val !== undefined && val !== 0)
			.map((val: any) => typeof val === 'number' ? val : parseInt(val, 10))
			.filter((val: any) => !isNaN(val) && val > 0);

		if (versionValues.length === 0) {
			cachedLatestVersion = null;
			return null;
		}

		const maxVersion = Math.max(...versionValues);
		cachedLatestVersion = maxVersion;
		return maxVersion;
	} catch (error) {
		// If we can't determine latest version, return null (no filtering)
		console.warn('Failed to determine latest docs version:', error);
		return null;
	}
}

/**
 * Parses and validates query parameters
 */
function parseQueryParams(url: URL): {
	q: string;
	mode: 'keyword' | 'semantic' | 'hybrid';
	limit: number;
	filters: { section_path?: string; source?: string; docs_version?: number | null };
	rerank: boolean;
	versionParam: string;
	useAgent: boolean;
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

	// Parse version parameter: "latest" | "all" | "<number>" (e.g., "30.0" or "0.25.1")
	const versionParam = url.searchParams.get('version')?.trim() || 'latest';
	let docs_version: number | null | undefined = undefined;

	if (versionParam.toLowerCase() === 'all') {
		// No version filter
		docs_version = undefined;
	} else if (versionParam.toLowerCase() === 'latest') {
		// Will be resolved later in the handler (async)
		docs_version = undefined; // Placeholder, will be set to latest
	} else {
		// Parse version string (e.g., "30.0" or "0.25.1")
		const parsedVersion = parseVersionString(versionParam);
		if (parsedVersion === null) {
			throw error(400, {
				message: `Invalid version parameter: "${versionParam}". Must be "latest", "all", or a version string like "30.0" or "0.25.1"`
			});
		}
		docs_version = parsedVersion;
	}

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

	// Agent flag
	const agentParam = url.searchParams.get('agent');
	const useAgent = agentParam === 'true';

	return {
		q,
		mode,
		limit,
		filters: {
			section_path,
			source,
			docs_version: versionParam.toLowerCase() === 'latest' ? undefined : docs_version
		},
		rerank,
		versionParam, // Pass through to handler for latest resolution
		useAgent
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
		let { q, mode, limit, filters, rerank, versionParam, useAgent } = parseQueryParams(url);

		let agentDecision: AgentDecision | null = null;

		// Agent Routing Logic
		if (useAgent) {
			agentDecision = routeQuery(q);
			mode = agentDecision.mode;
			rerank = agentDecision.rerank;
		}

		// Resolve version and build filter clause
		let resolvedFilters = { ...filters };
		let versionFilterClause: string | undefined = undefined;
		let resolvedVersion: SearchResponse['resolved_version'] = null;

		if (versionParam.toLowerCase() === 'latest') {
			const latestVersion = await getLatestVersion();
			if (latestVersion !== null && latestVersion > 0) {
				// Filter for latest version OR 0 (unversioned)
				// Typesense OR syntax: docs_version:=<latest> || docs_version:=0
				versionFilterClause = `docs_version:=${latestVersion} || docs_version:=0`;
				// For response, still set docs_version to latest for debugging
				resolvedFilters.docs_version = latestVersion;
				resolvedVersion = { mode: 'latest', score: latestVersion };
			} else {
				// No versioned docs found, or only unversioned docs (0)
				// Filter for unversioned only
				versionFilterClause = `docs_version:=0`;
				resolvedVersion = { mode: 'latest', score: undefined };
			}
		} else if (versionParam.toLowerCase() === 'all') {
			resolvedVersion = { mode: 'all' };
			// versionFilterClause remains undefined (no version filter)
		} else if (filters.docs_version !== undefined) {
			// Exact version: use already-parsed value from filters
			// Filter for just that version (no null)
			versionFilterClause = `docs_version:=${filters.docs_version}`;
			resolvedFilters.docs_version = filters.docs_version;
			resolvedVersion = { mode: 'exact', score: filters.docs_version };
		}

		const timings: SearchResponse['timings_ms'] = {
			total: 0
		};

		let results: SearchResponse['results'] = [];
		let rerankApplied = false;
		const warnings: string[] = [];

		// Build complete filter_by clause combining existing filters with version filter
		const filterParts: string[] = [];
		if (filters.section_path) {
			filterParts.push(`section_path:=${filters.section_path}`);
		}
		if (filters.source) {
			filterParts.push(`source:=${filters.source}`);
		}
		if (versionFilterClause) {
			filterParts.push(versionFilterClause);
		}
		const completeFilterBy = filterParts.length > 0 ? filterParts.join(' && ') : undefined;

		// Handle different search modes - pass completeFilterBy via filters object
		if (mode === 'keyword') {
			// Keyword-only search
			const { result: keywordResults, timeMs: keywordTime } = await measureTime(() =>
				keywordSearch(q, { ...filters, _filterBy: completeFilterBy }, limit)
			);
			timings.keyword = keywordTime;

			// Diversify by URL before returning
			const diversified = diversifyByUrl(keywordResults, limit);

			results = diversified.map((r) => ({
				id: r.id,
				title: r.title,
				url: r.url,
				section_path: r.section_path,
				snippet: r.snippet,
				keyword_rank: r.keyword_rank,
				docs_version: r.docs_version
			}));
		} else if (mode === 'semantic') {
			// Semantic (vector) search only
			const { result: vectorResults, timeMs: vectorTime } = await measureTime(() =>
				vectorSearch(q, { ...filters, _filterBy: completeFilterBy }, limit)
			);
			timings.vector = vectorTime;

			// Diversify by URL before returning
			const diversified = diversifyByUrl(vectorResults, limit);

			results = diversified.map((r) => ({
				id: r.id,
				title: r.title,
				url: r.url,
				section_path: r.section_path,
				snippet: r.snippet,
				vector_rank: r.vector_rank,
				vector_score: r.vector_score,
				docs_version: r.docs_version
			}));
		} else {
			// Hybrid search: keyword + vector + RRF fusion
			// Run both searches in parallel
			const [keywordPromise, vectorPromise] = [
				measureTime(() => keywordSearch(q, { ...filters, _filterBy: completeFilterBy }, limit)),
				measureTime(() => vectorSearch(q, { ...filters, _filterBy: completeFilterBy }, limit))
			];

			const [{ result: keywordResults, timeMs: keywordTime }, { result: vectorResults, timeMs: vectorTime }] =
				await Promise.all([keywordPromise, vectorPromise]);

			timings.keyword = keywordTime;
			timings.vector = vectorTime;

			// Diversify each result set by URL before fusion
			const diversifiedKeyword = diversifyByUrl(keywordResults, limit);
			const diversifiedVector = diversifyByUrl(vectorResults, limit);

			// Fuse results using RRF
			const { result: fusedResults, timeMs: rrfTime } = await measureTime(() =>
				rrfFuse(diversifiedKeyword, diversifiedVector, { k: 60, limit })
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
				rrf_score: r.rrf_score,
				docs_version: (r as any).docs_version
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
						rerankApplied = true;

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

						// Add warning about rerank failure
						const errorMessage = rerankError?.message || 'Unknown error';
						const status = rerankError?.status || rerankError?.httpStatus;
						warnings.push(`rerank_failed: ${status ? `HTTP ${status}` : errorMessage}`);

						// Results already contain fused results without rerank_score, so we can just continue
					}
				} else {
					// Reranker is null (disabled via config)
					warnings.push('rerank_skipped: provider not configured or disabled');
				}
			} else {
				// Rerank was explicitly disabled via query parameter
				warnings.push('rerank_skipped: disabled by query parameter');
			}
		}

		// Diversify final results by URL (as last step, after reranking)
		results = diversifyByUrl(results, limit);

		// Calculate total time
		const endTime = performance.now();
		timings.total = Math.round(endTime - startTime);

		// Log the search query (fire-and-forget, non-blocking)
		// We don't await this to ensure it doesn't affect response latency
		logSearchQuery(q, mode, results.map(r => r.id)).catch(err => {
			console.error('Logging failed:', err);
		});

		// Return response
		const response: SearchResponse = {
			query: q,
			mode,
			limit,
			filters: resolvedFilters,
			resolved_version: resolvedVersion,
			applied_filter_by: completeFilterBy || null,
			agent_decision: agentDecision,
			timings_ms: timings,
			rerank_applied: rerankApplied,
			warnings,
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

