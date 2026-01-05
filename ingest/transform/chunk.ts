/**
 * Markdown chunking module
 * 
 * Splits markdown content into chunks based on heading hierarchy,
 * preserving code blocks and maintaining semantic structure.
 */

import { createHash } from 'crypto';

/**
 * Chunk record structure
 */
export type ChunkRecord = {
	id: string; // stable hash(url + section_path + chunk_index)
	url: string;
	title: string;
	section_path: string; // derived from heading hierarchy (H1 > H2 > H3)
	content: string; // chunk text
	source: string;
	tags?: string[];
};

/**
 * Page record structure (input)
 */
export type PageRecord = {
	url: string;
	title: string;
	markdown: string;
	source: string;
	crawl_time: string;
};

/**
 * Heading structure
 */
interface Heading {
	level: number; // 1, 2, or 3
	text: string;
	lineIndex: number; // line number in original markdown
}

/**
 * Section structure
 */
interface Section {
	heading: Heading | null;
	content: string;
	parentSection?: Section;
}

/**
 * Remove YAML frontmatter from markdown content
 */
function removeFrontmatter(content: string): string {
	const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
	const match = content.match(frontmatterRegex);
	return match ? match[2] : content;
}

/**
 * Replace Vuepress components with placeholders
 * Handles: <DocsSections />, <RedirectOldLinks />, <Tabs>, etc.
 */
function replaceVuepressComponents(content: string): string {
	// Replace self-closing components
	content = content.replace(/<DocsSections\s*\/?>/gi, '[component omitted]');
	content = content.replace(/<RedirectOldLinks\s*\/?>/gi, '[component omitted]');
	
	// Replace block components (like <Tabs>...</Tabs>)
	// Simple approach: remove the entire component block
	content = content.replace(/<Tabs[^>]*>[\s\S]*?<\/Tabs>/gi, '[component omitted]');
	content = content.replace(/<template[^>]*>[\s\S]*?<\/template>/gi, '[component omitted]');
	
	return content;
}

/**
 * Replace template variables with placeholders
 * Example: {{ $page.typesenseVersion }} -> [version]
 */
function replaceTemplateVariables(content: string): string {
	// Replace common template variables
	content = content.replace(/\{\{\s*\$page\.typesenseVersion\s*\}\}/g, '[version]');
	content = content.replace(/\{\{\s*\$page\.[^}]+\s*\}\}/g, '[variable]');
	
	return content;
}

/**
 * Extract headings from markdown content
 */
