
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const LOG_FILE = path.join(ROOT_DIR, 'apps/web/logs/search.jsonl');
const GROUND_TRUTH_FILE = path.join(ROOT_DIR, 'eval/ground_truth.json');

// --- Metrics Calculation ---

function calculateRecall(retrievedIds, relevantIds, k = 5) {
    if (!relevantIds || relevantIds.length === 0) return 0;

    const topK = retrievedIds.slice(0, k);
    const relevantSet = new Set(relevantIds);
    let matches = 0;

    for (const id of topK) {
        if (relevantSet.has(id)) {
            matches++;
        }
    }

    return matches / relevantIds.length;
}

function calculateDCG(retrievedIds, relevantSet, k = 5) {
    let dcg = 0;
    const topK = retrievedIds.slice(0, k);

    for (let i = 0; i < topK.length; i++) {
        const id = topK[i];
        if (relevantSet.has(id)) {
            // Relevance is 1 for binary relevance
            dcg += 1 / Math.log2(i + 2); // i+2 because i is 0-indexed and formula uses rank i+1 (log2(rank+1))
        }
    }
    return dcg;
}

function calculateIDCG(relevantCount, k = 5) {
    let idcg = 0;
    // In ideal case, all top items are relevant (up to relevantCount)
    const numIdealItems = Math.min(relevantCount, k);

    for (let i = 0; i < numIdealItems; i++) {
        idcg += 1 / Math.log2(i + 2);
    }
    return idcg;
}

function calculateNDCG(retrievedIds, relevantIds, k = 5) {
    if (!relevantIds || relevantIds.length === 0) return 0;

    const relevantSet = new Set(relevantIds);
    const dcg = calculateDCG(retrievedIds, relevantSet, k);
    const idcg = calculateIDCG(relevantIds.length, k);

    if (idcg === 0) return 0;
    return dcg / idcg;
}

// --- Main Execution ---

async function main() {
    console.log('Starting Evaluation...');
    console.log(`Logs: ${LOG_FILE}`);
    console.log(`Ground Truth: ${GROUND_TRUTH_FILE}`);

    if (!fs.existsSync(LOG_FILE)) {
        console.error('Error: Log file not found.');
        process.exit(1);
    }

    if (!fs.existsSync(GROUND_TRUTH_FILE)) {
        console.error('Error: Ground truth file not found.');
        process.exit(1);
    }

    const groundTruth = JSON.parse(fs.readFileSync(GROUND_TRUTH_FILE, 'utf-8'));
    const logContent = fs.readFileSync(LOG_FILE, 'utf-8');
    const logLines = logContent.split('\n').filter(line => line.trim() !== '');

    const stats = {}; // mode -> { recallSum, ndcgSum, count }

    for (const line of logLines) {
        try {
            const entry = JSON.parse(line);
            const query = entry.query;
            const relevantIds = groundTruth[query];

            // Skip queries not in ground truth
            if (!relevantIds) continue;

            const mode = entry.mode || 'unknown';
            if (!stats[mode]) {
                stats[mode] = { recallSum: 0, ndcgSum: 0, count: 0 };
            }

            const recall = calculateRecall(entry.results, relevantIds, 5);
            const ndcg = calculateNDCG(entry.results, relevantIds, 5);

            stats[mode].recallSum += recall;
            stats[mode].ndcgSum += ndcg;
            stats[mode].count++;

        } catch (e) {
            console.warn('Skipping malformed log line:', e.message);
        }
    }

    // --- Output Table ---
    console.log('\nResults (k=5):');
    console.log('---------------------------------------------------------');
    console.log('| Mode             | Count | Recall@5 | nDCG@5  |');
    console.log('---------------------------------------------------------');

    for (const mode of Object.keys(stats).sort()) {
        const data = stats[mode];
        const avgRecall = (data.recallSum / data.count).toFixed(4);
        const avgNDCG = (data.ndcgSum / data.count).toFixed(4);
        const countPad = data.count.toString().padEnd(5);

        console.log(`| ${mode.padEnd(16)} | ${countPad} | ${avgRecall.padEnd(8)} | ${avgNDCG.padEnd(7)} |`);
    }
    console.log('---------------------------------------------------------');
}

main();
