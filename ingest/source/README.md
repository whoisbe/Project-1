# Local Documentation Loader

This module loads markdown documentation files from a local Typesense website repository and generates normalized page records in JSONL format.

## Setup

### 1. Clone the Typesense Website Repository

```bash
git clone https://github.com/typesense/typesense-website.git
```

### 2. Set Environment Variable

Set the `DOCS_REPO_PATH` environment variable to the absolute path of your local clone:

```bash
# In your .env file or export in your shell
export DOCS_REPO_PATH="/path/to/typesense-website"
```

Also ensure the following are set:
- `DOCS_BASE_URL`: `https://typesense.org/docs/`
- `DOCS_SOURCE_ID`: `typesense-docs`

## Usage

Run the loader script:

```bash
# Using tsx directly
npx tsx source/run.ts

# Or using npm script
npm run load-docs
```

The script will:
1. Locate the `docs-site/content` directory within your repository path
2. Recursively scan for `.md` and `.mdx` files
3. Generate normalized page records
4. Write output to `ingest/out/pages.jsonl`

## Output Format

Each line in the JSONL file represents a page record:

```json
{
  "url": "https://typesense.org/docs/guide/installation",
  "title": "Installation Guide",
  "markdown": "# Installation Guide\n\n...",
  "source": "typesense-docs",
  "crawl_time": "2024-01-15T10:30:00.000Z"
}
```

## File Discovery

The loader:
- **Includes**: All `.md` and `.mdx` files under `docs-site/content/`
- **Excludes**: 
  - `node_modules/`
  - `.git/`
  - `build/` and `dist/` directories
  - Files in `/assets/` or `/static/` paths
  - Any path containing `/.vuepress/`

## URL Construction

- File paths are converted to URL slugs relative to `docs-site/content/`
- The `content/` directory is NOT included in URLs
- `index.md` or `README.md` files map to their directory path
- Extensions (`.md`, `.mdx`) are removed from URLs
- Final URL = `DOCS_BASE_URL` + slug
- Examples:
  - `docs-site/content/0.11.0/README.md` → `https://typesense.org/docs/0.11.0`
  - `docs-site/content/guide/foo.md` → `https://typesense.org/docs/guide/foo`

## Title Extraction

Titles are extracted in this priority order:
1. Frontmatter `title:` field (YAML)
2. First H1 heading (`# ...`)
3. Filename converted to Title Case

