import { createHandler } from "./routes.ts";
import { getTodayPhotography } from "./services/today.ts";
import { assert, assertEquals, withEnv } from "./providers/test_utils.ts";

const ENV = {
  AMAP_API_KEY: null,
  QWEATHER_API_KEY: null,
  QWEATHER_API_BASE_URL: null,
  OPENWEATHER_API_KEY: null,
  DEEPSEEK_API_KEY: null,
};

Deno.test("routes: health, path normalization, method rejection and unknown routes", async () => {
  await withEnv(ENV, async () => {
    const handler = createHandler();
    for (
      const path of [
        "/functions/v1/app/health",
        "/app-d0123456789abcdef0123456789abcdef/health",
      ]
    ) {
      const response = await handler(
        new Request(`https://example.test${path}`),
      );
      assertEquals(response.status, 200);
      const body = await response.json();
      assertEquals(body.status, "OK");
      assertEquals(body.capabilities.weather, false);
      assert(!("QWEATHER_API_KEY" in body));
    }
    const rejected = await handler(
      new Request("https://example.test/functions/v1/app/health", {
        method: "POST",
      }),
    );
    assertEquals(rejected.status, 405);
    const missing = await handler(
      new Request("https://example.test/functions/v1/app/unknown"),
    );
    assertEquals(missing.status, 404);
  });
});

Deno.test("routes: unconfigured location calls fail honestly without an upstream request", async () => {
  await withEnv(ENV, async () => {
    const handler = createHandler();
    const response = await handler(
      new Request(
        "https://example.test/functions/v1/app/locations/search?q=%E5%8C%97%E4%BA%AC&limit=8",
      ),
    );
    assertEquals(response.status, 503);
    const body = await response.json();
    assertEquals(body.error.code, "LOCATION_UNCONFIGURED");
    assertEquals(body.error.retryable, false);

    const reverse = await handler(
      new Request("https://example.test/functions/v1/app/locations/reverse", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ latitude: 39.9042, longitude: 116.4074 }),
      }),
    );
    assertEquals(reverse.status, 503);
    assertEquals((await reverse.json()).error.code, "LOCATION_UNCONFIGURED");
  });
});

Deno.test("routes and aggregation: district coordinates produce real solar and rule plans without keys", async () => {
  await withEnv(ENV, async () => {
    const handler = createHandler();
    const response = await handler(
      new Request("https://example.test/functions/v1/app/photography/today", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          location: {
            name: "北京市东城区",
            latitude: 39.9042,
            longitude: 116.4074,
            precision: "DISTRICT",
          },
          theme: "LANDSCAPE",
        }),
      }),
    );
    assertEquals(response.status, 200);
    const body = await response.json();
    assertEquals(body.weather.status, "UNCONFIGURED");
    assertEquals(body.solar.algorithm, "NOAA_SOLAR_POSITION");
    assert(typeof body.solar.sunrise === "string");
    assertEquals(body.potential.dawn.score, null);
    assertEquals(body.potential.dusk.score, null);
    assertEquals(body.fireCloud.dawn.direction, "EAST");
    assertEquals(body.fireCloud.dusk.direction, "WEST");
    assertEquals(body.fireCloud.dusk.score, null);
    assert(typeof body.fireCloud.dusk.summary === "string");
    assert(body.timeline.length > 0);
    assertEquals(body.plans.mode, "RULE_BASED");
    assertEquals(body.plans.aiStatus, "DISABLED");
    assert(body.warnings.length >= 2);

    const fixed = await getTodayPhotography(
      {
        name: "上海市黄浦区",
        latitude: 31.2304,
        longitude: 121.4737,
        precision: "DISTRICT",
      },
      "TRAVEL",
      undefined,
      new Date("2026-01-02T00:00:00Z"),
    );
    assertEquals(fixed.date, "2026-01-02");
    assertEquals(fixed.weather.current, null);
    assert(fixed.timeline.every((slot) => slot.scoreMode !== "FULL"));

    const manual = await handler(
      new Request("https://example.test/functions/v1/app/photography/today", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          location: {
            name: "手动位置",
            latitude: 39.9042,
            longitude: 116.4074,
            precision: "MANUAL",
          },
          theme: "TRAVEL",
        }),
      }),
    );
    assertEquals(manual.status, 200);
    const manualBody = await manual.json();
    assert(
      manualBody.plans.items.every((plan: { locationNote: string }) =>
        plan.locationNote.includes("手动选择位置")
      ),
    );
  });
});

Deno.test("routes: prediction accepts today, tomorrow and the day after only", async () => {
  await withEnv(ENV, async () => {
    const handler = createHandler();
    const location = {
      name: "惠州市惠城区",
      latitude: 23.087173,
      longitude: 114.377551,
      precision: "DISTRICT",
    };
    for (const offset of [1, 2]) {
      const date = shanghaiDay(offset);
      const response = await handler(
        new Request("https://example.test/functions/v1/app/photography/today", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ location, theme: "LANDSCAPE", date }),
        }),
      );
      assertEquals(response.status, 200);
      const body = await response.json();
      assertEquals(body.date, date);
      assert(typeof body.solar.sunrise === "string");
    }

    const invalid = await handler(
      new Request("https://example.test/functions/v1/app/photography/today", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          location,
          theme: "LANDSCAPE",
          date: "2020-01-01",
        }),
      }),
    );
    assertEquals(invalid.status, 400);
    assertEquals((await invalid.json()).error.code, "INVALID_DATE");
  });
});

function shanghaiDay(offset: number) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return new Date(
    Date.UTC(
      Number(value.year),
      Number(value.month) - 1,
      Number(value.day) + offset,
    ),
  ).toISOString().slice(0, 10);
}

Deno.test("routes: invalid coordinates and malformed JSON are bounded client errors", async () => {
  const handler = createHandler();
  const invalid = await handler(
    new Request("https://example.test/functions/v1/app/photography/today", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        location: {
          name: "境外",
          latitude: 60,
          longitude: 10,
          precision: "DISTRICT",
        },
        theme: "LANDSCAPE",
      }),
    }),
  );
  assertEquals(invalid.status, 400);
  assertEquals((await invalid.json()).error.code, "UNSUPPORTED_REGION");
  const malformed = await handler(
    new Request("https://example.test/functions/v1/app/photography/today", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    }),
  );
  assertEquals(malformed.status, 400);
});
