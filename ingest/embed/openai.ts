/**
 * OpenAI embeddings client with batching, rate limiting, and retry logic
 */

import OpenAI from 'openai';
import { config } from '@repo/config';

/**
 * Configuration for embedding requests
 */
export interface EmbeddingConfig {
	model: string;
	batchSize: number;
	maxRetries: number;
	initialRetryDelay: number; // milliseconds
	maxRetryDelay: number; // milliseconds
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: EmbeddingConfig = {
	model: config.openai.embedModel || 'text-embedding-3-small',
	batchSize: 100, // OpenAI allows up to 2048 inputs per request, but we'll batch smaller for rate limits
	maxRetries: 3,
	initialRetryDelay: 1000, // 1 second
	maxRetryDelay: 60000 // 60 seconds
};

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate exponential backoff delay
 */
function calculateBackoffDelay(attempt: number, initialDelay: number, maxDelay: number): number {
	const delay = initialDelay * Math.pow(2, attempt);
	return Math.min(delay, maxDelay);
}

/**
 * Check if error is retryable
 */
function isRetryableError(error: any): boolean {
	// Rate limit errors (429)
	if (error?.status === 429) {
		return true;
	}
	
	// Server errors (5xx)
	if (error?.status >= 500 && error?.status < 600) {
		return true;
	}
	
	// Network errors
	if (error?.code === 'ECONNRESET' || error?.code === 'ETIMEDOUT' || error?.code === 'ENOTFOUND') {
		return true;
	}
	
	return false;
}

/**
 * OpenAI embeddings client wrapper
 */
export class EmbeddingClient {
	private client: OpenAI;
	private config: EmbeddingConfig;

	constructor(customConfig?: Partial<EmbeddingConfig>) {
		this.client = new OpenAI({
			apiKey: config.openai.apiKey
		});
		this.config = { ...DEFAULT_CONFIG, ...customConfig };
	}

	/**
	 * Embed a single text
	 */
	async embedText(text: string): Promise<number[]> {
		const result = await this.embedBatch([text]);
		return result[0];
	}

	/**
	 * Embed a batch of texts with retry logic
	 */
	async embedBatch(texts: string[]): Promise<number[][]> {
		if (texts.length === 0) {
			return [];
		}

		let lastError: any;
		
		for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
			try {
				const response = await this.client.embeddings.create({
					model: this.config.model,
					input: texts
				});

				return response.data.map(item => item.embedding);
			} catch (error: any) {
				lastError = error;
				
				// If not retryable, throw immediately
				if (!isRetryableError(error)) {
					throw error;
				}

				// If this was the last attempt, throw
				if (attempt === this.config.maxRetries) {
					throw error;
				}

				// Calculate backoff delay
				const delay = calculateBackoffDelay(
					attempt,
					this.config.initialRetryDelay,
					this.config.maxRetryDelay
				);

				// If it's a rate limit error, check for retry-after header
				if (error?.status === 429) {
					const retryAfter = error?.response?.headers?.['retry-after'];
					if (retryAfter) {
						const retryAfterMs = parseInt(retryAfter, 10) * 1000;
						console.warn(`Rate limited. Retrying after ${retryAfterMs}ms (attempt ${attempt + 1}/${this.config.maxRetries + 1})`);
						await sleep(retryAfterMs);
						continue;
					}
				}

				console.warn(`Embedding request failed. Retrying in ${delay}ms (attempt ${attempt + 1}/${this.config.maxRetries + 1})`);
				await sleep(delay);
			}
		}

		throw lastError;
	}

	/**
	 * Get batch size configuration
	 */
	getBatchSize(): number {
		return this.config.batchSize;
	}
}

