/**
 * Runner script for indexing embedded chunks into Typesense
 * 
 * Usage: npx tsx index/run.ts [--batch-size=100] [--input-file=path/to/chunks_embedded.jsonl] [--debug]
 */

import { indexChunks } from './typesense.js';
import { dropDocsChunksCollection, ensureDocsChunksCollection } from '../typesense/client.js';

const DEFAULT_BATCH_SIZE = 100;

function parseArgs(): { batchSize: number; inputFile?: string; debug: boolean } {
	const args = process.argv.slice(2);
	let batchSize = DEFAULT_BATCH_SIZE;
	let inputFile: string | undefined;
	let debug = false;

	for (const arg of args) {
		if (arg.startsWith('--batch-size=')) {
			const value = parseInt(arg.split('=')[1], 10);
			if (!isNaN(value) && value > 0) {
				batchSize = value;
			} else {
				console.warn(`Invalid batch size: ${arg.split('=')[1]}, using default ${DEFAULT_BATCH_SIZE}`);
			}
		} else if (arg.startsWith('--input-file=')) {
			inputFile = arg.split('=')[1];
		} else if (arg === '--debug') {
			debug = true;
		} else if (arg === '--help' || arg === '-h') {
			console.log(`
Usage: npx tsx index/run.ts [options]

Options:
  --batch-size=N     Number of documents per batch (default: ${DEFAULT_BATCH_SIZE})
  --input-file=PATH  Path to chunks_embedded.jsonl (default: ingest/out/chunks_embedded.jsonl)
  --debug            Enable debug mode (logs first document payload)
  --help, -h         Show this help message

Example:
  npx tsx index/run.ts --batch-size=50 --debug
			`);
			process.exit(0);
		}
	}

	return { batchSize, inputFile, debug };
}

async function main() {
	try {
		const { batchSize, inputFile, debug } = parseArgs();

		console.log('='.repeat(60));
		console.log('Typesense Indexing');
		console.log('='.repeat(60));
		console.log(`Batch size: ${batchSize}`);
		if (inputFile) {
			console.log(`Input file: ${inputFile}`);
		}
		if (debug) {
			console.log(`Debug mode: enabled`);
		}
		console.log('');

		// Drop and recreate collection before indexing (schema changes require recreation)
		console.log('Dropping existing collection...');
		const { dropped } = await dropDocsChunksCollection();
		console.log(dropped ? 'Collection dropped.' : 'Collection did not exist.');
		console.log('');

		console.log('Creating collection with updated schema...');
		const { created } = await ensureDocsChunksCollection();
		if (created) {
			console.log('Collection created successfully.');
		} else {
			console.log('Collection already exists (this should not happen after dropping).');
		}
		console.log('');

		const startTime = Date.now();
		const stats = await indexChunks({ batchSize, inputFile, debug });
		const duration = (Date.now() - startTime) / 1000;

		console.log('');
		console.log('='.repeat(60));
		console.log('Indexing Summary');
		console.log('='.repeat(60));
		console.log(`Total lines read:     ${stats.totalRead}`);
		console.log(`Successfully indexed:  ${stats.successfullyIndexed}`);
		console.log(`Failed to index:      ${stats.failedIndexed}`);
		console.log(`Skipped (invalid):    ${stats.skippedInvalid}`);
		console.log(`Duration:             ${duration.toFixed(2)}s`);
		
		if (stats.successfullyIndexed > 0) {
			const rate = (stats.successfullyIndexed / duration).toFixed(2);
			console.log(`Indexing rate:        ${rate} docs/s`);
		}

		if (stats.failureSamples.length > 0) {
			console.log('');
			console.log('Sample failures:');
			for (const failure of stats.failureSamples) {
				console.log(`  Line ${failure.line}: ${failure.reason}`);
				if (failure.data) {
					console.log(`    Data: ${JSON.stringify(failure.data).substring(0, 100)}`);
				}
			}
		}

		console.log('='.repeat(60));

		// Exit with error code if there were failures
		if (stats.failedIndexed > 0 || stats.skippedInvalid > 0) {
			process.exit(1);
		}
	} catch (error) {
		console.error('Fatal error during indexing:');
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}

main();

