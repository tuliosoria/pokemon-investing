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
  // Cache lookup first — cached entries skip the throttle entirely.
  const cached = cacheGet(url);
  if (cached !== null) return cached;

  // Retry with exponential backoff on transient failures (429 / 5xx / network).
  // Reddit's anonymous endpoint is aggressively rate-limited; one retry pass
  // isn't enough so we attempt up to MAX_ATTEMPTS with exponential backoff.
  const MAX_ATTEMPTS = 4;
  let backoffMs = 2000;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const now = Date.now();
    const wait = THROTTLE_MS - (now - lastRequestTime);
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    lastRequestTime = Date.now();

    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": REDDIT_UA,
          "Accept": "application/json",
          ...(options.headers ?? {}),
        },
        signal: AbortSignal.timeout(15_000),
      });

      if (res.ok) {
        const data = await res.json();
        cachePut(url, data);
        return data;
      }

      // Retry on transient errors. 404 means the subreddit/path doesn't
      // exist — there's no point retrying it.
      const transient = res.status === 429 || res.status === 403 || res.status >= 500;
      if (!transient || attempt === MAX_ATTEMPTS) {
        if (attempt === MAX_ATTEMPTS) {
          console.warn(`  Giving up on ${url} after ${attempt} attempts (status ${res.status})`);
        }
        return null;
      }
      console.warn(`  Status ${res.status} on attempt ${attempt}, backing off ${backoffMs}ms`);
      await new Promise(r => setTimeout(r, backoffMs));
      backoffMs *= 2;
      lastRequestTime = Date.now();
    } catch (err) {
      if (attempt === MAX_ATTEMPTS) {
        console.warn(`  Fetch failed for ${url} after ${attempt} attempts: ${err.message}`);
        return null;
      }
      console.warn(`  Fetch error on attempt ${attempt} (${err.message}), backing off ${backoffMs}ms`);
      await new Promise(r => setTimeout(r, backoffMs));
      backoffMs *= 2;
    }
  }
  return null;
}

