/**
 * Local Typesense documentation loader
 * 
 * Reads markdown files from a local repository filesystem and produces
 * normalized page records in the same format as the previous Firecrawl output.
 */

import { config } from '@repo/config';
import { readdir, readFile, stat, access } from 'fs/promises';
import { join, relative, extname, basename, dirname } from 'path';

/**
 * Normalized page record structure (matches previous Firecrawl output)
 */
export type PageRecord = {
	url: string;
	title: string;
	markdown: string;
	source: string;
	crawl_time: string; // ISO timestamp
};

/**
 * Frontmatter metadata structure
 */
interface Frontmatter {
	title?: string;
	[key: string]: any;
}

/**
 * Parse frontmatter from markdown content
 * Simple YAML-like parser that handles title: "value" format
 */
function parseFrontmatter(content: string): { frontmatter: Frontmatter | null; body: string } {
	const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
	const match = content.match(frontmatterRegex);

	if (!match) {
		return { frontmatter: null, body: content };
	}

	const frontmatterText = match[1];
	const body = match[2];

	try {
		// Simple YAML-like parsing (supports title: "value" format)
		const frontmatter: Frontmatter = {};
		const lines = frontmatterText.split('\n');
		
		for (const line of lines) {
			const colonIndex = line.indexOf(':');
			if (colonIndex > 0) {
				const key = line.substring(0, colonIndex).trim();
				let value = line.substring(colonIndex + 1).trim();
				
				// Remove quotes if present
				if ((value.startsWith('"') && value.endsWith('"')) ||
					(value.startsWith("'") && value.endsWith("'"))) {
					value = value.slice(1, -1);
				}
				
				frontmatter[key] = value;
			}
		}

		return { frontmatter, body };
	} catch {
		return { frontmatter: null, body };
	}
}

/**
 * Extract title from markdown content
 * Priority: frontmatter title > first H1 > filename (Title Case)
 */
