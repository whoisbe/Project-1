/**
 * Typesense indexing utilities
 * 
 * Provides functions to index embedded chunks into Typesense collection.
 */

import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ensureDocsChunksCollection, upsertDocsChunks } from '../typesense/client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const REQUIRED_FIELDS = ['id', 'url', 'title', 'section_path', 'content', 'source'] as const;
const EMBEDDING_DIMENSION = 1536;

export interface IndexingStats {
	totalRead: number;
	successfullyIndexed: number;
	failedIndexed: number;
	skippedInvalid: number;
	failureSamples: Array<{ line: number; reason: string; data?: any }>;
}

export interface IndexingOptions {
	batchSize?: number;
	inputFile?: string;
}

/**
 * Validates a chunk document before indexing.
 * 
 * @param doc - Document to validate
 * @returns Validation result with isValid flag and optional error message
 */
function validateChunk(doc: any): { isValid: boolean; error?: string } {
	// Check required fields
	for (const field of REQUIRED_FIELDS) {
		if (!(field in doc) || doc[field] === null || doc[field] === undefined) {
			return {
				isValid: false,
				error: `Missing required field: ${field}`
			};
		}
	}

	// Check embedding exists and is valid
	if (!doc.embedding) {
		return {
			isValid: false,
			error: 'Missing embedding field'
		};
	}

	if (!Array.isArray(doc.embedding)) {
		return {
			isValid: false,
			error: 'Embedding must be an array'
		};
	}

	if (doc.embedding.length !== EMBEDDING_DIMENSION) {
		return {
			isValid: false,
			error: `Embedding must have ${EMBEDDING_DIMENSION} dimensions, got ${doc.embedding.length}`
		};
	}

	// Validate embedding contains numbers
	for (let i = 0; i < doc.embedding.length; i++) {
		if (typeof doc.embedding[i] !== 'number' || !isFinite(doc.embedding[i])) {
			return {
				isValid: false,
				error: `Embedding contains invalid value at index ${i}`
			};
		}
	}

	return { isValid: true };
}

/**
 * Indexes embedded chunks from a JSONL file into Typesense.
 * 
 * @param options - Indexing options (batch size, input file path)
 * @returns Promise resolving to indexing statistics
 */
export async function indexChunks(
	options: IndexingOptions = {}
): Promise<IndexingStats> {
	const {
		batchSize = 100,
		inputFile = resolve(__dirname, '../out/chunks_embedded.jsonl')
	} = options;

	const stats: IndexingStats = {
		totalRead: 0,
		successfullyIndexed: 0,
		failedIndexed: 0,
		skippedInvalid: 0,
		failureSamples: []
	};

	// Ensure collection exists
	console.log('Ensuring docs_chunks collection exists...');
	const { created } = await ensureDocsChunksCollection();
	console.log(created ? 'Collection created.' : 'Collection already exists.');

	// Read file line by line
	const fileStream = createReadStream(inputFile);
	const rl = createInterface({
		input: fileStream,
		crlfDelay: Infinity
	});

	let batch: Array<Record<string, any>> = [];
	let lineNumber = 0;

	console.log(`Starting indexing from ${inputFile}...`);
	console.log(`Batch size: ${batchSize}`);

	for await (const line of rl) {
		lineNumber++;
		stats.totalRead++;

		// Skip empty lines
		if (!line.trim()) {
			continue;
		}

		let doc: any;
		try {
			doc = JSON.parse(line);
		} catch (error) {
			stats.skippedInvalid++;
			if (stats.failureSamples.length < 5) {
				stats.failureSamples.push({
					line: lineNumber,
					reason: `Invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
					data: line.substring(0, 100) // First 100 chars for debugging
				});
			}
			continue;
		}

		// Validate chunk
		const validation = validateChunk(doc);
		if (!validation.isValid) {
			stats.skippedInvalid++;
			if (stats.failureSamples.length < 5) {
				stats.failureSamples.push({
					line: lineNumber,
					reason: validation.error || 'Unknown validation error',
					data: { id: doc.id, url: doc.url }
				});
			}
			continue;
		}

		// Add to batch
		batch.push(doc);

		// Process batch when full
		if (batch.length >= batchSize) {
			await processBatch(batch, stats);
			batch = []; // Clear batch after processing
			
			process.stdout.write(`\rProcessed ${stats.totalRead} lines, indexed ${stats.successfullyIndexed} documents...`);
		}
	}

	// Process remaining batch
	if (batch.length > 0) {
		await processBatch(batch, stats);
	}

	fileStream.close();
	console.log(''); // New line after progress indicator

	return stats;
}

/**
 * Processes a batch of documents by upserting them to Typesense.
 * 
 * @param batch - Array of documents to upsert
 * @param stats - Statistics object to update
 */
async function processBatch(
	batch: Array<Record<string, any>>,
	stats: IndexingStats
): Promise<void> {
	try {
		const result = await upsertDocsChunks(batch);
		
		stats.successfullyIndexed += result.success;
		stats.failedIndexed += result.failed;

		// Collect failure samples from Typesense response
		if (result.failed > 0 && stats.failureSamples.length < 5) {
			for (const responseLine of result.rawResponseLines) {
				try {
					const parsed = JSON.parse(responseLine);
					if (parsed.success === false) {
						stats.failureSamples.push({
							line: -1, // Unknown line number from batch
							reason: parsed.error || 'Typesense upsert failed',
							data: parsed
						});
						if (stats.failureSamples.length >= 5) break;
					}
				} catch {
					// Ignore parse errors in response lines
				}
			}
		}
	} catch (error) {
		// Batch-level error (connection, auth, etc.)
		stats.failedIndexed += batch.length;
		
		if (stats.failureSamples.length < 5) {
			stats.failureSamples.push({
				line: -1,
				reason: error instanceof Error ? error.message : String(error),
				data: { batchSize: batch.length }
			});
		}
	}
}

