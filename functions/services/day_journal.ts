import type { HourlyWeather } from "../shared/contracts.ts";
import { coordinateGrid, createCacheStore, makeCacheKey } from "./cache.ts";
import type { DatabaseClient } from "./cache.ts";

export interface DayJournal {
  date: string;
  createdAt: string;
  hours: HourlyWeather[];
}

function isHourlyWeather(value: unknown): value is HourlyWeather {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<HourlyWeather>;
  return typeof entry.time === "string" && typeof entry.condition === "string";
}

function isDayJournal(value: unknown): value is DayJournal {
  if (!value || typeof value !== "object") return false;
  const journal = value as Partial<DayJournal>;
  return typeof journal.date === "string" &&
    typeof journal.createdAt === "string" && Array.isArray(journal.hours) &&
    journal.hours.every(isHourlyWeather);
}

export function mergeJournalEntries(
  existing: DayJournal | null,
  fresh: HourlyWeather[],
  date: string,
  now: Date,
): DayJournal {
  const hours = new Map<string, HourlyWeather>();
  for (const entry of existing?.hours ?? []) hours.set(entry.time, entry);
  for (const entry of fresh) {
    if (entry.time.slice(0, 10) !== date) continue;
    if (!hours.has(entry.time)) hours.set(entry.time, entry);
  }
  return {
    date,
    createdAt: existing?.createdAt ?? now.toISOString(),
    hours: [...hours.values()].sort((a, b) =>
      Date.parse(a.time) - Date.parse(b.time)
    ),
  };
}

export async function mergeDayJournal(
  db: DatabaseClient | undefined,
  location: { latitude: number; longitude: number },
  date: string,
  fresh: HourlyWeather[],
  now: Date,
): Promise<DayJournal | null> {
  if (!db) return null;
  const cache = createCacheStore(db);
  const key = await makeCacheKey("qweather-day", "journal", {
    latitude: coordinateGrid(location.latitude).toFixed(3),
    longitude: coordinateGrid(location.longitude).toFixed(3),
    date,
  });
  const cached = await cache.get(key);
  const existing = cached && isDayJournal(cached.payload)
    ? cached.payload
    : null;
  const journal = mergeJournalEntries(existing, fresh, date, now);
  if (journal.hours.length === 0) return existing;
  await cache.set(
    key,
    "qweather-day",
    journal,
    now.toISOString(),
    3 * 24 * 3600,
  );
  return journal;
}

/** Past hours prefer the day journal; future hours always use the latest forecast. */
export function mergeHourlyForScoring(
  fresh: HourlyWeather[],
  journal: DayJournal | null,
  now: Date,
): HourlyWeather[] {
  const nowMs = now.getTime();
  const journalHours = new Map((journal?.hours ?? []).map((entry) => [
    entry.time,
    entry,
  ]));
  const hours = new Map<string, HourlyWeather>();
  for (const entry of fresh) {
    const time = Date.parse(entry.time);
    if (time <= nowMs && journalHours.has(entry.time)) continue;
    hours.set(entry.time, entry);
  }
  for (const [time, entry] of journalHours) {
    const parsed = Date.parse(time);
    if (Number.isFinite(parsed) && parsed <= nowMs) {
      hours.set(time, entry);
    }
  }
  return [...hours.values()].sort((a, b) =>
    Date.parse(a.time) - Date.parse(b.time)
  );
}

export function journalHasPastHours(journal: DayJournal | null, now: Date) {
  return Boolean(
    journal?.hours.some((entry) => {
      const time = Date.parse(entry.time);
      return Number.isFinite(time) && time < now.getTime();
    }),
  );
}
