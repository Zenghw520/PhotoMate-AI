import { assert, assertEquals } from "../providers/test_utils.ts";
import {
  cacheFreshness,
  coordinateGrid,
  createCacheStore,
  makeCacheKey,
} from "./cache.ts";
import type { DatabaseClient } from "./cache.ts";
import { claimAiUsage } from "./usage.ts";

Deno.test("cache: freshness, coordinate privacy grid and deterministic keys", async () => {
  const now = new Date("2026-01-02T00:20:00Z");
  assertEquals(cacheFreshness(null, now), "MISSING");
  assertEquals(
    cacheFreshness({
      payload: {},
      sourceUpdatedAt: null,
      fetchedAt: "2026-01-02T00:00:00Z",
      expiresAt: "2026-01-02T00:30:00Z",
    }, now),
    "FRESH",
  );
  assertEquals(
    cacheFreshness({
      payload: {},
      sourceUpdatedAt: null,
      fetchedAt: "2026-01-02T00:00:00Z",
      expiresAt: "2026-01-02T00:10:00Z",
    }, now),
    "STALE",
  );
  assertEquals(
    cacheFreshness({
      payload: {},
      sourceUpdatedAt: null,
      fetchedAt: "2026-01-02T00:00:00Z",
      expiresAt: "2026-01-02T00:01:00Z",
    }, now),
    "EXPIRED",
  );
  assertEquals(coordinateGrid(39.9042), 39.9);
  assertEquals(coordinateGrid(116.4074), 116.4);
  const first = await makeCacheKey("qweather", "today", {
    latitude: 39.9,
    longitude: 116.4,
  });
  const reordered = await makeCacheKey("qweather", "today", {
    longitude: 116.4,
    latitude: 39.9,
  });
  assertEquals(first, reordered);
  assert(!first.includes("39.9042"));
});

Deno.test("cache: database failures do not block weather fetches", async () => {
  const db = {
    from() {
      throw new Error("private database detail");
    },
  } as DatabaseClient;
  const cache = createCacheStore(db);
  assertEquals(await cache.get("key"), null);
  await cache.set("key", "qweather", { private: true }, null, 600);
});

Deno.test("usage: unique slots enforce the public AI limit and fail closed", async () => {
  const rows = new Set<string>();
  const db = {
    from(table: string) {
      assertEquals(table, "usage_counters");
      return {
        insertIfAbsent(value: { scope: string; slot: number }) {
          const key = `${value.scope}:${value.slot}`;
          const inserted = !rows.has(key);
          rows.add(key);
          return {
            select() {
              return Promise.resolve({
                data: inserted ? [{ slot: value.slot }] : [],
                error: null,
              });
            },
          };
        },
      };
    },
  } as unknown as DatabaseClient;
  assertEquals(await claimAiUsage(db, "2026-01-02", 1), true);
  assertEquals(await claimAiUsage(db, "2026-01-02", 1), false);
  assertEquals(await claimAiUsage(undefined, "2026-01-02", 1), false);
});
