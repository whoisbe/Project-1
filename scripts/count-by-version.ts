/**
 * Script to query Typesense and get document counts per docs_version
 * 
 * Usage: npx tsx scripts/count-by-version.ts
 */

import { getTypesenseClient } from '../ingest/typesense/client.js';
import { DOCS_CHUNKS_COLLECTION } from '../ingest/typesense/schema.js';

interface FacetCount {
	value: string | number | null;
	count: number;
}

interface FacetStats {
	field_name: string;
	counts: FacetCount[];
	stats?: {
		min?: number;
		max?: number;
		sum?: number;
		avg?: number;
	};
}

async function getDocsVersionCounts(): Promise<void> {
	try {
		const client = getTypesenseClient();

		console.log('='.repeat(60));
		console.log('Querying Typesense for docs_version counts');
		console.log('='.repeat(60));
		console.log('');

		// Perform a search query with faceting on docs_version
		// Using q: '*' to match all documents
		const searchParams = {
			q: '*',
			query_by: 'id', // Required but not used since we're matching all
			facet_by: 'docs_version',
			per_page: 0, // We don't need actual results, just facets
		};

		const searchResults = await client
			.collections(DOCS_CHUNKS_COLLECTION)
			.documents()
			.search(searchParams);

		// Extract facet information
		const facets = searchResults.facet_counts || [];
		const docsVersionFacet = facets.find(
			(f: FacetStats) => f.field_name === 'docs_version'
		) as FacetStats | undefined;

		if (!docsVersionFacet) {
			console.log('No docs_version facet found in results.');
			console.log('Available facets:', facets.map((f: FacetStats) => f.field_name));
			return;
		}

		const totalDocs = searchResults.found || 0;
		const versionCounts = docsVersionFacet.counts || [];

		console.log(`Total documents: ${totalDocs}`);
		console.log('');
		console.log('='.repeat(60));
		console.log('Document counts by docs_version:');
		console.log('='.repeat(60));
		console.log('');

		if (versionCounts.length === 0) {
			console.log('No documents with docs_version found.');
			return;
		}

		// Sort by count (descending) for better readability
		const sortedCounts = [...versionCounts].sort((a, b) => b.count - a.count);

		// Calculate total with version
		const totalWithVersion = sortedCounts
			.filter(c => c.value !== null)
			.reduce((sum, c) => sum + c.count, 0);
		
		const totalWithoutVersion = sortedCounts
			.filter(c => c.value === null)
			.reduce((sum, c) => sum + c.count, 0);

		// Display counts
		for (const count of sortedCounts) {
			const versionLabel = count.value === null ? '(null - unversioned)' : String(count.value);
			const percentage = totalDocs > 0 ? ((count.count / totalDocs) * 100).toFixed(1) : '0.0';
			
			console.log(`  docs_version: ${versionLabel.padEnd(25)} | Count: ${String(count.count).padStart(6)} | ${percentage}%`);
		}

		console.log('');
		console.log('='.repeat(60));
		console.log('Summary:');
		console.log('='.repeat(60));
		console.log(`  Total documents:              ${totalDocs}`);
		console.log(`  Documents with version:        ${totalWithVersion}`);
		console.log(`  Documents without version:     ${totalWithoutVersion}`);
		
		if (docsVersionFacet.stats) {
			const stats = docsVersionFacet.stats;
			console.log('');
			console.log('Version statistics:');
			if (stats.min !== undefined) console.log(`  Minimum version: ${stats.min}`);
			if (stats.max !== undefined) console.log(`  Maximum version: ${stats.max}`);
			if (stats.avg !== undefined) console.log(`  Average version: ${stats.avg.toFixed(2)}`);
		}

		console.log('='.repeat(60));
	} catch (error) {
		console.error('Error querying Typesense:');
		console.error(error instanceof Error ? error.message : String(error));
		if (error instanceof Error && error.stack) {
			console.error('\nStack trace:');
			console.error(error.stack);
		}
		process.exit(1);
	}
}

getDocsVersionCounts();

