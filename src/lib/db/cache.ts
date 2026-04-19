import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { getDynamo, getTableName } from "./dynamo";

/**
 * Two-layer cache: in-memory (L1) + DynamoDB (L2).
 *
 * L1 is fast but only lives within a single Lambda execution context.
 * L2 persists across invocations and cold starts.
 *
 * If DYNAMODB_TABLE is not set, only L1 is used (graceful degradation).
 */

// L1: in-memory cache (per Lambda instance)
const memCache = new Map<string, { data: unknown; expires: number }>();
const MEM_MAX = 300;

function memClean() {
  const now = Date.now();
  for (const [k, v] of memCache) {
    if (v.expires < now) memCache.delete(k);
  }
  if (memCache.size > MEM_MAX) {
    const sorted = [...memCache.entries()].sort(
      (a, b) => a[1].expires - b[1].expires
    );
    for (let i = 0; i < sorted.length - MEM_MAX; i++) {
      memCache.delete(sorted[i][0]);
    }
  }
}

function compositeKey(type: string, key: string): string {
  return `${type}#${key}`;
}

/**
 * Get a cached value. Checks L1 (memory) first, then L2 (DynamoDB).
 * Returns null on cache miss.
 */
export async function cacheGet<T>(type: string, key: string): Promise<T | null> {
  const ck = compositeKey(type, key);

  // L1: memory
  const mem = memCache.get(ck);
  if (mem && mem.expires > Date.now()) {
    return mem.data as T;
  }
  if (mem) memCache.delete(ck);

  // L2: DynamoDB
  const client = getDynamo();
  const table = getTableName();
  if (!client || !table) return null;

  try {
    const result = await client.send(
      new GetCommand({
        TableName: table,
        Key: { pk: `CACHE#${type}`, sk: key },
      })
    );

    if (!result.Item) return null;

    // Check TTL (DynamoDB TTL deletion is eventually consistent — items may linger)
    const ttl = result.Item.ttl as number;
    if (ttl && ttl < Math.floor(Date.now() / 1000)) return null;

    const data = JSON.parse(result.Item.data as string) as T;

    // Promote to L1 for subsequent calls in same invocation
    const expiresMs = ttl ? ttl * 1000 : Date.now() + 5 * 60 * 1000;
    memCache.set(ck, { data, expires: expiresMs });

    return data;
  } catch (err) {
    console.warn("DynamoDB cache get error:", err);
    return null;
  }
}

/**
 * Store a value in both L1 and L2 cache.
 * @param ttlSeconds  Time-to-live in seconds (default: 1800 = 30 min)
 */
export async function cachePut(
  type: string,
  key: string,
  data: unknown,
  ttlSeconds = 1800
): Promise<void> {
  const ck = compositeKey(type, key);
  const expiresMs = Date.now() + ttlSeconds * 1000;
  const ttlEpoch = Math.floor(expiresMs / 1000);

  // L1: memory
  memClean();
  memCache.set(ck, { data, expires: expiresMs });

  // L2: DynamoDB (fire-and-forget, don't block the response)
  const client = getDynamo();
  const table = getTableName();
  if (!client || !table) return;

  try {
    await client.send(
      new PutCommand({
        TableName: table,
        Item: {
          pk: `CACHE#${type}`,
          sk: key,
          data: JSON.stringify(data),
          ttl: ttlEpoch,
          createdAt: new Date().toISOString(),
        },
      })
    );
  } catch (err) {
    console.warn("DynamoDB cache put error:", err);
  }
}
