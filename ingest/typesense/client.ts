/**
 * Typesense client wrapper and collection bootstrap utilities
 * 
 * Provides:
 * - getTypesenseClient() - Constructs and returns a Typesense client instance
 * - ensureDocsChunksCollection() - Ensures the docs_chunks collection exists
 * - dropDocsChunksCollection() - Drops the docs_chunks collection
 * - upsertDocsChunks() - Bulk upsert documents into docs_chunks collection
 */

import Typesense from 'typesense';
import { config } from '@repo/config';
import { docsChunksSchema, DOCS_CHUNKS_COLLECTION } from './schema.js';

/**
 * Typesense client instance (singleton pattern)
 */
let clientInstance: Typesense.Client | null = null;

/**
 * Constructs and returns a Typesense client instance.
 * Uses singleton pattern to reuse the same client across calls.
 * 
 * Configuration is loaded from @repo/config:
 * - host: TYPESENSE_HOST
 * - port: TYPESENSE_PORT
 * - protocol: TYPESENSE_PROTOCOL
 * - apiKey: TYPESENSE_API_KEY
 * 
 * @returns {Typesense.Client} Configured Typesense client
 * @throws {Error} If configuration is invalid or client creation fails
 */
export function getTypesenseClient(): Typesense.Client {
	if (clientInstance) {
		return clientInstance;
	}

	try {
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
	} catch (error) {
		const errorMessage = error instanceof Error 
			? error.message 
			: 'Unknown error occurred while creating Typesense client';

		throw new Error(
			`Failed to create Typesense client: ${errorMessage}. ` +
			`Please check your Typesense configuration (host, port, protocol, apiKey).`
		);
	}
}

/**
 * Ensures the docs_chunks collection exists in Typesense.
 * 
 * Checks if the collection exists, and if not, creates it using
 * the schema defined in ingest/typesense/schema.ts.
 * 
 * @returns {Promise<{ created: boolean }>} Object indicating whether the collection was created
 * @throws {Error} If there's an authentication, connection, or schema error
 */
export async function ensureDocsChunksCollection(): Promise<{ created: boolean }> {
	const client = getTypesenseClient();

	try {
		// Check if collection exists
		try {
			await client.collections(DOCS_CHUNKS_COLLECTION).retrieve();
			// Collection exists
			return { created: false };
		} catch (error: any) {
			// If error is 404, collection doesn't exist - we'll create it
			if (error?.httpStatus === 404) {
				// Collection doesn't exist, create it
				try {
					await client.collections().create(docsChunksSchema);
					return { created: true };
				} catch (createError: any) {
					const errorMessage = createError?.message || 'Unknown error';
					const httpStatus = createError?.httpStatus;

					if (httpStatus === 401 || httpStatus === 403) {
						throw new Error(
							`Authentication failed while creating collection: ${errorMessage}. ` +
							`Please check your TYPESENSE_API_KEY.`
						);
					}

					if (httpStatus === 400) {
						throw new Error(
							`Invalid schema while creating collection: ${errorMessage}. ` +
							`Please check the docsChunksSchema definition.`
						);
					}

					throw new Error(
						`Failed to create collection '${DOCS_CHUNKS_COLLECTION}': ${errorMessage}`
					);
				}
			}

			// For other errors (connection, auth, etc.), re-throw with context
			const errorMessage = error?.message || 'Unknown error';
			const httpStatus = error?.httpStatus;

			if (httpStatus === 401 || httpStatus === 403) {
				throw new Error(
					`Authentication failed while checking collection: ${errorMessage}. ` +
					`Please check your TYPESENSE_API_KEY.`
				);
			}

			if (error?.message?.includes('ECONNREFUSED') || error?.message?.includes('ENOTFOUND')) {
				throw new Error(
					`Connection failed to Typesense server at ${config.typesense.protocol}://${config.typesense.host}:${config.typesense.port}. ` +
					`Please check that Typesense is running and TYPESENSE_HOST/TYPESENSE_PORT are correct.`
				);
			}

			throw new Error(
				`Failed to check collection '${DOCS_CHUNKS_COLLECTION}': ${errorMessage}`
			);
		}
	} catch (error) {
		// Re-throw our custom errors as-is
		if (error instanceof Error) {
			throw error;
		}

		// Wrap unexpected errors
		throw new Error(
			`Unexpected error in ensureDocsChunksCollection: ${String(error)}`
		);
	}
}

/**
 * Drops the docs_chunks collection from Typesense.
 * 
 * @returns {Promise<{ dropped: boolean }>} Object indicating whether the collection was dropped
 * @throws {Error} If there's an authentication or connection error
 */
