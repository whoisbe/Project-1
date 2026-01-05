#!/usr/bin/env node
/**
 * Firecrawl runner for Typesense documentation
 * 
 * Usage:
 *   tsx ingest/crawl/run.ts
 *   or
 *   node --loader tsx ingest/crawl/run.ts
 */

import { crawlDocs } from './firecrawl.js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const OUTPUT_PATH = join(__dirname, '../out/pages.jsonl');

async function main() {
	try {
		console.log('🌐 Starting Firecrawl documentation crawl...\n');

		const stats = await crawlDocs(OUTPUT_PATH);

		console.log('\n📊 Crawl Summary:');
		console.log(`   Total pages: ${stats.total}`);
		console.log(`   ✅ Success: ${stats.success}`);
		console.log(`   ⚠️  Skipped: ${stats.skipped}`);
		console.log(`   ❌ Failed: ${stats.failed}`);
		console.log(`\n📁 Output written to: ${OUTPUT_PATH}`);

		if (stats.success > 0) {
			console.log('\n✅ Crawl completed successfully!');
			process.exit(0);
		} else {
			console.log('\n⚠️  No pages were successfully crawled.');
			process.exit(1);
		}
	} catch (error) {
		console.error('\n❌ Crawl failed:', error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}

main();

