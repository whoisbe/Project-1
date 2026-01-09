/**
 * Diversification utility for search results
 * 
 * Removes duplicate URLs from search results while preserving order.
 * Useful for ensuring result diversity when the same document appears
 * multiple times in search results (e.g., different chunks from the same page).
 */

/**
 * Diversifies results by URL, keeping only the first occurrence of each unique URL
 * 
 * @param items - Array of items with url property
 * @param limit - Maximum number of results to return
 * @returns Diversified array with unique URLs, preserving order
 * 
 * @example
 * ```ts
 * const results = [
 *   { url: 'https://example.com/page1', title: 'Page 1 Chunk 1' },
 *   { url: 'https://example.com/page2', title: 'Page 2' },
 *   { url: 'https://example.com/page1', title: 'Page 1 Chunk 2' }, // duplicate
 * ];
 * 
 * const diversified = diversifyByUrl(results, 10);
 * // Returns: [results[0], results[1]] - first occurrence of each URL
 * ```
 */
export function diversifyByUrl<T extends { url: string }>(items: T[], limit: number): T[] {
	const seen = new Set<string>();
	const diversified: T[] = [];

	for (const item of items) {
		if (diversified.length >= limit) {
			break;
		}

		if (!seen.has(item.url)) {
			seen.add(item.url);
			diversified.push(item);
		}
	}

	return diversified;
}

