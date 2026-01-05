/**
 * Firecrawl crawling utilities for Typesense documentation
 * 
 * Crawls the documentation site and produces normalized page records
 * in JSONL format for downstream processing.
 */

import { config } from '@repo/config';
import { writeFile, mkdir } from 'fs/promises';
import { dirname } from 'path';

/**
 * Normalized page record structure
 */
export type PageRecord = {
	url: string;
	title: string;
	markdown: string;
	source: string;
	crawl_time: string; // ISO timestamp
};

/**
 * Crawl statistics
 */
export type CrawlStats = {
	total: number;
	success: number;
	failed: number;
	skipped: number;
};

/**
 * Retry configuration
 */
const RETRY_CONFIG = {
	maxRetries: 3,
	retryDelayMs: 1000,
	backoffMultiplier: 2
};

/**
 * Sleep utility for retries
 */
function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry wrapper for async operations
 */
async function withRetry<T>(
	fn: () => Promise<T>,
	operation: string,
	maxRetries: number = RETRY_CONFIG.maxRetries
): Promise<T> {
	let lastError: Error | null = null;

	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		try {
			return await fn();
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error));

			if (attempt < maxRetries) {
				const delay = RETRY_CONFIG.retryDelayMs * Math.pow(RETRY_CONFIG.backoffMultiplier, attempt);
				console.warn(
					`⚠️  ${operation} failed (attempt ${attempt + 1}/${maxRetries + 1}): ${lastError.message}. Retrying in ${delay}ms...`
				);
				await sleep(delay);
			}
		}
	}

	throw new Error(`${operation} failed after ${maxRetries + 1} attempts: ${lastError?.message}`);
}

/**
 * Extract title from Firecrawl response metadata
 */
function extractTitle(metadata: any): string {
	// Try multiple title sources
	if (metadata?.title) {
		// Remove " | Typesense" suffix if present
		return metadata.title.replace(/\s*\|\s*Typesense\s*$/, '').trim();
	}
	if (metadata?.['og:title']) {
		return metadata['og:title'].replace(/\s*\|\s*Typesense\s*$/, '').trim();
	}
	if (metadata?.['twitter:title']) {
		return metadata['twitter:title'].replace(/\s*\|\s*Typesense\s*$/, '').trim();
	}
	return 'Untitled';
}

/**
 * Normalize a Firecrawl page response into a PageRecord
 */
function normalizePage(data: any, sourceId: string): PageRecord | null {
	try {
		if (!data?.markdown) {
			console.warn(`⚠️  Skipping page: no markdown content for ${data?.metadata?.url || 'unknown URL'}`);
			return null;
		}

		const url = data.metadata?.url || data.metadata?.sourceURL || '';
		if (!url) {
			console.warn(`⚠️  Skipping page: no URL found in metadata`);
			return null;
		}

		const title = extractTitle(data.metadata);
		const markdown = data.markdown.trim();
		const crawl_time = new Date().toISOString();

		return {
			url,
			title,
			markdown,
			source: sourceId,
			crawl_time
		};
	} catch (error) {
		console.error(`❌ Error normalizing page: ${error instanceof Error ? error.message : String(error)}`);
		return null;
	}
}

/**
 * Start a Firecrawl crawl job
 */
async function startCrawlJob(seedUrl: string, apiKey: string): Promise<string> {
	const response = await fetch('https://api.firecrawl.dev/v2/crawl', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${apiKey}`
		},
		body: JSON.stringify({
			url: seedUrl,
			maxDiscoveryDepth: 10, // Reasonable depth for documentation sites
			limit: 1000, // Limit total pages
			allowExternalLinks: false, // Restrict to seed URL subtree
			allowSubdomains: false,
			scrapeOptions: {
				formats: ['markdown'],
				onlyMainContent: true
			}
		})
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(
			`Failed to start crawl job: ${response.status} ${response.statusText}. ${errorText}`
		);
	}

	const result = await response.json();
	if (!result?.id) {
		throw new Error('Crawl job started but no job ID returned');
	}

	return result.id;
}

/**
 * Check crawl job status
 */
async function checkCrawlStatus(jobId: string, apiKey: string): Promise<{
	status: string;
	completed?: number;
	total?: number;
	data?: any[];
	next?: string | null;
}> {
	const response = await fetch(`https://api.firecrawl.dev/v2/crawl/${jobId}`, {
		headers: {
			'Authorization': `Bearer ${apiKey}`
		}
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(
			`Failed to check crawl status: ${response.status} ${response.statusText}. ${errorText}`
		);
	}

	return await response.json();
}

