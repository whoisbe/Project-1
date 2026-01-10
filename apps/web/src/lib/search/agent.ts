
/**
 * Agent decision structure
 */
export type AgentDecision = {
    mode: 'keyword' | 'semantic' | 'hybrid';
    rerank: boolean;
    explanation: string;
};

/**
 * Routes a search query to the appropriate search mode and configuration
 * based on heuristics.
 */
export function routeQuery(query: string): AgentDecision {
    const trimmedQuery = query.trim();

    // Rule 1: Exact quoted phrases -> Keyword Search
    // If the user explicitly quotes something, they likely want exact matches.
    if (/^".+"$/.test(trimmedQuery) || /'.+'/.test(trimmedQuery)) {
        return {
            mode: 'keyword',
            rerank: true, // Rerank to ensure best matches are at top
            explanation: 'Detected quoted phrase, using Keyword search for exact matching.'
        };
    }

    // Rule 2: Code snippets or specific identifiers -> Keyword Search
    // Detects snake_case, camelCase, or typical code punctuation
    const isCodeLike = /[a-z]+_[a-z]+/.test(trimmedQuery) || // snake_case
        /[a-z]+[A-Z][a-z]+/.test(trimmedQuery) || // camelCase
        /[\(\)\{\}\[\]\.]/.test(trimmedQuery); // brackets/dots

    if (isCodeLike && !trimmedQuery.includes(' ')) {
        return {
            mode: 'keyword',
            rerank: false, // Don't rerank specific symbols as semantic meaning might be weak
            explanation: 'Detected code-like pattern or identifier, using Keyword search.'
        };
    }

    // Rule 3: Questions -> Semantic Search (or Hybrid)
    // Natural language questions benefit from vector search.
    const isQuestion = /^(what|how|why|when|where|who)\s/i.test(trimmedQuery) ||
        trimmedQuery.endsWith('?');

    if (isQuestion) {
        return {
            mode: 'hybrid', // Hybrid is safer than pure semantic, but leans heavily on semantic
            rerank: true,
            explanation: 'Detected question format, using Hybrid search with Reranking for best semantic understanding.'
        };
    }

    // Rule 4: Short concepts -> Hybrid
    // Default fallback
    return {
        mode: 'hybrid',
        rerank: true,
        explanation: 'Defaulting to Hybrid search with Reranking for general query.'
    };
}