function extractHeadings(content: string): Heading[] {
	const headings: Heading[] = [];
	const lines = content.split('\n');
	
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const h1Match = line.match(/^#\s+(.+)$/);
		const h2Match = line.match(/^##\s+(.+)$/);
		const h3Match = line.match(/^###\s+(.+)$/);
		
		if (h1Match) {
			headings.push({ level: 1, text: h1Match[1].trim(), lineIndex: i });
		} else if (h2Match) {
			headings.push({ level: 2, text: h2Match[1].trim(), lineIndex: i });
		} else if (h3Match) {
			headings.push({ level: 3, text: h3Match[1].trim(), lineIndex: i });
		}
	}
	
	return headings;
}

/**
 * Check if a line is inside a fenced code block
 */
function isInCodeBlock(lines: string[], lineIndex: number): boolean {
	let inCodeBlock = false;
	
	for (let i = 0; i <= lineIndex; i++) {
		const line = lines[i];
		// Check for fenced code block markers (``` or ~~~)
		if (line.match(/^```/)) {
			inCodeBlock = !inCodeBlock;
		} else if (line.match(/^~~~/)) {
			inCodeBlock = !inCodeBlock;
		}
	}
	
	return inCodeBlock;
}

/**
 * Split markdown into sections based on heading hierarchy
 */
function splitIntoSections(content: string): Section[] {
	const lines = content.split('\n');
	const headings = extractHeadings(content);
	const sections: Section[] = [];
	
	if (headings.length === 0) {
		// No headings, return entire content as one section
		return [{ heading: null, content: content.trim() }];
	}
	
	// Build sections based on headings
	for (let i = 0; i < headings.length; i++) {
		const heading = headings[i];
		const nextHeading = headings[i + 1];
		
		// Determine section boundaries
		const startLine = heading.lineIndex;
		const endLine = nextHeading ? nextHeading.lineIndex : lines.length;
		
		// Extract section content (excluding the heading line itself)
		const sectionLines = lines.slice(startLine + 1, endLine);
		const sectionContent = sectionLines.join('\n').trim();
		
		// Find parent section (last section with lower heading level)
		let parentSection: Section | undefined;
		for (let j = sections.length - 1; j >= 0; j--) {
			if (sections[j].heading && sections[j].heading.level < heading.level) {
				parentSection = sections[j];
				break;
			}
		}
		
		sections.push({
			heading,
			content: sectionContent,
			parentSection
		});
	}
	
	return sections;
}

/**
 * Generate section path from heading hierarchy
 * Example: "H1 Title > H2 Subtitle > H3 Sub-subtitle"
 */
function generateSectionPath(section: Section, fallbackTitle: string): string {
	if (!section.heading) {
		return fallbackTitle;
	}
	
	const pathParts: string[] = [section.heading.text];
	let current: Section | undefined = section.parentSection;
	
	while (current && current.heading) {
		pathParts.unshift(current.heading.text);
		current = current.parentSection;
	}
	
	return pathParts.join(' > ');
}

/**
 * Estimate token count (rough heuristic: ~4 characters per token)
 */
function estimateTokens(text: string): number {
	return Math.ceil(text.length / 4);
}

/**
 * Split section content into chunks if it exceeds target size
 * Preserves code blocks (doesn't split inside them)
 */
function splitSectionIntoChunks(
	section: Section,
	targetMinTokens: number = 300,
	targetMaxTokens: number = 800
): string[] {
	const content = section.content;
	const estimatedTokens = estimateTokens(content);
	
	// If content is within target size, return as single chunk
	if (estimatedTokens >= targetMinTokens && estimatedTokens <= targetMaxTokens) {
		return [content];
	}
	
	// If content is too small, return as-is (will be merged with adjacent chunks if needed)
	if (estimatedTokens < targetMinTokens) {
		return [content];
	}
	
	// Content is too large, need to split
	// Strategy: split by paragraphs, but preserve code blocks
	const chunks: string[] = [];
	const lines = content.split('\n');
	let currentChunk: string[] = [];
	let inCodeBlock = false;
	let currentTokens = 0;
	
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const isCodeBlockMarker = line.match(/^```|^~~~/);
		
		if (isCodeBlockMarker) {
			inCodeBlock = !inCodeBlock;
		}
		
		const lineTokens = estimateTokens(line);
		
		// If adding this line would exceed max tokens and we're not in a code block, start new chunk
		if (
			!inCodeBlock &&
			currentTokens > 0 &&
			currentTokens + lineTokens > targetMaxTokens &&
			currentChunk.length > 0
		) {
			chunks.push(currentChunk.join('\n'));
			currentChunk = [line];
			currentTokens = lineTokens;
		} else {
			currentChunk.push(line);
			currentTokens += lineTokens;
			
			// If we've accumulated enough content and we're at a paragraph boundary, start new chunk
			if (
				!inCodeBlock &&
				currentTokens >= targetMinTokens &&
				line.trim() === '' &&
				currentChunk.length > 1
			) {
				chunks.push(currentChunk.join('\n'));
				currentChunk = [];
				currentTokens = 0;
			}
		}
	}
	
	// Add remaining content as final chunk
	if (currentChunk.length > 0) {
		chunks.push(currentChunk.join('\n'));
	}
	
	return chunks.filter(chunk => chunk.trim().length > 0);
}

/**
 * Generate stable hash for chunk ID
 */
function generateChunkId(url: string, sectionPath: string, chunkIndex: number): string {
	const input = `${url}|${sectionPath}|${chunkIndex}`;
	return createHash('sha256').update(input).digest('hex').substring(0, 16);
}

/**
 * Process a page record and generate chunks
 */
export function chunkPage(page: PageRecord): ChunkRecord[] {
	// Clean up markdown content
	let content = page.markdown;
	content = removeFrontmatter(content);
	content = replaceVuepressComponents(content);
	content = replaceTemplateVariables(content);
	
	// Also process title for consistency (replace template variables)
	const processedTitle = replaceTemplateVariables(page.title);
	
	// Split into sections based on heading hierarchy
	const sections = splitIntoSections(content);
	const chunks: ChunkRecord[] = [];
	
	// Process each section
	for (const section of sections) {
		const sectionPath = generateSectionPath(section, page.title);
		const sectionChunks = splitSectionIntoChunks(section);
		
		// Create chunk records
		for (let i = 0; i < sectionChunks.length; i++) {
			const chunkContent = sectionChunks[i].trim();
			
			// Skip empty chunks
			if (chunkContent.length === 0) {
				continue;
			}
			
			// Include heading in chunk content if it exists
			let fullChunkContent = chunkContent;
			if (section.heading) {
				const headingPrefix = '#'.repeat(section.heading.level) + ' ' + section.heading.text;
				fullChunkContent = `${headingPrefix}\n\n${chunkContent}`;
			}
			
			const chunkId = generateChunkId(page.url, sectionPath, i);
			
			chunks.push({
				id: chunkId,
				url: page.url,
				title: processedTitle,
				section_path: sectionPath,
				content: fullChunkContent,
				source: page.source
			});
		}
	}
	
	return chunks;
}

