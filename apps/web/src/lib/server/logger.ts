
import fs from 'fs/promises';
import path from 'path';

/**
 * Log entry structure
 */
type SearchLogEntry = {
    timestamp: string;
    query: string;
    mode: string;
    results: string[]; // List of document IDs
};

const LOG_DIR = 'logs';
const LOG_FILE = 'search.jsonl';

/**
 * Appends a search query log entry to the log file asynchronously.
 * Does not block the main execution flow (fire-and-forget).
 */
export async function logSearchQuery(
    query: string,
    mode: string,
    resultIds: string[]
): Promise<void> {
    try {
        const entry: SearchLogEntry = {
            timestamp: new Date().toISOString(),
            query,
            mode,
            results: resultIds
        };

        const logLine = JSON.stringify(entry) + '\n';
        const logPath = path.join(process.cwd(), LOG_DIR, LOG_FILE);

        // Ensure directory exists
        await fs.mkdir(path.dirname(logPath), { recursive: true });

        // Append to file
        await fs.appendFile(logPath, logLine, 'utf-8');
    } catch (error) {
        // Silently fail to satisfy "Do not affect response latency" constraint
        // Ideally we might want to log this to stderr, but for minimal impact we keep it quiet
        console.error('Failed to log search query:', error);
    }
}
