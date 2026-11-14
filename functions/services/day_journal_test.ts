import { assert, assertEquals } from "../providers/test_utils.ts";
import {
  jsonResponse,
  withEnv,
  withFetchStub,
} from "../providers/test_utils.ts";
import type { HourlyWeather } from "../shared/contracts.ts";
import type { DatabaseClient } from "./cache.ts";
import {
  journalHasPastHours,
  mergeDayJournal,
  mergeHourlyForScoring,
} from "./day_journal.ts";
import { getTodayPhotography } from "./today.ts";

function mockDatabase(options: { ignoreWeatherCache?: boolean } = {}) {
  const rows = new Map<string, Record<string, unknown>>();
  const db = {
    from(table: string) {
      assertEquals(table, "provider_cache");
      let mode: "select" | "update" | "insert" = "select";
      let selectedKey = "";
      let pending: Record<string, unknown> | null = null;
      const execute = () => {
        if (mode === "update" && pending) {
          if (!rows.has(selectedKey)) return { data: [], error: null };
          rows.set(selectedKey, pending);
          return { data: [{ cache_key: selectedKey }], error: null };
        }
        if (mode === "insert" && pending) {
          const key = String(pending.cache_key);
          if (rows.has(key)) return { data: [], error: null };
          rows.set(key, pending);
          return { data: [{ cache_key: key }], error: null };
        }
        if (
          options.ignoreWeatherCache &&
          (selectedKey.startsWith("qweather:forecast72") ||
            selectedKey.startsWith("weather:merged"))
        ) {
          return { data: [], error: null };
        }
        const row = rows.get(selectedKey);
        return { data: row ? [{ ...row }] : [], error: null };
      };
      const query = {
        select() {
          return query;
        },
        eq(column: string, value: string | number) {
          assertEquals(column, "cache_key");
          selectedKey = String(value);
          return query;
        },
        limit() {
          return Promise.resolve(execute());
        },
        update(value: Record<string, unknown>) {
          mode = "update";
          pending = value;
          return query;
        },
        insertIfAbsent(value: Record<string, unknown>) {
          mode = "insert";
          pending = value;
          return query;
        },
        then(
          resolve: (value: unknown) => unknown,
          reject?: (reason: unknown) => unknown,
        ) {
          return Promise.resolve(execute()).then(resolve, reject);
        },
      };
      return query;
    },
  } as unknown as DatabaseClient;
  return { db, rows };
}

function hourly(
  time: string,
  overrides: Partial<HourlyWeather> = {},
): HourlyWeather {
  return {
    time,
    temperature: 20,
    condition: "多云",
    humidity: 70,
    cloud: 50,
    precipitationProbability: 10,
    precipitation: 0,
    windSpeed: 2,
    windDirection: "东北风",
    visibility: 20_000,
    ...overrides,
  };
}

Deno.test("day journal: preserves first captured hours and adds later ones", async () => {
  const { db } = mockDatabase();
  const location = { latitude: 23.087, longitude: 114.378 };
  const date = "2026-11-13";
  const firstNow = new Date("2026-11-13T04:00:00+08:00");
  const first = await mergeDayJournal(db, location, date, [
    hourly("2026-11-13T05:00:00+08:00", { cloud: 40 }),
    hourly("2026-11-13T06:00:00+08:00", { cloud: 50 }),
  ], firstNow);
  assert(first);
  assertEquals(first!.createdAt, firstNow.toISOString());
  assertEquals(first!.hours.length, 2);

  const secondNow = new Date("2026-11-13T15:00:00+08:00");
  const fresh = [
    hourly("2026-11-13T06:00:00+08:00", { cloud: 90 }),
    hourly("2026-11-13T15:00:00+08:00", { cloud: 30 }),
    hourly("2026-11-13T16:00:00+08:00", { cloud: 20 }),
  ];
  const second = await mergeDayJournal(db, location, date, fresh, secondNow);
  assertEquals(second!.hours.length, 4);
  assertEquals(
    second!.hours.find((entry) => entry.time.includes("T06:00"))?.cloud,
    50,
  );
  assertEquals(second!.createdAt, firstNow.toISOString());

  const scoring = mergeHourlyForScoring(fresh, second, secondNow);
  assert(scoring.some((entry) => entry.time.includes("T05:00")));
  assert(scoring.some((entry) => entry.time.includes("T16:00")));
  assertEquals(
    scoring.find((entry) => entry.time.includes("T06:00"))?.cloud,
    90,
  );
  assert(journalHasPastHours(second, secondNow));
  assert(!journalHasPastHours(second, firstNow));
});

