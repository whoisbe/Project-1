/**
 * Example usage of the shared configuration module
 * 
 * This file demonstrates how to import and use the config from @repo/config
 * 
 * Import path: @repo/config
 * 
 * Usage:
 * ```typescript
 * import { config } from '@repo/config';
 * 
 * // Access Typesense config
 * const typesenseUrl = `${config.typesense.protocol}://${config.typesense.host}:${config.typesense.port}`;
 * 
 * // Access OpenAI config
 * const openaiKey = config.openai.apiKey;
 * 
 * // Access Reranker config
 * const rerankerProvider = config.reranker.provider;
 * 
 * // Access Docs config
 * const docsRepoPath = config.docs.repoPath;
 * const docsBaseUrl = config.docs.baseUrl;
 * ```
 */

import { config, type Config } from '@repo/config';

// Example: Export config for use in other modules
export { config, type Config };

// Example: Type-safe access to specific config sections
export const typesenseConfig = config.typesense;
export const openaiConfig = config.openai;
export const rerankerConfig = config.reranker;
export const docsConfig = config.docs;



