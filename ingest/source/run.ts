#!/usr/bin/env node
/**
 * Local docs loader runner
 * 
 * Scans a local Typesense docs repository and writes normalized page records
 * to JSONL format for downstream processing.
 * 
 * Usage:
 *   npx tsx source/run.ts
 *   or
 *   npm run load-docs
 * 
 * Example JSONL line:
 * {"url":"https://typesense.org/docs/guide/installation","title":"Installation Guide","markdown":"# Installation Guide\n\n...","source":"typesense-docs","crawl_time":"2024-01-15T10:30:00.000Z"}
 */

import { loadLocalDocsPages } from './localDocs.js';
import { config } from '@repo/config';
import { writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const OUTPUT_PATH = join(__dirname, '../out/pages.jsonl');

async function main() {
	try {
		console.log('📚 Starting local docs loading...\n');

		// Load docs from local repository
		const pages = await loadLocalDocsPages();

		if (pages.length === 0) {
			console.error('❌ No pages were loaded. Please check DOCS_REPO_PATH configuration.');
			process.exit(1);
		}

		// Ensure output directory exists
		const outputDir = dirname(OUTPUT_PATH);
		await mkdir(outputDir, { recursive: true });

		// Write JSONL output (one JSON object per line)
		console.log(`\n📝 Writing ${pages.length} pages to ${OUTPUT_PATH}...`);
		const lines = pages.map(page => JSON.stringify(page));
		await writeFile(OUTPUT_PATH, lines.join('\n') + '\n', 'utf-8');

		console.log(`\n✅ Successfully wrote ${pages.length} pages`);
		console.log(`📁 Output path: ${OUTPUT_PATH}`);
		
		console.log('\n✅ Docs loading completed successfully!');
		process.exit(0);
	} catch (error) {
		console.error('\n❌ Docs loading failed:', error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}

main();
