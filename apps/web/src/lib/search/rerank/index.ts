/**
 * Reranker provider selection and factory
 * 
 * Exports getReranker() which returns the appropriate Reranker instance
 * based on environment configuration, or null if reranking is disabled.
 */

import type { Reranker } from './types.js';
import { createCohereReranker } from './cohere.js';

/**
 * Gets the configured reranker instance, or null if reranking is disabled
 * 
 * Checks:
 * 1. RERANK_ENABLED env var (if false, returns null)
 * 2. RERANK_PROVIDER env var (if empty or 'none', returns null)
 * 3. Provider-specific configuration
 * 
 * @returns Reranker instance or null if disabled
 */
export function getReranker(): Reranker | null {
	// Check feature flag first
	const rerankEnabled = process.env.RERANK_ENABLED;
	if (rerankEnabled === 'false' || rerankEnabled === '0') {
		return null;
	}

	// Check provider setting
	// Use process.env directly to allow optional/empty values
	// (config package may require it, but we handle gracefully here)
	const provider = process.env.RERANK_PROVIDER || '';
	
	if (!provider || provider.trim() === '' || provider.toLowerCase() === 'none') {
		return null;
	}

	// Route to provider-specific implementation
	const providerLower = provider.toLowerCase();
	
	if (providerLower === 'cohere') {
		try {
			return createCohereReranker();
		} catch (error: any) {
			throw new Error(
				`Failed to create Cohere reranker: ${error.message}. ` +
				`Please check COHERE_API_KEY and COHERE_RERANK_MODEL environment variables.`
			);
		}
	}

	// Unknown provider
	throw new Error(
		`Unknown rerank provider: ${provider}. ` +
		`Supported providers: 'cohere', 'none' (or empty string to disable).`
	);
}

/**
 * Re-exports types for convenience
 */
export type { Reranker, RerankCandidate, RerankResult } from './types.js';

/**
 * Example usage:
 * 
 * ```typescript
 * import { getReranker } from '$lib/search/rerank';
 * import type { RerankCandidate } from '$lib/search/rerank';
 * 
 * // Get reranker (may be null if disabled)
 * const reranker = getReranker();
 * 
 * if (reranker) {
 *   // Prepare candidates from search results
 *   const candidates: RerankCandidate[] = searchResults.map(result => ({
 *     id: result.id,
 *     title: result.title,
 *     section_path: result.section_path,
 *     snippet: result.snippet,
 *     url: result.url
 *   }));
 * 
 *   // Rerank top N candidates
 *   const topCandidates = candidates.slice(0, 50);
 *   const reranked = await reranker.rerank(userQuery, topCandidates);
 * 
 *   // Use reranked results (already sorted by relevance_score)
 *   console.log(reranked[0].rerank_score); // Highest score
 * } else {
 *   // Reranking disabled - use original order
 *   console.log('Reranking is disabled');
 * }
 * ```
 * 
 * Expected environment variables:
 * - RERANK_ENABLED: 'true' or 'false' (optional, defaults to enabled if provider is set)
 * - RERANK_PROVIDER: 'cohere', 'none', or empty string (optional, 'none' or empty disables)
 * - COHERE_API_KEY: Cohere API key (required if provider is 'cohere')
 * - COHERE_RERANK_MODEL: Cohere rerank model name, e.g., 'rerank-english-v3.0' (required if provider is 'cohere')
 * 
 * Note: The @repo/config package validates COHERE_API_KEY and COHERE_RERANK_MODEL at load time.
 * If reranking is disabled (RERANK_PROVIDER='none' or empty), you may still need to set these
 * env vars to satisfy config validation, or update the config package to make them optional.
 */

