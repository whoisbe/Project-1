const BASE = process.env.BASE_URL ?? "http://localhost:5173";

const queries = [
  "vector search",
  "hybrid search rrf",
  "filter_by facet filters",
  "synonyms",
  "typo tolerance",
  "collection schema",
  "highlighting snippets",
  "curation overrides",
  "joins",
  "api key authentication",
];

const modes = ["keyword", "semantic", "hybrid"];

function pick(o, keys) {
  const out = {};
  for (const k of keys) if (o[k] !== undefined) out[k] = o[k];
  return out;
}

function short(s, n = 90) {
  if (!s) return "";
  return s.replace(/\s+/g, " ").slice(0, n) + (s.length > n ? "…" : "");
}

async function runOne(q, mode) {
  const url = new URL(`${BASE}/api/search`);
  url.searchParams.set("q", q);
  url.searchParams.set("mode", mode);
  url.searchParams.set("limit", "10");
  url.searchParams.set("rerank", "true");

  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${mode} "${q}" => ${res.status} ${text}`);
  }
  return res.json();
}

function summarize(json) {
  const { timings_ms, results } = json;
  const rows = results.map((r, i) => ({
    i: i + 1,
    title: r.title,
    section_path: r.section_path,
    url: r.url,
    meta: pick(r, ["keyword_rank", "vector_rank", "rrf_score", "rerank_score"]),
    snippet: short(r.snippet),
  }));
  return { timings_ms, rows };
}

function findWeirdness(mode, rows) {
  const issues = [];

  // duplicates by url
  const seenUrl = new Map();
  rows.forEach((r) => {
    const k = r.url;
    if (seenUrl.has(k)) issues.push(`Duplicate URL in top10: #${seenUrl.get(k)} and #${r.i} => ${k}`);
    else seenUrl.set(k, r.i);
  });

  // mode consistency checks
  rows.forEach((r) => {
    if (mode === "keyword" && r.meta.vector_rank !== undefined) issues.push(`Keyword mode has vector_rank at #${r.i}`);
    if (mode === "semantic" && r.meta.keyword_rank !== undefined) issues.push(`Semantic mode has keyword_rank at #${r.i}`);
    if (mode !== "hybrid" && r.meta.rrf_score !== undefined) issues.push(`${mode} mode has rrf_score at #${r.i}`);
  });

  // rerank sanity: rerank_score present in hybrid when rerank=true
  if (mode === "hybrid") {
    const missing = rows.filter(r => r.meta.rerank_score === undefined);
    if (missing.length) issues.push(`Hybrid missing rerank_score for ${missing.length} results`);
  }

  // weird section_path
  rows.forEach((r) => {
    if (!r.section_path || r.section_path.length < 2) issues.push(`Empty/short section_path at #${r.i}`);
  });

  return issues;
}

(async () => {
  for (const q of queries) {
    console.log("\n============================================================");
    console.log(`QUERY: ${q}`);
    console.log("============================================================");

    for (const mode of modes) {
      const json = await runOne(q, mode);
      const { timings_ms, rows } = summarize(json);

      console.log(`\n--- MODE: ${mode} | timings(ms): ${JSON.stringify(timings_ms)} ---`);
      const issues = findWeirdness(mode, rows);
      if (issues.length) {
        console.log("!! ISSUES:");
        for (const it of issues) console.log(`- ${it}`);
      }

      for (const r of rows) {
        console.log(
          `#${r.i} ${r.title} | ${r.section_path} | ${JSON.stringify(r.meta)}\n    ${r.url}\n    ${r.snippet}`
        );
      }
    }
  }
})().catch((e) => {
  console.error("\nSMOKE FAILED:", e.message);
  process.exit(1);
});