export async function dropDocsChunksCollection(): Promise<{ dropped: boolean }> {
	const client = getTypesenseClient();

	try {
		// Try to delete the collection
		try {
			await client.collections(DOCS_CHUNKS_COLLECTION).delete();
			return { dropped: true };
		} catch (error: any) {
			// If error is 404, collection doesn't exist
			if (error?.httpStatus === 404) {
				return { dropped: false };
			}

			// For other errors, re-throw with context
			const errorMessage = error?.message || 'Unknown error';
			const httpStatus = error?.httpStatus;

			if (httpStatus === 401 || httpStatus === 403) {
				throw new Error(
					`Authentication failed while dropping collection: ${errorMessage}. ` +
					`Please check your TYPESENSE_API_KEY.`
				);
			}

			if (error?.message?.includes('ECONNREFUSED') || error?.message?.includes('ENOTFOUND')) {
				throw new Error(
					`Connection failed to Typesense server at ${config.typesense.protocol}://${config.typesense.host}:${config.typesense.port}. ` +
					`Please check that Typesense is running and TYPESENSE_HOST/TYPESENSE_PORT are correct.`
				);
			}

			throw new Error(
				`Failed to drop collection '${DOCS_CHUNKS_COLLECTION}': ${errorMessage}`
			);
		}
	} catch (error) {
		// Re-throw our custom errors as-is
		if (error instanceof Error) {
			throw error;
		}

		// Wrap unexpected errors
		throw new Error(
			`Unexpected error in dropDocsChunksCollection: ${String(error)}`
		);
	}
}

/**
 * Bulk upsert documents into the docs_chunks collection.
 * 
 * Uses Typesense's import API with action=upsert to efficiently
 * insert or update multiple documents in a single operation.
 * 
 * @param {Array<Record<string, any>>} docs - Array of documents to upsert
 * @returns {Promise<{ success: number; failed: number; rawResponseLines: string[] }>}
 *   Object containing success/failure counts and raw response lines for debugging
 * @throws {Error} If there's an authentication, connection, or validation error
 */
export async function upsertDocsChunks(
	docs: Array<Record<string, any>>
): Promise<{ success: number; failed: number; rawResponseLines: string[] }> {
	const client = getTypesenseClient();

	if (!Array.isArray(docs) || docs.length === 0) {
		throw new Error('docs must be a non-empty array');
	}

	try {
		// Use Typesense import API with action=upsert
		const importResults = await client
			.collections(DOCS_CHUNKS_COLLECTION)
			.documents()
			.import(docs, { action: 'upsert' });

		// Parse the import results
		// Typesense import API returns newline-delimited JSON (NDJSON) as a string
		// Handle both string and array responses
		let rawResponseLines: string[] = [];
		
		if (typeof importResults === 'string') {
			rawResponseLines = importResults.split('\n').filter((line: string) => line.trim() !== '');
		} else if (Array.isArray(importResults)) {
			// If it's already an array, convert each item to a JSON string
			rawResponseLines = importResults.map((item: any) => JSON.stringify(item));
		} else {
			// If it's an object or something else, try to stringify it
			rawResponseLines = [JSON.stringify(importResults)];
		}
		
		let success = 0;
		let failed = 0;

		for (const line of rawResponseLines) {
			try {
				const result = JSON.parse(line);
				if (result.success === true || result.success === undefined) {
					success++;
				} else {
					failed++;
				}
			} catch {
				// If line is not valid JSON, count as failed
				failed++;
			}
		}

		return {
			success,
			failed,
			rawResponseLines
		};
	} catch (error: any) {
		const errorMessage = error?.message || 'Unknown error';
		const httpStatus = error?.httpStatus;

		if (httpStatus === 401 || httpStatus === 403) {
			throw new Error(
				`Authentication failed while upserting documents: ${errorMessage}. ` +
				`Please check your TYPESENSE_API_KEY.`
			);
		}

		if (httpStatus === 404) {
			throw new Error(
				`Collection '${DOCS_CHUNKS_COLLECTION}' not found. ` +
				`Please ensure the collection exists by calling ensureDocsChunksCollection() first.`
			);
		}

		if (httpStatus === 400) {
			throw new Error(
				`Invalid document schema while upserting: ${errorMessage}. ` +
				`Please check that documents match the docsChunksSchema definition.`
			);
		}

		if (error?.message?.includes('ECONNREFUSED') || error?.message?.includes('ENOTFOUND')) {
			throw new Error(
				`Connection failed to Typesense server at ${config.typesense.protocol}://${config.typesense.host}:${config.typesense.port}. ` +
				`Please check that Typesense is running and TYPESENSE_HOST/TYPESENSE_PORT are correct.`
			);
		}

		throw new Error(
			`Failed to upsert documents: ${errorMessage}`
		);
	}
}

