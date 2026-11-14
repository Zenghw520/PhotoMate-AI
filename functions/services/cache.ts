export interface CacheEntry {
  payload: unknown;
  sourceUpdatedAt: string | null;
  fetchedAt: string;
  expiresAt: string;
}

export interface DatabaseResult {
  data?: Array<Record<string, unknown>> | null;
  error?: unknown;
}

export interface DatabaseQuery extends PromiseLike<DatabaseResult> {
  select(columns: string): DatabaseQuery;
  eq(column: string, value: string | number): DatabaseQuery;
  limit(count: number): DatabaseQuery;
  insertIfAbsent(
    value: Record<string, unknown>,
    options: { onConflict: string },
  ): DatabaseQuery;
  update(value: Record<string, unknown>): DatabaseQuery;
}

export interface DatabaseClient {
  from(table: string): DatabaseQuery;
}

export interface CacheStore {
  get(key: string): Promise<CacheEntry | null>;
  set(
    key: string,
    provider: string,
    payload: unknown,
    sourceUpdatedAt: string | null,
    ttlSeconds: number,
  ): Promise<void>;
}

export function createCacheStore(db?: DatabaseClient): CacheStore {
  return {
    async get(key) {
      if (!db) return null;
      try {
        const result = await db.from("provider_cache").select(
          "payload,source_updated_at,fetched_at,expires_at",
        ).eq("cache_key", key).limit(1);
        if (result.error || !result.data?.[0]) return null;
        const row = result.data[0] as {
          payload: unknown;
          source_updated_at: string | null;
          fetched_at: string;
          expires_at: string;
        };
        return {
          payload: row.payload,
          sourceUpdatedAt: row.source_updated_at,
          fetchedAt: row.fetched_at,
          expiresAt: row.expires_at,
        };
      } catch {
        return null;
      }
    },
    async set(key, provider, payload, sourceUpdatedAt, ttlSeconds) {
      if (!db) return;
      const now = new Date();
      const value = {
        cache_key: key,
        provider,
        payload,
        source_updated_at: sourceUpdatedAt,
        fetched_at: now.toISOString(),
        expires_at: new Date(now.getTime() + ttlSeconds * 1000).toISOString(),
      };
      try {
        const updated = await db.from("provider_cache")
          .update(value)
          .eq("cache_key", key)
          .select("cache_key");
        if (!updated.data?.length) {
          await db.from("provider_cache")
            .insertIfAbsent(value, { onConflict: "cache_key" })
            .select("cache_key");
        }
      } catch {
        return;
      }
    },
  };
}

export function cacheFreshness(
  entry: CacheEntry | null,
  now = new Date(),
): "FRESH" | "STALE" | "EXPIRED" | "MISSING" {
  if (!entry) return "MISSING";
  const expires = new Date(entry.expiresAt).getTime();
  if (!Number.isFinite(expires) || expires <= now.getTime() - 15 * 60 * 1000) {
    return "EXPIRED";
  }
  return expires < now.getTime() ? "STALE" : "FRESH";
}

export async function makeCacheKey(
  provider: string,
  operation: string,
  parameters: Record<string, string | number>,
) {
  const normalized = Object.keys(parameters).sort().map((key) =>
    `${key}:${parameters[key]}`
  ).join("|");
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(normalized),
  );
  const hash = Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
  return `${provider}:${operation}:${hash}`;
}

export function coordinateGrid(value: number) {
  return Number((Math.round(value / 0.05) * 0.05).toFixed(3));
}