function extractTitle(content: string, filePath: string): string {
	const { frontmatter, body } = parseFrontmatter(content);

	// 1. Try frontmatter title
	if (frontmatter?.title) {
		return frontmatter.title.trim();
	}

	// 2. Try first H1
	const h1Match = body.match(/^#\s+(.+)$/m);
	if (h1Match) {
		return h1Match[1].trim();
	}

	// 3. Fall back to filename (Title Case)
	const fileName = basename(filePath, extname(filePath));
	// Convert to Title Case (handle kebab-case, snake_case, etc.)
	return fileName
		.replace(/[-_]/g, ' ')
		.replace(/\b\w/g, (char) => char.toUpperCase());
}

/**
 * Convert file path to URL slug
 * Handles index.md and README.md by mapping to directory path
 */
function pathToSlug(docsRoot: string, filePath: string, baseUrl: string): string {
	// Get relative path from docs root
	let relativePath = relative(docsRoot, filePath);
	
	// Remove extension
	relativePath = relativePath.replace(/\.(md|mdx)$/i, '');
	
	// Normalize path separators to forward slashes
	let slug = relativePath.replace(/\\/g, '/');
	
	// Handle index files: index.md or README.md => map to directory path
	const fileName = basename(filePath, extname(filePath)).toLowerCase();
	if (fileName === 'index' || fileName === 'readme') {
		// Remove the index/readme part from the slug
		slug = dirname(slug);
		// If we're left with just '.', the slug should be empty
		if (slug === '.' || slug === '') {
			slug = '';
		}
		// For index/README files, ensure trailing slash
		if (slug !== '') {
			slug = slug + '/';
		}
	}
	
	// Ensure slug doesn't start with / (we'll add it to base URL)
	slug = slug.replace(/^\/+/, '');
	
	// Clean base URL (remove trailing slash)
	const cleanBaseUrl = baseUrl.replace(/\/$/, '');
	
	// Construct final URL
	if (slug === '') {
		return cleanBaseUrl + '/';
	}
	
	// Ensure exactly one slash between base and slug
	// NO .html suffix - URLs are canonical paths
	return `${cleanBaseUrl}/${slug}`;
}

/**
 * Check if a path should be excluded
 */
function shouldExcludePath(filePath: string, docsRoot: string): boolean {
	const relativePath = relative(docsRoot, filePath).replace(/\\/g, '/').toLowerCase();
	
	// Exclude node_modules
	if (relativePath.includes('/node_modules/') || relativePath.startsWith('node_modules/')) {
		return true;
	}
	
	// Exclude .git
	if (relativePath.includes('/.git/') || relativePath.startsWith('.git/')) {
		return true;
	}
	
	// Exclude build/dist directories
	if (relativePath.includes('/build/') || relativePath.includes('/dist/') ||
		relativePath.startsWith('build/') || relativePath.startsWith('dist/')) {
		return true;
	}
	
	// Exclude paths containing /assets/ or /static/
	if (relativePath.includes('/assets/') || relativePath.includes('/static/')) {
		return true;
	}
	
	// Exclude any path containing /.vuepress/
	if (relativePath.includes('/.vuepress/') || relativePath.startsWith('.vuepress/')) {
		return true;
	}
	
	return false;
}

/**
 * Recursively find all markdown files in a directory
 * Includes .md and .mdx files, excludes certain directories
 */
async function findMarkdownFiles(dirPath: string, docsRoot: string): Promise<string[]> {
	const files: string[] = [];

	try {
		const entries = await readdir(dirPath, { withFileTypes: true });

		for (const entry of entries) {
			const fullPath = join(dirPath, entry.name);

			// Skip excluded paths
			if (shouldExcludePath(fullPath, docsRoot)) {
				continue;
			}

			if (entry.isDirectory()) {
				// Recursively scan subdirectories
				const subFiles = await findMarkdownFiles(fullPath, docsRoot);
				files.push(...subFiles);
			} else if (entry.isFile()) {
				// Check if it's a markdown file (.md or .mdx)
				const ext = extname(entry.name).toLowerCase();
				if (ext === '.md' || ext === '.mdx') {
					files.push(fullPath);
				}
			}
		}
	} catch (error) {
		console.error(`⚠️  Error reading directory ${dirPath}: ${error instanceof Error ? error.message : String(error)}`);
	}

	return files;
}

/**
 * Load and normalize a single markdown file
 */
async function loadMarkdownFile(
	filePath: string,
	docsRoot: string,
	baseUrl: string,
	sourceId: string
): Promise<PageRecord | null> {
	try {
		const content = await readFile(filePath, 'utf-8');
		
		if (!content.trim()) {
			console.warn(`⚠️  Skipping empty file: ${filePath}`);
			return null;
		}

		const title = extractTitle(content, filePath);
		const url = pathToSlug(docsRoot, filePath, baseUrl);
		const crawl_time = new Date().toISOString();

		// Keep markdown as original file contents (do not strip code blocks or frontmatter)
		const markdown = content;

		return {
			url,
			title,
			markdown,
			source: sourceId,
			crawl_time
		};
	} catch (error) {
		console.error(
			`❌ Failed to load file ${filePath}: ${error instanceof Error ? error.message : String(error)}`
		);
		return null;
	}
}

/**
 * Load all markdown files from the local docs repository
 * 
 * Discovers docs content directory: ${DOCS_REPO_PATH}/docs-site/content
 * If that folder does not exist, throws an error.
 * 
 * @returns Array of normalized page records
 */
export async function loadLocalDocsPages(): Promise<PageRecord[]> {
	const { repoPath, baseUrl, sourceId } = config.docs;
	
	// Discover docs content directory: ${DOCS_REPO_PATH}/docs-site/content
	// Handle both cases: repoPath might be repo root or already include docs-site
	let docsRoot: string;
	if (repoPath.endsWith('docs-site') || repoPath.endsWith('docs-site/')) {
		// repoPath already includes docs-site, just add content
		docsRoot = join(repoPath, 'content');
	} else {
		// repoPath is repo root, add docs-site/content
		docsRoot = join(repoPath, 'docs-site', 'content');
	}
	
	// Check if docs-site/content directory exists
	try {
		await access(docsRoot);
		const stats = await stat(docsRoot);
		if (!stats.isDirectory()) {
			throw new Error(`docs-site/content exists but is not a directory`);
		}
	} catch (error) {
		if (error instanceof Error && error.message.includes('not a directory')) {
			throw error;
		}
		throw new Error(
			'docs-site/content directory not found; confirm repo path or update loader'
		);
	}

	console.log(`📂 Docs content root: ${docsRoot}`);

	// Recursively scan docs root for markdown files
	console.log(`🔍 Scanning for markdown files...`);
	const markdownFiles = await findMarkdownFiles(docsRoot, docsRoot);
	console.log(`✅ Found ${markdownFiles.length} markdown files`);

	// Load and normalize each file
	console.log(`📝 Loading and normalizing files...`);
	const records: PageRecord[] = [];

	for (const filePath of markdownFiles) {
		const record = await loadMarkdownFile(filePath, docsRoot, baseUrl, sourceId);
		if (record) {
			records.push(record);
		}
	}

	return records;
}
