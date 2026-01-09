/**
 * Utility script to drop and recreate the docs_chunks collection
 * 
 * This is useful when the schema changes (e.g., adding vector_query support).
 * 
 * Usage: npx tsx typesense/reset-collection.ts
 */

import { dropDocsChunksCollection, ensureDocsChunksCollection } from './client.js';

async function main() {
	try {
		console.log('='.repeat(60));
		console.log('Resetting docs_chunks Collection');
		console.log('='.repeat(60));
		console.log('');

		// Drop existing collection
		console.log('Dropping existing collection...');
		const { dropped } = await dropDocsChunksCollection();
		console.log(dropped ? 'Collection dropped.' : 'Collection did not exist.');
		console.log('');

		// Recreate collection with updated schema
		console.log('Creating collection with updated schema...');
		const { created } = await ensureDocsChunksCollection();
		if (created) {
			console.log('Collection created successfully with vector search enabled.');
		} else {
			console.log('Collection already exists (this should not happen after dropping).');
		}

		console.log('');
		console.log('='.repeat(60));
		console.log('Collection reset complete!');
		console.log('='.repeat(60));
		console.log('');
		console.log('Next steps:');
		console.log('  1. Run the ingestion pipeline to index your documents:');
		console.log('     npx tsx ingest/index/run.ts');
		console.log('');
	} catch (error) {
		console.error('Error resetting collection:');
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}

main();

