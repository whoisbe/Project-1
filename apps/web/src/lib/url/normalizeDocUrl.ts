/**
 * Normalizes documentation URLs for clicking
 * 
 * Adds .html suffix when needed to make URLs clickable.
 * 
 * Rules:
 * - If URL ends with "/" => return as-is (directory URL)
 * - If URL ends with ".html" => return as-is (already normalized)
 * - Otherwise => append ".html"
 * 
 * @param url - Canonical URL from search results
 * @returns Clickable URL with .html suffix if needed
 * 
 * @example
 * normalizeDocUrl("https://typesense.org/docs/0.11.0/") 
 *   => "https://typesense.org/docs/0.11.0/"
 * 
 * normalizeDocUrl("https://typesense.org/docs/guide/ranking-and-relevance") 
 *   => "https://typesense.org/docs/guide/ranking-and-relevance.html"
 * 
 * normalizeDocUrl("https://typesense.org/docs/guide/ranking-and-relevance.html") 
 *   => "https://typesense.org/docs/guide/ranking-and-relevance.html"
 */
export function normalizeDocUrl(url: string): string {
	if (url.endsWith('/')) {
		return url;
	}
	if (url.endsWith('.html')) {
		return url;
	}
	return url + '.html';
}

