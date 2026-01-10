
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const GROUND_TRUTH_FILE = path.join(ROOT_DIR, 'eval/ground_truth.json');
const EVAL_LOG_DIR = path.join(ROOT_DIR, 'eval/logs');
const EVAL_LOG_FILE = path.join(EVAL_LOG_DIR, 'search_eval.jsonl');

// Parse CLI args
const args = process.argv.slice(2);
const getArg = (name, def) => {
    const idx = args.indexOf(`--${name}`);
    return idx >= 0 && args[idx + 1] ? args[idx + 1] : def;
};

const BASE_URL = getArg('baseUrl', 'http://localhost:5173');
const LIMIT = getArg('limit', '10');
const RERANK = getArg('rerank', 'true');
const VERSION = getArg('version', 'latest');
const RESET = args.includes('--reset');

// JSON helper
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf-8'));
const appendLog = (data) => fs.appendFileSync(EVAL_LOG_FILE, JSON.stringify(data) + '\n');

// Ensure directory
if (!fs.existsSync(EVAL_LOG_DIR)) {
    fs.mkdirSync(EVAL_LOG_DIR, { recursive: true });
}

// Reset log if requested
if (RESET && fs.existsSync(EVAL_LOG_FILE)) {
    fs.unlinkSync(EVAL_LOG_FILE);
    console.log(`[INFO] Deleted existing log: ${EVAL_LOG_FILE}`);
}

async function runQuery(q, mode) {
    const url = new URL(`${BASE_URL}/api/search`);
    url.searchParams.set("q", q);
    url.searchParams.set("mode", mode);
    url.searchParams.set("limit", LIMIT);
    url.searchParams.set("rerank", RERANK);
    url.searchParams.set("version", VERSION);

    try {
        const start = performance.now();
        const res = await fetch(url);
        if (!res.ok) {
            const txt = await res.text();
            console.error(`[ERROR] ${mode} "${q}": ${res.status} ${txt}`);
            return null;
        }
        const json = await res.json();

        // Ensure timings_ms exists
        if (!json.timings_ms) json.timings_ms = {};

        // Add total client-side time if missing (fallback)
        if (!json.timings_ms.total) {
            json.timings_ms.total = Math.round(performance.now() - start);
        }

        return json;
    } catch (e) {
        console.error(`[ERROR] ${mode} "${q}": ${e.message}`);
        return null;
    }
}

async function main() {
    console.log("========================================");
    console.log("Evaluation Run Generator");
    console.log("========================================");
    console.log(`Base URL: ${BASE_URL}`);
    console.log(`Limit:    ${LIMIT}`);
    console.log(`Rerank:   ${RERANK}`);
    console.log(`Version:  ${VERSION}`);
    console.log(`Log File: ${EVAL_LOG_FILE}`);
    console.log("========================================\n");

    if (!fs.existsSync(GROUND_TRUTH_FILE)) {
        console.error(`Error: Ground truth file not found: ${GROUND_TRUTH_FILE}`);
        process.exit(1);
    }

    const groundTruth = readJson(GROUND_TRUTH_FILE);
    const queries = Object.keys(groundTruth);

    console.log(`Loaded ${queries.length} queries from ground truth.`);

    let processedIdx = 0;
    let totalLinesWritten = 0;
    const modes = ['keyword', 'semantic', 'hybrid'];

    for (const q of queries) {
        process.stdout.write(`Processing [${processedIdx + 1}/${queries.length}]: "${q}" ... `);

        let headerWritten = false;

        for (const mode of modes) {
            const resp = await runQuery(q, mode);
            if (!resp) continue;

            const entry = {
                ts: new Date().toISOString(),
                query: q,
                mode: mode,
                version: VERSION,
                rerank: RERANK === 'true',
                limit: parseInt(LIMIT),
                result_ids: resp.results.map(r => r.id),
                urls: resp.results.map(r => r.url),
                titles: resp.results.map(r => r.title),
                timings_ms: resp.timings_ms
            };

            appendLog(entry);
            totalLinesWritten++;
        }

        console.log("Done.");
        processedIdx++;

        // Small delay to be nice to the server
        await new Promise(r => setTimeout(r, 50));
    }

    console.log("\n========================================");
    console.log("Summary");
    console.log("========================================");
    console.log(`Queries Processed: ${processedIdx}`);
    console.log(`lines Written:     ${totalLinesWritten}`);
    console.log(`Log File:          ${EVAL_LOG_FILE}`);
    console.log("========================================");
}

main().catch(err => {
    console.error("Fatal Error:", err);
    process.exit(1);
});
