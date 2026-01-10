
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const GROUND_TRUTH_FILE = path.join(ROOT_DIR, 'eval/ground_truth.json');
const EVAL_LOG_FILE = path.join(ROOT_DIR, 'eval/logs/search_eval.jsonl');

// Parse Args
const args = process.argv.slice(2);
const getArg = (name) => {
    const idx = args.indexOf(`--${name}`);
    return idx >= 0 && args[idx + 1] ? args[idx + 1] : null;
};
const TARGET_QUERY = getArg('query');
const RESET_MODE = args.includes('--reset');

if (!fs.existsSync(GROUND_TRUTH_FILE)) {
    console.error(`Ground truth file not found: ${GROUND_TRUTH_FILE}`);
    process.exit(1);
}

if (!fs.existsSync(EVAL_LOG_FILE)) {
    console.error(`Eval log file not found: ${EVAL_LOG_FILE}`);
    process.exit(1);
}

// Load Data
const groundTruth = JSON.parse(fs.readFileSync(GROUND_TRUTH_FILE, 'utf-8'));
const logs = fs.readFileSync(EVAL_LOG_FILE, 'utf-8')
    .split('\n')
    .filter(l => l.trim())
    .map(l => JSON.parse(l));

// Group docs by query
// Map<Query, Map<DocId, {title, url}>>
const queryCandidates = new Map();

logs.forEach(entry => {
    if (!queryCandidates.has(entry.query)) {
        queryCandidates.set(entry.query, new Map());
    }
    const docsMap = queryCandidates.get(entry.query);

    // Support both result_ids (with parallel arrays) or results objects
    if (entry.result_ids && entry.titles) {
        entry.result_ids.forEach((id, idx) => {
            if (!docsMap.has(id)) {
                docsMap.set(id, {
                    id,
                    title: entry.titles[idx] || 'Unknown Title',
                    url: entry.urls?.[idx] || 'Unknown URL'
                });
            }
        });
    } else if (entry.results) {
        entry.results.forEach(r => {
            if (!docsMap.has(r.id)) {
                docsMap.set(r.id, {
                    id: r.id,
                    title: r.title,
                    url: r.url
                });
            }
        });
    }
});

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const ask = (q) => new Promise(resolve => rl.question(q, resolve));

function saveGroundTruth() {
    fs.writeFileSync(GROUND_TRUTH_FILE, JSON.stringify(groundTruth, null, 2));
}

async function main() {
    const queries = Object.keys(groundTruth);
    let count = 0;

    for (const q of queries) {
        if (TARGET_QUERY && q !== TARGET_QUERY) continue;

        const candidatesMap = queryCandidates.get(q) || new Map();
        const existingRelevant = new Set(groundTruth[q] || []);

        // Include existing relevant IDs in candidates if they aren't in logs (so we can see/uncheck them)
        for (const id of existingRelevant) {
            if (!candidatesMap.has(id)) {
                candidatesMap.set(id, { id, title: '[Pre-existing ID]', url: '?' });
            }
        }

        if (candidatesMap.size === 0) {
            console.log(`\nQuery: "${q}" - No results found in logs. Skipping.`);
            continue;
        }

        console.log(`\n==================================================`);
        console.log(`QUERY [${++count}/${queries.length}]: "${q}"`);
        console.log(`==================================================`);

        const candidateList = Array.from(candidatesMap.values());

        // Display
        candidateList.forEach((doc, idx) => {
            const isRelevant = existingRelevant.has(doc.id);
            const marker = isRelevant ? '[x]' : '[ ]';
            console.log(`${String(idx + 1).padStart(2)}. ${marker} ${doc.title}`);
            console.log(`        ${doc.url} (ID: ${doc.id})`);
        });

        console.log(`\nCommands:`);
        console.log(` - Enter numbers (comma-separated, e.g. "1,3,5") to SET relevant docs.`);
        console.log(` - "s" or empty to skip (keep current).`);
        console.log(` - "c" to clear all.`);
        console.log(` - "q" to quit.`);

        const answer = (await ask('\nSelection: ')).trim();

        if (answer === 'q') {
            break;
        } else if (answer === 's' || answer === '') {
            console.log('Skipping...');
            continue;
        } else if (answer === 'c') {
            groundTruth[q] = [];
            console.log('Cleared.');
        } else {
            // Parse numbers
            const indices = answer.split(/[,\s]+/).map(s => parseInt(s, 10)).filter(n => !isNaN(n));
            const newRelevantIds = [];

            indices.forEach(i => {
                if (i > 0 && i <= candidateList.length) {
                    newRelevantIds.push(candidateList[i - 1].id);
                }
            });

            // Update
            groundTruth[q] = newRelevantIds;
            console.log(`Saved ${newRelevantIds.length} relevant docs.`);
        }

        saveGroundTruth();
    }

    rl.close();
    console.log('\nDone. Ground truth updated.');
}

main().catch(err => {
    console.error(err);
    rl.close();
});
