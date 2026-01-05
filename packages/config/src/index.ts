import { z } from 'zod';

/**
 * Environment variable schema validation
 */
const envSchema = z.object({
	// Typesense configuration
	TYPESENSE_HOST: z.string().min(1, 'TYPESENSE_HOST is required'),
	TYPESENSE_PORT: z.string().regex(/^\d+$/, 'TYPESENSE_PORT must be a valid number').transform(Number),
	TYPESENSE_PROTOCOL: z.enum(['http', 'https'], {
		errorMap: () => ({ message: 'TYPESENSE_PROTOCOL must be either "http" or "https"' })
	}),
	TYPESENSE_API_KEY: z.string().min(1, 'TYPESENSE_API_KEY is required'),

	// OpenAI configuration
	OPENAI_API_KEY: z.string().min(1, 'OPENAI_API_KEY is required'),
	OPENAI_EMBED_MODEL: z.string().min(1, 'OPENAI_EMBED_MODEL is required'),

	// Reranker configuration
	RERANK_PROVIDER: z.string().min(1, 'RERANK_PROVIDER is required'),
	COHERE_API_KEY: z.string().min(1, 'COHERE_API_KEY is required'),
	COHERE_RERANK_MODEL: z.string().min(1, 'COHERE_RERANK_MODEL is required'),

	// Firecrawl configuration
	FIRECRAWL_API_KEY: z.string().min(1, 'FIRECRAWL_API_KEY is required'),
	DOCS_SEED_URL: z.string().url('DOCS_SEED_URL must be a valid URL'),
	DOCS_SOURCE_ID: z.string().min(1, 'DOCS_SOURCE_ID is required')
});

/**
 * Validated configuration object
 */
export type Config = {
	typesense: {
		host: string;
		port: number;
		protocol: 'http' | 'https';
		apiKey: string;
	};
	openai: {
		apiKey: string;
		embedModel: string;
	};
	reranker: {
		provider: string;
		cohereApiKey: string;
		cohereRerankModel: string;
	};
	firecrawl: {
		apiKey: string;
		docsSeedUrl: string;
		docsSourceId: string;
	};
};

/**
 * Validates and parses environment variables, then returns a typed config object.
 * Fails fast with clear error messages if any required variables are missing or invalid.
 */
function loadConfig(): Config {
	try {
		const env = envSchema.parse(process.env);

		return {
			typesense: {
				host: env.TYPESENSE_HOST,
				port: env.TYPESENSE_PORT,
				protocol: env.TYPESENSE_PROTOCOL,
				apiKey: env.TYPESENSE_API_KEY
			},
			openai: {
				apiKey: env.OPENAI_API_KEY,
				embedModel: env.OPENAI_EMBED_MODEL
			},
			reranker: {
				provider: env.RERANK_PROVIDER,
				cohereApiKey: env.COHERE_API_KEY,
				cohereRerankModel: env.COHERE_RERANK_MODEL
			},
			firecrawl: {
				apiKey: env.FIRECRAWL_API_KEY,
				docsSeedUrl: env.DOCS_SEED_URL,
				docsSourceId: env.DOCS_SOURCE_ID
			}
		};
	} catch (error) {
		if (error instanceof z.ZodError) {
			const missingVars = error.errors.map((err) => {
				const path = err.path.join('.');
				return `  - ${path}: ${err.message}`;
			});

			const errorMessage = [
				'Configuration validation failed. Missing or invalid environment variables:',
				...missingVars,
				'',
				'Please ensure all required environment variables are set correctly.'
			].join('\n');

			console.error(errorMessage);
			throw new Error(errorMessage);
		}
		throw error;
	}
}

/**
 * Exported configuration object
 * Validated at module load time - fails fast if any required env vars are missing
 */
export const config = loadConfig();