function nowPayload(time: string) {
  return {
    code: "200",
    now: {
      obsTime: time,
      temp: "20",
      feelsLike: "20",
      text: "多云",
      wind360: "45",
      windDir: "东北风",
      windSpeed: "7.2",
      humidity: "70",
      precip: "0",
      pressure: "1012",
      vis: "20",
    },
    refer: { sources: ["QWeather"] },
  };
}

function forecastPayload(startHour: number, count: number) {
  return {
    code: "200",
    hourly: Array.from({ length: count }, (_, index) => {
      const hour = startHour + index;
      return {
        fxTime: `2026-11-13T${String(hour).padStart(2, "0")}:00+08:00`,
        temp: "20",
        text: "多云",
        wind360: "45",
        windDir: "东北风",
        windSpeed: "7.2",
        humidity: "70",
        pop: "10",
        precip: "0",
        cloud: "50",
        vis: "20",
      };
    }),
    refer: { sources: ["QWeather"] },
  };
}

Deno.test("day journal: past dawn score is recomputed from retained morning forecast", async () => {
  const { db, rows } = mockDatabase({ ignoreWeatherCache: true });
  let phase = 0;
  await withEnv({
    QWEATHER_API_KEY: "test-qweather-key",
    QWEATHER_API_BASE_URL: "https://abc.qweatherapi.com",
    OPENWEATHER_API_KEY: null,
    DEEPSEEK_API_KEY: null,
  }, async () => {
    await withFetchStub((call) => {
      const url = new URL(call.url);
      if (url.pathname === "/v7/weather/now") {
        return jsonResponse(nowPayload(
          phase === 0 ? "2026-11-13T04:00+08:00" : "2026-11-13T15:00+08:00",
        ));
      }
      if (url.pathname === "/v7/weather/72h") {
        return jsonResponse(
          phase === 0 ? forecastPayload(4, 20) : forecastPayload(15, 9),
        );
      }
      if (url.pathname.startsWith("/airquality/v1/current/")) {
        return jsonResponse({
          indexes: [{ code: "cn-mee", aqi: 40, category: "优" }],
          primaryPollutant: { code: "pm2p5", name: "PM2.5" },
        });
      }
      return jsonResponse({ error: "unexpected" }, 404);
    }, async () => {
      const location = {
        name: "惠州市惠城区",
        latitude: 23.087173,
        longitude: 114.377551,
        precision: "DISTRICT" as const,
      };
      const first = await getTodayPhotography(
        location,
        "LANDSCAPE",
        db,
        new Date("2026-11-13T04:00:00+08:00"),
      );
      assert(first.potential.dawn.score !== null);
      assert(rows.size > 0, "weather and day journal entries are stored");

      phase = 1;
      const second = await getTodayPhotography(
        location,
        "LANDSCAPE",
        db,
        new Date("2026-11-13T15:00:00+08:00"),
      );
      assert(
        second.weather.hourly.every((entry) =>
          Date.parse(entry.time) >=
            Date.parse("2026-11-13T15:00:00+08:00")
        ),
        "fresh forecast starts at the current hour",
      );
      assert(
        second.potential.dawn.score !== null,
        "past dawn is recomputed from the retained morning forecast",
      );
      assert(
        second.warnings.some((warning) => warning.includes("回算")),
        "page discloses that past scores use retained data",
      );
    });
  });
});
