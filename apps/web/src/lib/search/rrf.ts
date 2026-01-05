/**
 * Reciprocal Rank Fusion (RRF) for hybrid search ranking
 * 
 * Combines results from keyword and vector search using RRF algorithm.
 * Formula: rrf_score = sum(1/(k + rank)) for each ranking where doc appears
 * 
 * Example:
 * ```ts
 * const keywordResults = [
 *   { id: '1', title: 'Doc 1', url: '/doc1', section_path: '/', snippet: '...', keyword_rank: 1 },
 *   { id: '2', title: 'Doc 2', url: '/doc2', section_path: '/', snippet: '...', keyword_rank: 2 }
 * ];
 * const vectorResults = [
 *   { id: '2', title: 'Doc 2', url: '/doc2', section_path: '/', snippet: '...', vector_rank: 1 },
 *   { id: '3', title: 'Doc 3', url: '/doc3', section_path: '/', snippet: '...', vector_rank: 2 }
 * ];
 * 
 * const fused = rrfFuse(keywordResults, vectorResults);
 * // Result: [
 * //   { id: '2', ..., keyword_rank: 2, vector_rank: 1, rrf_score: 1/61 + 1/61 = 0.0328 },
 * //   { id: '1', ..., keyword_rank: 1, vector_rank: undefined, rrf_score: 1/61 = 0.0164 },
 * //   { id: '3', ..., keyword_rank: undefined, vector_rank: 2, rrf_score: 1/62 = 0.0161 }
 * // ]
 * ```

/**
 * Base type for search results
 */
export type SearchResultBase = {
	id: string;
	title: string;
	url: string;
	section_path: string;
	snippet: string;
};

/**
 * Options for RRF fusion
 */
export type RRFOptions = {
	/**
	 * RRF constant (default: 60)
	 * Higher k reduces the impact of rank differences
	 */
	k?: number;
	/**
	 * Maximum number of results to return
	 * Default: max of keywordResults.length and vectorResults.length
	 */
	limit?: number;
};

/**
 * Fuses keyword and vector search results using Reciprocal Rank Fusion (RRF)
 * 
 * RRF Formula: rrf_score = sum(1/(k + rank)) for each ranking
 * - If a document appears in keyword results with rank r_k: add 1/(k + r_k)
 * - If a document appears in vector results with rank r_v: add 1/(k + r_v)
 * 
 * @param keywordResults - Results from keyword search with keyword_rank
 * @param vectorResults - Results from vector search with vector_rank
 * @param opts - Options for RRF (k constant and result limit)
 * @returns Fused results sorted by rrf_score (descending)
 */
export function rrfFuse<T extends SearchResultBase>(
	keywordResults: Array<T & { keyword_rank: number }>,
	vectorResults: Array<T & { vector_rank: number }>,
	opts: RRFOptions = {}
): Array<T & { keyword_rank?: number; vector_rank?: number; rrf_score: number }> {
	const k = opts.k ?? 60;
	// If limit is not provided, use max of input lengths as default
	// However, we need to know the total unique count, so we'll calculate after merging
	// For now, use a high number as effective "no limit" when not specified
	const limit = opts.limit;

	// Build a map of doc id -> merged result
	const resultMap = new Map<
		string,
		T & { keyword_rank?: number; vector_rank?: number; rrf_score: number }
	>();

	// Process keyword results
	for (const result of keywordResults) {
		const existing = resultMap.get(result.id);
		if (existing) {
			// Doc already exists (from vector results), merge ranks and snippet
			existing.keyword_rank = result.keyword_rank;
			// Prefer non-empty snippet
			if (!existing.snippet && result.snippet) {
				existing.snippet = result.snippet;
			}
		} else {
			// New doc, create entry
			resultMap.set(result.id, {
				...result,
				keyword_rank: result.keyword_rank,
				rrf_score: 0 // Will be calculated below
			});
		}
	}

	// Process vector results
	for (const result of vectorResults) {
		const existing = resultMap.get(result.id);
		if (existing) {
			// Doc already exists (from keyword results), merge ranks and snippet
			existing.vector_rank = result.vector_rank;
			// Prefer non-empty snippet
			if (!existing.snippet && result.snippet) {
				existing.snippet = result.snippet;
			}
		} else {
			// New doc, create entry
			resultMap.set(result.id, {
				...result,
				vector_rank: result.vector_rank,
				rrf_score: 0 // Will be calculated below
			});
		}
	}

	// Calculate RRF scores for all results
	for (const result of resultMap.values()) {
		let score = 0;

		// Add keyword contribution if present
		if (result.keyword_rank !== undefined) {
			score += 1 / (k + result.keyword_rank);
		}

		// Add vector contribution if present
		if (result.vector_rank !== undefined) {
			score += 1 / (k + result.vector_rank);
		}

		result.rrf_score = score;
	}

	// Convert map to array and sort by rrf_score (descending)
	const results = Array.from(resultMap.values()).sort((a, b) => b.rrf_score - a.rrf_score);

	// Apply limit if provided, otherwise use max of input lengths as default
	if (limit !== undefined) {
		return results.slice(0, limit);
	}
	
	// Default: max of input lengths
	const defaultLimit = Math.max(keywordResults.length, vectorResults.length);
	return results.slice(0, defaultLimit);
}

