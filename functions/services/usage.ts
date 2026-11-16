import type { DatabaseClient } from "./cache.ts";

export async function claimAiUsage(
  db: DatabaseClient | undefined,
  date: string,
  dailyLimit = 120,
): Promise<boolean> {
  if (!db || dailyLimit < 1) return false;
  const scope = `deepseek:${date}`;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const values = new Uint32Array(1);
    crypto.getRandomValues(values);
    const slot = values[0] % dailyLimit;
    try {
      const result = await db.from("usage_counters").insertIfAbsent({
        scope,
        slot,
        created_at: new Date().toISOString(),
      }, { onConflict: "scope,slot" }).select("slot");
      if (result.error) return false;
      if (result.data?.length) return true;
    } catch {
      return false;
    }
  }
  return false;
}
