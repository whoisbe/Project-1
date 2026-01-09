/**
 * Embedding stage: Generate embeddings for chunks
 * 
 * Input: ingest/out/chunks.jsonl
 * Output: ingest/out/chunks_embedded.jsonl
 * 
 * Each output line is the original chunk record plus:
 *   embedding: number[]  // length 1536 for text-embedding-3-small
 * 
 * Example output line:
 * {
 *   "id": "d6ce23171c8e09b2",
 *   "url": "https://typesense.org/docs/0.11.0",
 *   "title": "Typesense v[version]",
 *   "section_path": "Typesense v[version]",
 *   "content": "# Typesense v[version]\n\n...",
 *   "source": "typesense-docs",
 *   "embedding": [0.123, -0.456, ...]  // 1536 dimensions
 * }
 */

import { createReadStream, createWriteStream, existsSync } from 'fs';
import { createInterface } from 'readline';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { EmbeddingClient } from './openai.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Paths
const INPUT_FILE = resolve(__dirname, '../out/chunks.jsonl');
const OUTPUT_FILE = resolve(__dirname, '../out/chunks_embedded.jsonl');

// Configuration
const BATCH_SIZE = parseInt(process.env.EMBED_BATCH_SIZE || '100', 10);

interface ChunkRecord {
	id: string;
	url: string;
	title: string;
	section_path: string;
	content: string;
	source: string;
	tags?: string[];
	docs_version?: number; // numeric version score, or 0 if unversioned
}

interface EmbeddedChunkRecord extends ChunkRecord {
	embedding: number[];
}

/**
 * Load already embedded chunk IDs from output file (for resume support)
 */
async function loadExistingIds(outputPath: string): Promise<Set<string>> {
	const existingIds = new Set<string>();
	
	if (!existsSync(outputPath)) {
		return existingIds;
	}

	const fileStream = createReadStream(outputPath);
	const rl = createInterface({
		input: fileStream,
		crlfDelay: Infinity
	});

	for await (const line of rl) {
		if (line.trim()) {
			try {
				const record = JSON.parse(line) as EmbeddedChunkRecord;
				if (record.id && record.embedding) {
					existingIds.add(record.id);
				}
			} catch (error) {
				// Skip malformed lines
				console.warn(`Skipping malformed line in output file: ${line.substring(0, 50)}...`);
			}
		}
	}

	return existingIds;
}

/**
 * Process chunks and generate embeddings
 */
async function main() {
	console.log('Starting embedding stage...');
	console.log(`Input: ${INPUT_FILE}`);
	console.log(`Output: ${OUTPUT_FILE}`);
	console.log(`Batch size: ${BATCH_SIZE}`);

	// Load existing embedded IDs and chunks for resume support
	const existingIds = await loadExistingIds(OUTPUT_FILE);
	const existingChunks = new Map<string, string>();
	
	if (existsSync(OUTPUT_FILE)) {
		const fileStream = createReadStream(OUTPUT_FILE);
		const rl = createInterface({
			input: fileStream,
			crlfDelay: Infinity
		});

		for await (const line of rl) {
			if (line.trim()) {
				try {
					const record = JSON.parse(line) as EmbeddedChunkRecord;
					if (record.id && record.embedding) {
						existingChunks.set(record.id, line);
					}
				} catch (error) {
					// Skip malformed lines
				}
			}
		}
	}
	
	console.log(`Found ${existingIds.size} already embedded chunks (will skip)`);

	// Initialize embedding client
	const client = new EmbeddingClient({ batchSize: BATCH_SIZE });

	// Open input file
	const inputStream = createReadStream(INPUT_FILE);
	const rl = createInterface({
		input: inputStream,
		crlfDelay: Infinity
	});

	// Open output file (overwrite, but we'll write existing chunks first)
	const outputStream = createWriteStream(OUTPUT_FILE, { flags: 'w' });
	
	// Write existing chunks first (for resume support)
	for (const [id, line] of existingChunks) {
		outputStream.write(line + '\n');
	}

	// Statistics
	let totalChunks = 0;
	let skippedChunks = 0;
	let processedChunks = 0;
	let errorCount = 0;

	// Batch processing
	let batch: { chunk: ChunkRecord; line: string }[] = [];

	/**
	 * Process current batch
	 */
	async function processBatch() {
		if (batch.length === 0) {
			return;
		}

		const texts = batch.map(item => item.chunk.content);
		
		try {
			const embeddings = await client.embedBatch(texts);
			
			// Write embedded chunks to output
			for (let i = 0; i < batch.length; i++) {
				const embeddedChunk: EmbeddedChunkRecord = {
					...batch[i].chunk,
					embedding: embeddings[i]
				};
				
				outputStream.write(JSON.stringify(embeddedChunk) + '\n');
				processedChunks++;
			}

			// Log progress
			if (processedChunks % 100 === 0) {
				console.log(`Processed ${processedChunks} chunks...`);
			}
		} catch (error: any) {
			console.error(`Error processing batch of ${batch.length} chunks:`, error.message);
			errorCount += batch.length;
			
			// Write error info to console but continue
			for (const item of batch) {
				console.error(`Failed to embed chunk ${item.chunk.id}: ${item.chunk.title}`);
			}
		}

		batch = [];
	}

	// Process input line by line
	for await (const line of rl) {
		if (!line.trim()) {
			continue;
		}

		totalChunks++;

		try {
			const chunk = JSON.parse(line) as ChunkRecord;

			// Skip if already embedded
			if (existingIds.has(chunk.id)) {
				skippedChunks++;
				continue;
			}

			// Validate chunk has required fields
			if (!chunk.id || !chunk.content) {
				console.warn(`Skipping invalid chunk (missing id or content): ${line.substring(0, 50)}...`);
				errorCount++;
				continue;
			}

			// Add to batch
			batch.push({ chunk, line });

			// Process batch when it reaches batch size
			if (batch.length >= BATCH_SIZE) {
				await processBatch();
			}
		} catch (error: any) {
			console.error(`Error parsing chunk line: ${error.message}`);
			console.error(`Line: ${line.substring(0, 100)}...`);
			errorCount++;
		}
	}

	// Process remaining batch
	if (batch.length > 0) {
		await processBatch();
	}

	// Close streams
	outputStream.end();

	// Final statistics
	console.log('\n=== Embedding Complete ===');
	console.log(`Total chunks: ${totalChunks}`);
	console.log(`Skipped (already embedded): ${skippedChunks}`);
	console.log(`Processed: ${processedChunks}`);
	console.log(`Errors: ${errorCount}`);
	console.log(`Output: ${OUTPUT_FILE}`);
}

// Run main
main().catch(error => {
	console.error('Fatal error:', error);
	process.exit(1);
});

