/**
 * Cohere reranker adapter
 * 
 * Implements the Reranker interface using Cohere's rerank API.
 * Handles authentication, rate limiting, and error cases.
 */

import type { Reranker, RerankCandidate, RerankResult } from './types.js';
import { config } from '@repo/config';

/**
 * Cohere API endpoint for reranking
 */
const COHERE_RERANK_URL = 'https://api.cohere.ai/v1/rerank';

/**
 * Maximum number of retries for 429 (rate limit) errors
 */
const MAX_RETRIES = 3;

/**
 * Base delay in milliseconds for exponential backoff
 */
const BASE_DELAY_MS = 1000;

/**
 * Maximum delay cap in milliseconds (small cap as requested)
 */
const MAX_DELAY_MS = 5000;

/**
 * Request timeout in milliseconds
 */
const REQUEST_TIMEOUT_MS = 30000;

/**
 * Sleep utility for exponential backoff
 */
function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Creates a compact, deterministic text representation for reranking
 * Format: `${title}\n${section_path}\n${snippet}`
 */
function createRerankText(candidate: RerankCandidate): string {
	return `${candidate.title}\n${candidate.section_path}\n${candidate.snippet}`;
}

/**
 * Fetches with timeout support
 */
async function fetchWithTimeout(
	url: string,
	options: RequestInit,
	timeoutMs: number
): Promise<Response> {
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

	try {
		const response = await fetch(url, {
			...options,
			signal: controller.signal
		});
		clearTimeout(timeoutId);
		return response;
	} catch (error: any) {
		clearTimeout(timeoutId);
		if (error.name === 'AbortError') {
			throw new Error(`Rerank request timed out after ${timeoutMs}ms`);
		}
		throw error;
	}
}

/**
 * Cohere reranker implementation
 */
export class CohereReranker implements Reranker {
	private apiKey: string;
	private model: string;

	constructor(apiKey: string, model: string) {
		if (!apiKey || !model) {
			throw new Error('CohereReranker requires apiKey and model');
		}
		this.apiKey = apiKey;
		this.model = model;
	}

	async rerank(query: string, candidates: RerankCandidate[]): Promise<RerankResult[]> {
		if (candidates.length === 0) {
			return [];
		}

		// Create documents array for Cohere API
		const documents = candidates.map(createRerankText);

		// Prepare request body
		const requestBody = {
			model: this.model,
			query,
			documents,
			top_n: candidates.length // Return all candidates, reordered
		};

		// Retry logic for 429 errors with exponential backoff
		let lastError: Error | null = null;
		for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
			try {
				const response = await fetchWithTimeout(
					COHERE_RERANK_URL,
					{
						method: 'POST',
						headers: {
							'Content-Type': 'application/json',
							'Authorization': `Bearer ${this.apiKey}`
						},
						body: JSON.stringify(requestBody)
					},
					REQUEST_TIMEOUT_MS
				);

				// Handle HTTP errors
				if (!response.ok) {
					const status = response.status;
					const statusText = response.statusText;
					
					// Try to get error message from response body
					let errorMessage = `HTTP ${status}: ${statusText}`;
					try {
						const errorBody = await response.json();
						if (errorBody.message) {
							errorMessage = errorBody.message;
						}
					} catch {
						// Ignore JSON parse errors
					}

					// Handle specific error cases
					if (status === 401) {
						throw new Error(
							`Cohere API authentication failed (401): ${errorMessage}. ` +
							`Please check your COHERE_API_KEY.`
						);
					}

					if (status === 429) {
						// Rate limit - retry with exponential backoff
						if (attempt < MAX_RETRIES) {
							const delay = Math.min(
								BASE_DELAY_MS * Math.pow(2, attempt),
								MAX_DELAY_MS
							);
							await sleep(delay);
							continue; // Retry
						} else {
							throw new Error(
								`Cohere API rate limit exceeded (429): ${errorMessage}. ` +
								`Retried ${MAX_RETRIES} times with exponential backoff.`
							);
						}
					}

					// Other HTTP errors
					throw new Error(
						`Cohere rerank API error (${status}): ${errorMessage}`
					);
				}

				// Parse successful response
				const data = await response.json();
				
				if (!data.results || !Array.isArray(data.results)) {
					throw new Error(
						'Invalid response from Cohere API: missing or invalid results array'
					);
				}

				// Map Cohere results back to our candidates with scores
				// Cohere returns results in order of relevance with index and relevance_score
				const rerankedResults: RerankResult[] = data.results.map((result: any) => {
					const index = result.index;
					const score = result.relevance_score ?? 0;
					const candidate = candidates[index];

					if (!candidate) {
						throw new Error(
							`Cohere API returned invalid index ${index} (candidates length: ${candidates.length})`
						);
					}

					return {
						...candidate,
						rerank_score: score
					};
				});

				return rerankedResults;

			} catch (error: any) {
				lastError = error;

				// Don't retry on non-429 errors
				if (error.message && !error.message.includes('429')) {
					throw error;
				}

				// For 429 errors, continue to retry loop
				if (attempt === MAX_RETRIES) {
					throw error;
				}
			}
		}

		// Should never reach here, but TypeScript needs this
		throw lastError || new Error('Failed to rerank candidates');
	}
}

/**
 * Creates a Cohere reranker instance using config
 */
export function createCohereReranker(): CohereReranker {
	const { cohereApiKey, cohereRerankModel } = config.reranker;
	return new CohereReranker(cohereApiKey, cohereRerankModel);
}

