#!/usr/bin/env node
/**
 * Chunking pipeline runner
 * 
 * Reads page records from pages.jsonl and generates chunk records in chunks.jsonl.
 * 
 * Usage:
 *   npx tsx transform/run.ts
 * 
 * Example chunk JSONL line:
 * {"id":"a1b2c3d4e5f6g7h8","url":"https://typesense.org/docs/0.11.0","title":"Typesense v[version]","section_path":"Typesense v[version] > What's new","content":"## What's new\n\nThis is a maintenance release...","source":"typesense-docs"}
 */

import { chunkPage, ChunkRecord } from './chunk.js';
import { PageRecord } from './chunk.js';
import { createReadStream } from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createInterface } from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const INPUT_PATH = join(__dirname, '../out/pages.jsonl');
const OUTPUT_PATH = join(__dirname, '../out/chunks.jsonl');

async function main() {
	try {
		console.log('📚 Starting chunking pipeline...\n');
		console.log(`📖 Input: ${INPUT_PATH}`);
		console.log(`📝 Output: ${OUTPUT_PATH}\n`);

		// Ensure output directory exists
		const outputDir = dirname(OUTPUT_PATH);
		await mkdir(outputDir, { recursive: true });

		// Create read stream for input
		const readStream = createReadStream(INPUT_PATH, { encoding: 'utf-8' });
		const rl = createInterface({
			input: readStream,
			crlfDelay: Infinity
		});

		let pagesProcessed = 0;
		let chunksWritten = 0;
		const outputLines: string[] = [];

		// Process each line (page record)
		for await (const line of rl) {
			const trimmedLine = line.trim();
			if (!trimmedLine) {
				continue;
			}

			try {
				const page: PageRecord = JSON.parse(trimmedLine);
				pagesProcessed++;

				// Generate chunks for this page
				const chunks = chunkPage(page);

				// Collect chunks for output (one JSON object per line)
				for (const chunk of chunks) {
					const jsonLine = JSON.stringify(chunk);
					outputLines.push(jsonLine);
					chunksWritten++;
				}

				// Log progress every 50 pages
				if (pagesProcessed % 50 === 0) {
					console.log(`   Processed ${pagesProcessed} pages, generated ${chunksWritten} chunks...`);
				}
			} catch (error) {
				console.error(
					`⚠️  Error processing page at line ${pagesProcessed + 1}: ${error instanceof Error ? error.message : String(error)}`
				);
				if (error instanceof Error && error.stack) {
					console.error(`   Stack: ${error.stack.split('\n').slice(0, 3).join('\n')}`);
				}
				// Continue processing other pages
			}
		}

		// Close readline interface
		rl.close();

		// Write all chunks to output file
		await writeFile(OUTPUT_PATH, outputLines.join('\n') + '\n', 'utf-8');

		console.log('\n📊 Chunking Summary:');
		console.log(`   Pages processed: ${pagesProcessed}`);
		console.log(`   Chunks written: ${chunksWritten}`);
		console.log(`   Average chunks per page: ${pagesProcessed > 0 ? (chunksWritten / pagesProcessed).toFixed(2) : 0}`);
		console.log(`\n📁 Output written to: ${OUTPUT_PATH}`);

		console.log('\n✅ Chunking completed successfully!');
		process.exit(0);
	} catch (error) {
		console.error('\n❌ Chunking failed:', error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}

main();