// ─── Reddit fetching ──────────────────────────────────────────────────────────
async function fetchRedditSearch(subreddit, setName) {
  const q = encodeURIComponent(setName);
  const url = `https://www.reddit.com/r/${subreddit}/search.json?q=${q}&restrict_sr=on&sort=relevance&t=year&limit=${REDDIT_LIMIT}`;
  const data = await throttledFetch(url);
  // Distinguish "fetch failed" (null) from "fetch succeeded with no posts" ([]).
  // Without this, anonymous Reddit 403/429 responses would look identical to
  // "this set is unpopular" and tank the composite community score.
  if (data == null) return null;
  const children = data?.data?.children;
  if (!Array.isArray(children)) return null;
  return children.map(c => c.data);
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
    // posts === null means the request failed (rate-limit / 403 / network).
    // posts === [] means the request succeeded but Reddit returned no matches.
    results[sub] = { posts, weight };
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
  // For each set we capture both the raw weighted engagement (used for
  // min-max normalization across the population) and a `redditDataMissing`
  // flag — true when ALL subreddit fetches failed. Sets with missing data
  // are excluded from normalization and assigned a neutral redditScore=50,
  // so a transient Reddit outage during the build can't poison popular
  // modern sets with redditScore=0 → communityScore=28.
  const redditData = [];

  console.log("Fetching Reddit data (1 req/s, cached)...");
  for (let i = 0; i < sets.length; i++) {
    const { setId, name } = sets[i];
    process.stdout.write(`  [${i + 1}/${sets.length}] ${name}... `);

    const subData = await fetchSetRedditData(name);

    let weightedRaw = 0;
    let totalPosts = 0;
    let allPosts = [];
    let anySuccess = false;
    for (const [, { posts, weight }] of Object.entries(subData)) {
      if (posts == null) continue;
      anySuccess = true;
      weightedRaw += computeRawRedditScore(posts) * weight;
      totalPosts += posts.length;
      allPosts = allPosts.concat(posts);
    }
    const sentimentDelta = scoreSentiment(allPosts);
    const redditDataMissing = !anySuccess;

    redditData.push({
      setId,
      name,
      weightedRaw,
      totalPosts,
      allPosts,
      sentimentDelta,
      redditDataMissing,
    });
    const tag = redditDataMissing ? " [MISSING — fetch failed]" : "";
    console.log(`posts=${totalPosts}, raw=${weightedRaw.toFixed(1)}, sentiment=${sentimentDelta.toFixed(2)}${tag}`);
  }

  // ─── Second-chance pass for failed sets ───────────────────────────────────
  // Reddit's anonymous endpoint occasionally rate-limits us early in the run
  // when the throttle hasn't warmed up. Retry any sets that failed in the
  // first sweep with a longer 4-second cool-down between requests so they
  // get real data instead of falling through to the market-activity proxy.
  const failedIndices = redditData
    .map((r, i) => (r.redditDataMissing ? i : -1))
    .filter(i => i >= 0);
  if (failedIndices.length > 0) {
    console.log(`\nSecond-chance pass for ${failedIndices.length} failed sets (4s throttle)...`);
    const ORIGINAL_THROTTLE = THROTTLE_MS;
    // Mutate the throttle constant in-place via the closure variable.
    // (THROTTLE_MS is a const at module scope; we re-route through a longer
    // sleep here.)
    for (const idx of failedIndices) {
      const { setId, name } = sets[idx];
      process.stdout.write(`  retry ${name}... `);
      // Manual cool-down before each subreddit pair (covers both subs).
      await new Promise(r => setTimeout(r, 4000));
      const subData = await fetchSetRedditData(name);

      let weightedRaw = 0;
      let totalPosts = 0;
      let allPosts = [];
      let anySuccess = false;
      for (const [, { posts, weight }] of Object.entries(subData)) {
        if (posts == null) continue;
        anySuccess = true;
        weightedRaw += computeRawRedditScore(posts) * weight;
        totalPosts += posts.length;
        allPosts = allPosts.concat(posts);
      }
      if (anySuccess) {
        redditData[idx] = {
          setId,
          name,
          weightedRaw,
          totalPosts,
          allPosts,
          sentimentDelta: scoreSentiment(allPosts),
          redditDataMissing: false,
        };
        console.log(`recovered (posts=${totalPosts}, raw=${weightedRaw.toFixed(1)})`);
      } else {
        console.log(`still missing — falling back to market-activity proxy`);
      }
    }
    void ORIGINAL_THROTTLE;
  }

  // ─── Preserve good data from previous run ─────────────────────────────────
  // If a set still failed after the second-chance pass but the previous run
  // had real Reddit data for it, keep the previous numbers rather than
  // overwriting with redditDataMissing=true. Without this, a single
  // unlucky build (e.g. Reddit briefly unavailable from CI) would erase
  // months of accumulated community data and force every set onto the
  // market-activity fallback.
  let previousOutput = null;
  if (existsSync(OUTPUT_PATH)) {
    try {
      previousOutput = loadJson(OUTPUT_PATH);
    } catch {
      previousOutput = null;
    }
  }
  if (previousOutput?.sets) {
    for (let i = 0; i < redditData.length; i++) {
      const entry = redditData[i];
      if (!entry.redditDataMissing) continue;
      const prev = previousOutput.sets[entry.setId];
      if (prev && prev.redditPostCount > 0 && prev.redditDataMissing !== true) {
        // Carry forward the prior real data (preserve raw equivalent so
        // normalization still places this set sensibly relative to others).
        // We can't recover the raw score directly, but we can flag the
        // entry so the downstream composer reuses prev.redditScore as-is.
        redditData[i] = {
          ...entry,
          totalPosts: prev.redditPostCount,
          sentimentDelta: prev.redditSentiment ?? 0,
          redditDataMissing: false,
          carriedForward: true,
          previousRedditScore: prev.redditScore,
        };
      }
    }
  }


  // Normalize raw Reddit scores to 0-100 over sets that actually returned
  // data. Sets where every subreddit fetch failed are excluded from the
  // normalization range and later assigned a neutral 50.
  const liveScores = redditData
    .filter(r => !r.redditDataMissing)
    .map(r => r.weightedRaw);
  const liveMin = liveScores.length ? Math.min(...liveScores) : 0;
  const liveMax = liveScores.length ? Math.max(...liveScores) : 0;
  const normalizedReddit = redditData.map(r => {
    if (r.redditDataMissing) return 50;
    if (liveMax === liveMin) return 50;
    return ((r.weightedRaw - liveMin) / (liveMax - liveMin)) * 100;
  });

  // ─── Compose final scores ──────────────────────────────────────────────────
  const output = {
    generatedAt: new Date().toISOString(),
    weights: WEIGHTS,
    sets: {},
  };

  for (let i = 0; i < sets.length; i++) {
    const { setId, name, totalPosts, sentimentDelta, redditDataMissing } = redditData[i];
    const carriedForward = redditData[i].carriedForward === true;
    const previousRedditScore = redditData[i].previousRedditScore;

    // Sub-signals
    const googleTrendsScore = trendsMap[setId] ?? 50;

    // Reddit score with sentiment adjustment. When Reddit data is missing
    // the base score is already neutral (50), so the sentiment multiplier
    // (which is 1 + 0 = 1 anyway, since allPosts is empty) is a no-op.
    // Carried-forward entries reuse the previous run's redditScore directly
    // since we can't reconstruct the raw engagement.
    let redditScore;
    if (carriedForward && typeof previousRedditScore === "number") {
      redditScore = clamp(previousRedditScore, 0, 100);
    } else {
      const baseReddit = normalizedReddit[i];
      const sentimentMultiplier = 1 + 0.10 * sentimentDelta; // ±10% for sentiment
      redditScore = clamp(Math.round(baseReddit * sentimentMultiplier), 0, 100);
    }

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
      redditDataMissing,
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
