/**
 * build-community-score.mjs
 *
 * Computes a composite CommunityScore for every sealed set by blending:
 *   - googleTrendsScore (0.35) — from existing trends snapshot data in
 *     sealed-forecast-ml manifest; defaults to 50 when unavailable.
 *   - redditScore      (0.45) — live Reddit search across r/PokemonTCG (0.7)
 *     and r/pkmntcg (0.3), with sentiment adjustment.
 *   - forumScore       (0.20) — placeholder neutral 50 (can be wired later
 *     to PokeBeach/Limitless/etc. when API access is available).
 *
 * communityScore = round(0.45 * redditScore + 0.35 * googleTrendsScore + 0.20 * forumScore)
 *
 * Outputs: src/lib/data/sealed-ml/community-score.json
 *
 * HTTP responses are cached in scripts/.cache/community/<sha1>.json so
 * re-runs are fast. Throttle: max 1 request/second to Reddit.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

// ─── Paths ────────────────────────────────────────────────────────────────────
const CATALOG_PATH = path.join(ROOT, "src/lib/data/sealed-ml/sealed-catalog.json");
const PRODUCTS_PATH = path.join(ROOT, "src/lib/data/sealed-ml/products.json");
const OUTPUT_PATH = path.join(ROOT, "src/lib/data/sealed-ml/community-score.json");
const CACHE_DIR = path.join(ROOT, "scripts/.cache/community");

// ─── Weights ──────────────────────────────────────────────────────────────────
const WEIGHTS = { reddit: 0.45, googleTrends: 0.35, forum: 0.20 };

// ─── Reddit config ────────────────────────────────────────────────────────────
const REDDIT_UA = "pokemon-investing/1.0 (community-score-builder)";
const SUBREDDITS = [
  { name: "PokemonTCG", weight: 0.7 },
  { name: "pkmntcg",    weight: 0.3 },
];
const REDDIT_LIMIT = 50;
const TOP_POST_COUNT = 25;
const THROTTLE_MS = 1050; // just over 1 second

// ─── Sentiment keywords ───────────────────────────────────────────────────────
const POSITIVE_TOKENS = new Set([
  "hype","fire","amazing","love","grail","worth","invest","🔥","incredible",
  "underrated","goat","sleeper","gem","peak","must","cop","buy","bullish",
]);
const NEGATIVE_TOKENS = new Set([
  "dud","mid","skip","trash","bad pulls","disappointing","scam","fake","overpriced",
  "regret","boring","mediocre","flop","dead","avoid","bearish","waste",
]);

// ─── Helpers ──────────────────────────────────────────────────────────────────
function loadJson(p) {
  return JSON.parse(readFileSync(p, "utf8"));
}

function sha1(str) {
  return createHash("sha1").update(str).digest("hex");
}

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function cacheGet(key) {
  const file = path.join(CACHE_DIR, `${sha1(key)}.json`);
  if (existsSync(file)) {
    try {
      const parsed = JSON.parse(readFileSync(file, "utf8"));
      // Cache valid for 24 hours
      if (Date.now() - new Date(parsed._cachedAt).getTime() < 24 * 60 * 60 * 1000) {
        return parsed.data;
      }
    } catch {
      // ignore stale/corrupt cache
    }
  }
  return null;
}

function cachePut(key, data) {
  ensureDir(CACHE_DIR);
  const file = path.join(CACHE_DIR, `${sha1(key)}.json`);
  writeFileSync(file, JSON.stringify({ _cachedAt: new Date().toISOString(), data }, null, 2));
}

let lastRequestTime = 0;
async function throttledFetch(url, options = {}) {
  const now = Date.now();
  const wait = THROTTLE_MS - (now - lastRequestTime);
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastRequestTime = Date.now();

  const cached = cacheGet(url);
  if (cached !== null) return cached;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": REDDIT_UA,
        "Accept": "application/json",
        ...(options.headers ?? {}),
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      if (res.status === 429) {
        console.warn(`  Rate-limited on ${url}, backing off 5s`);
        await new Promise(r => setTimeout(r, 5000));
        lastRequestTime = Date.now();
      }
      return null;
    }

    const data = await res.json();
    cachePut(url, data);
    return data;
  } catch (err) {
    console.warn(`  Fetch failed for ${url}: ${err.message}`);
    return null;
  }
}

// ─── Reddit fetching ──────────────────────────────────────────────────────────
async function fetchRedditSearch(subreddit, setName) {
  const q = encodeURIComponent(setName);
  const url = `https://www.reddit.com/r/${subreddit}/search.json?q=${q}&restrict_sr=on&sort=relevance&t=year&limit=${REDDIT_LIMIT}`;
  const data = await throttledFetch(url);
  if (!data?.data?.children) return null;
  return data.data.children.map(c => c.data);
}

function scoreSentiment(posts) {
  let pos = 0, neg = 0;
  const slicedPosts = posts.slice(0, TOP_POST_COUNT);
  for (const post of slicedPosts) {
    const text = `${post.title || ""} ${post.selftext || ""}`.toLowerCase();
    for (const token of POSITIVE_TOKENS) {
      if (text.includes(token)) pos++;
    }
    for (const token of NEGATIVE_TOKENS) {
      if (text.includes(token)) neg++;
    }
  }
  const total = pos + neg;
  if (total === 0) return 0;
  return (pos - neg) / total; // [-1, 1]
}

function computeRawRedditScore(posts) {
  if (!posts || posts.length === 0) return 0;
  const postCount = Math.min(posts.length, REDDIT_LIMIT);
  const topPosts = posts.slice(0, TOP_POST_COUNT);
  // Engagement sum: score * upvote_ratio (weighted by quality)
  const engagementSum = topPosts.reduce((acc, p) => {
    const score = typeof p.score === "number" ? Math.max(0, p.score) : 0;
    const ratio = typeof p.upvote_ratio === "number" ? p.upvote_ratio : 0.5;
    return acc + score * ratio;
  }, 0);
  return postCount + engagementSum;
}

async function fetchSetRedditData(setName) {
  const results = {};
  for (const { name: sub, weight } of SUBREDDITS) {
    const posts = await fetchRedditSearch(sub, setName);
    results[sub] = { posts: posts ?? [], weight };
  }
  return results;
}

// ─── Load existing google trends signal ───────────────────────────────────────
function loadGoogleTrendsMap() {
  // Try to load from manifest products.json (has googleTrendsScore per setId)
  const map = {};
  if (existsSync(PRODUCTS_PATH)) {
    const products = loadJson(PRODUCTS_PATH);
    for (const p of products) {
      if (p.setId && typeof p.googleTrendsScore === "number") {
        map[p.setId] = p.googleTrendsScore;
      }
    }
  }
  console.log(`Loaded googleTrendsScore for ${Object.keys(map).length} sets from manifest`);
  return map;
}

// ─── Normalization ────────────────────────────────────────────────────────────
function minMaxNormalize(values, targetMin = 0, targetMax = 100) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max === min) return values.map(() => 50);
  return values.map(v => targetMin + ((v - min) / (max - min)) * (targetMax - targetMin));
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// ─── Stats helpers ────────────────────────────────────────────────────────────
function median(arr) {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function mean(arr) {
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("=== build-community-score ===\n");
  ensureDir(CACHE_DIR);

  const catalog = loadJson(CATALOG_PATH);
  // Deduplicate by setId, keeping first occurrence
  const setMap = new Map();
  for (const entry of catalog) {
    if (!setMap.has(entry.setId)) {
      setMap.set(entry.setId, entry.name);
    }
  }
  const sets = [...setMap.entries()].map(([setId, name]) => ({ setId, name }));
  console.log(`Processing ${sets.length} unique sets\n`);

  const trendsMap = loadGoogleTrendsMap();

  // ─── Fetch Reddit for all sets ─────────────────────────────────────────────
  const rawRedditScores = [];
  const redditData = [];

  console.log("Fetching Reddit data (1 req/s, cached)...");
  for (let i = 0; i < sets.length; i++) {
    const { setId, name } = sets[i];
    process.stdout.write(`  [${i + 1}/${sets.length}] ${name}... `);

    const subData = await fetchSetRedditData(name);

    let weightedRaw = 0;
    let totalPosts = 0;
    let allPosts = [];
    for (const [, { posts, weight }] of Object.entries(subData)) {
      weightedRaw += computeRawRedditScore(posts) * weight;
      totalPosts += posts.length;
      allPosts = allPosts.concat(posts);
    }
    const sentimentDelta = scoreSentiment(allPosts);

    rawRedditScores.push(weightedRaw);
    redditData.push({ setId, name, weightedRaw, totalPosts, allPosts, sentimentDelta });
    console.log(`posts=${totalPosts}, raw=${weightedRaw.toFixed(1)}, sentiment=${sentimentDelta.toFixed(2)}`);
  }

  // Normalize raw Reddit scores to 0-100
  const normalizedReddit = rawRedditScores.some(v => v > 0)
    ? minMaxNormalize(rawRedditScores)
    : rawRedditScores.map(() => 50);

  // ─── Compose final scores ──────────────────────────────────────────────────
  const output = {
    generatedAt: new Date().toISOString(),
    weights: WEIGHTS,
    sets: {},
  };

  for (let i = 0; i < sets.length; i++) {
    const { setId, name, totalPosts, sentimentDelta } = redditData[i];

    // Sub-signals
    const googleTrendsScore = trendsMap[setId] ?? 50;

    // Reddit score with sentiment adjustment
    const baseReddit = normalizedReddit[i];
    const sentimentMultiplier = 1 + 0.10 * sentimentDelta; // ±10% for sentiment
    const redditScore = clamp(Math.round(baseReddit * sentimentMultiplier), 0, 100);

    // Forum placeholder (wired to 50 neutral; extend here for PokeBeach, etc.)
    const forumScore = 50;

    // Composite
    const communityScore = Math.round(
      WEIGHTS.reddit * redditScore +
      WEIGHTS.googleTrends * googleTrendsScore +
      WEIGHTS.forum * forumScore
    );

    output.sets[setId] = {
      setName: name,
      communityScore: clamp(communityScore, 0, 100),
      redditScore: clamp(redditScore, 0, 100),
      googleTrendsScore: clamp(googleTrendsScore, 0, 100),
      forumScore,
      redditPostCount: totalPosts,
      redditSentiment: parseFloat(sentimentDelta.toFixed(3)),
      lastUpdated: new Date().toISOString(),
    };
  }

  writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
  console.log(`\nWrote ${OUTPUT_PATH}`);

  // ─── Summary stats ─────────────────────────────────────────────────────────
  const scores = Object.values(output.sets).map(s => s.communityScore);
  const sorted = [...output.sets.entries ? [] : Object.entries(output.sets)]
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => b.communityScore - a.communityScore);

  const allEntries = Object.entries(output.sets)
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => b.communityScore - a.communityScore);

  console.log("\n=== SUMMARY ===");
  console.log(`  Mean:   ${mean(scores).toFixed(1)}`);
  console.log(`  Median: ${median(scores).toFixed(1)}`);
  console.log(`  Min:    ${Math.min(...scores)}`);
  console.log(`  Max:    ${Math.max(...scores)}`);

  console.log("\n  Top 5:");
  for (const e of allEntries.slice(0, 5)) {
    console.log(`    ${e.setName.padEnd(40)} communityScore=${e.communityScore} (reddit=${e.redditScore}, gt=${e.googleTrendsScore})`);
  }

  console.log("\n  Bottom 5:");
  for (const e of allEntries.slice(-5)) {
    console.log(`    ${e.setName.padEnd(40)} communityScore=${e.communityScore} (reddit=${e.redditScore}, gt=${e.googleTrendsScore})`);
  }

  const neutralCount = Object.values(output.sets).filter(
    s => s.redditPostCount === 0
  ).length;
  if (neutralCount > 0) {
    console.log(`\n  ⚠ ${neutralCount} sets fell back to neutral Reddit score (no posts fetched)`);
  }

  const realDataCount = Object.values(output.sets).filter(s => s.redditPostCount > 0).length;
  const pct = Math.round(100 * realDataCount / scores.length);
  console.log(`\n  Reddit coverage: ${realDataCount}/${scores.length} sets (${pct}%)`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