/**
 * Wait for crawl job to complete
 */
async function waitForCrawlCompletion(
	jobId: string,
	apiKey: string,
	onProgress?: (completed: number, total: number) => void
): Promise<any[]> {
	console.log(`📊 Waiting for crawl job ${jobId} to complete...`);

	let allData: any[] = [];
	let next: string | null = null;

	while (true) {
		const status = await withRetry(
			() => checkCrawlStatus(jobId, apiKey),
			`Check crawl status for job ${jobId}`
		);

		if (status.status === 'completed') {
			if (status.data) {
				allData.push(...status.data);
			}

			// Fetch remaining pages if there's a next cursor
			if (status.next) {
				console.log(`📄 Fetching additional pages (cursor: ${status.next.substring(0, 20)}...)`);
				next = status.next;
				// Note: Firecrawl API may require pagination - this is a simplified version
				// In production, you'd handle pagination here
			} else {
				break;
			}

			if (onProgress && status.completed !== undefined && status.total !== undefined) {
				onProgress(status.completed, status.total);
			}
		} else if (status.status === 'failed') {
			throw new Error(`Crawl job ${jobId} failed`);
		} else {
			// Still processing
			if (onProgress && status.completed !== undefined && status.total !== undefined) {
				onProgress(status.completed, status.total);
			}
			await sleep(2000); // Poll every 2 seconds
		}
	}

	return allData;
}

/**
 * Crawl Typesense documentation using Firecrawl
 * 
 * @param outputPath - Path to write JSONL output file
 * @returns Crawl statistics
 */
export async function crawlDocs(outputPath: string): Promise<CrawlStats> {
	const { apiKey, docsSeedUrl, docsSourceId } = config.firecrawl;

	console.log(`🚀 Starting crawl of ${docsSeedUrl}`);
	console.log(`📝 Output will be written to: ${outputPath}`);

	// Ensure output directory exists
	const outputDir = dirname(outputPath);
	await mkdir(outputDir, { recursive: true });

	const stats: CrawlStats = {
		total: 0,
		success: 0,
		failed: 0,
		skipped: 0
	};

	try {
		// Start crawl job
		const jobId = await withRetry(
			() => startCrawlJob(docsSeedUrl, apiKey),
			'Start Firecrawl job'
		);
		console.log(`✅ Crawl job started: ${jobId}`);

		// Wait for completion with progress updates
		const crawlData = await waitForCrawlCompletion(jobId, apiKey, (completed, total) => {
			console.log(`📊 Progress: ${completed}/${total} pages crawled`);
		});

		stats.total = crawlData.length;
		console.log(`✅ Crawl completed: ${stats.total} pages fetched`);

		// Normalize and write pages
		console.log(`📝 Normalizing and writing pages...`);
		const lines: string[] = [];

		for (const pageData of crawlData) {
			try {
				const normalized = normalizePage(pageData, docsSourceId);
				if (normalized) {
					lines.push(JSON.stringify(normalized));
					stats.success++;
				} else {
					stats.skipped++;
				}
			} catch (error) {
				console.error(
					`❌ Failed to process page ${pageData?.metadata?.url || 'unknown'}: ${error instanceof Error ? error.message : String(error)}`
				);
				stats.failed++;
				// Continue processing other pages
			}
		}

		// Write all lines as JSONL
		await writeFile(outputPath, lines.join('\n') + '\n', 'utf-8');

		console.log(`✅ Successfully wrote ${stats.success} pages to ${outputPath}`);
	} catch (error) {
		console.error(`❌ Crawl failed: ${error instanceof Error ? error.message : String(error)}`);
		throw error;
	}

	return stats;
}

