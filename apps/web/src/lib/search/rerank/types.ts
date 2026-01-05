/**
 * Type definitions for reranking system
 */

/**
 * Input candidate for reranking
 */
export type RerankCandidate = {
	id: string;
	title: string;
	section_path: string;
	snippet: string;
	url: string;
};

/**
 * Reranked result with relevance score
 */
export type RerankResult = RerankCandidate & {
	rerank_score: number;
};

/**
 * Reranker interface - provider-agnostic contract
 */
export interface Reranker {
	/**
	 * Reranks candidates based on query relevance
	 * 
	 * @param query - User search query
	 * @param candidates - Array of candidates to rerank
	 * @returns Promise resolving to reranked candidates with scores
	 */
	rerank(query: string, candidates: RerankCandidate[]): Promise<RerankResult[]>;
}

