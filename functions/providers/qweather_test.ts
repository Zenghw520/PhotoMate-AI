import { getQWeather } from "./qweather.ts";
import {
  assert,
  assertEquals,
  jsonResponse,
  withEnv,
  withFetchStub,
} from "./test_utils.ts";

const ENV = {
  QWEATHER_API_KEY: "test-qweather-key",
  QWEATHER_API_BASE_URL: "https://abc.qweatherapi.com",
};

function nowPayload() {
  return {
    code: "200",
    now: {
      obsTime: "2026-01-02T03:04+08:00",
      temp: "12.5",
      feelsLike: "11",
      text: "多云",
      wind360: "180",
      windDir: "南风",
      windSpeed: "8",
      humidity: "45",
      precip: "0",
      pressure: "1015",
      vis: "20",
    },
    refer: { sources: ["QWeather"] },
  };
}

function hourlyPayload() {
  return {
    code: "200",
    hourly: [{
      fxTime: "2026-01-02T04:00+08:00",
      temp: "13",
      text: "晴",
      wind360: "190",
      windDir: "南风",
      windSpeed: "9",
      humidity: "42",
      pop: "10",
      precip: "0.1",
      cloud: "20",
      vis: "25",
    }],
    refer: { sources: ["QWeather", "CMA"] },
  };
}

Deno.test("qweather: maps current, 72h forecast, v1 air quality and sources", async () => {
  await withEnv(ENV, async () => {
    await withFetchStub((call) => {
      const url = new URL(call.url);
      assertEquals(
        new Headers(call.init?.headers).get("X-QW-Api-Key"),
        "test-qweather-key",
      );
      assert(
        !url.searchParams.has("key"),
        "API key must not be placed in the URL",
      );
      if (url.pathname === "/v7/weather/now") {
        assertEquals(url.searchParams.get("location"), "121.47,31.23");
        return jsonResponse(nowPayload());
      }
      if (url.pathname === "/v7/weather/72h") {
        return jsonResponse(hourlyPayload());
      }
      if (url.pathname === "/airquality/v1/current/31.23/121.47") {
        return jsonResponse({
          indexes: [{ code: "cn-mee", aqi: 52, category: "良" }],
          primaryPollutant: { code: "pm2p5", name: "PM2.5" },
        });
      }
      return jsonResponse({ error: "unexpected path" }, 404);
    }, async (calls) => {
      const result = await getQWeather(31.2304, 121.4737);
      assertEquals(result.status, "OK");
      assertEquals(result.current?.observedAt, "2026-01-02T03:04+08:00");
      assertEquals(result.current?.temperature, 12.5);
      assertEquals(result.current?.cloud, null);
      assert(result.missingFields.includes("current.cloud"));
      assertEquals(result.current?.visibility, 20_000);
      assertEquals(result.current?.airQuality, {
        aqi: 52,
        category: "良",
        primaryPollutant: "PM2.5",
      });
      assertEquals(result.hourly.length, 1);
      assertEquals(result.hourly[0].precipitationProbability, 10);
      assertEquals(result.hourly[0].windSpeed, 2.5);
      assertEquals(result.hourly[0].visibility, 25000);
      assertEquals(result.hourly[0].time, "2026-01-02T04:00+08:00");
      assertEquals(result.sources, ["和风天气", "QWeather", "CMA"]);
      assertEquals(calls.length, 3);
    });
  });
});

Deno.test("qweather: unconfigured and untrusted base URL return safely", async () => {
  await withEnv({
    QWEATHER_API_KEY: null,
    QWEATHER_API_BASE_URL: ENV.QWEATHER_API_BASE_URL,
  }, async () => {
    await withFetchStub(() => jsonResponse({}), async (calls) => {
      const result = await getQWeather(31.2, 121.4);
      assertEquals(result.status, "UNCONFIGURED");
      assertEquals(calls.length, 0);
    });
  });
  await withEnv({
    ...ENV,
    QWEATHER_API_BASE_URL: "https://qweather.com.evil.example",
  }, async () => {
    await withFetchStub(() => jsonResponse({}), async (calls) => {
      const result = await getQWeather(31.2, 121.4);
      assertEquals(result.status, "UNAVAILABLE");
      assertEquals(calls.length, 0);
    });
  });
  await withEnv(
    { ...ENV, QWEATHER_API_BASE_URL: "http://devapi.qweather.com" },
    async () => {
      const result = await getQWeather(31.2, 121.4);
      assertEquals(result.status, "UNAVAILABLE");
    },
  );
});

Deno.test("qweather: accepts a bare, quoted API host and cleans the key", async () => {
  await withEnv({
    QWEATHER_API_KEY: '"test-qweather-key"',
    QWEATHER_API_BASE_URL: '"abc.qweatherapi.com"',
  }, async () => {
    await withFetchStub((call) => {
      const url = new URL(call.url);
      assertEquals(url.origin, "https://abc.qweatherapi.com");
      assertEquals(
        new Headers(call.init?.headers).get("X-QW-Api-Key"),
        "test-qweather-key",
      );
      if (url.pathname === "/v7/weather/now") return jsonResponse(nowPayload());
      if (url.pathname === "/v7/weather/72h") {
        return jsonResponse(hourlyPayload());
      }
      return jsonResponse({ indexes: [] });
    }, async () => {
      const result = await getQWeather(31.2, 121.4);
      assertEquals(result.status, "OK");
      assertEquals(result.current?.temperature, 12.5);
    });
  });
});

Deno.test("qweather: falls back to 24h hourly when 72h is unavailable", async () => {
  await withEnv(ENV, async () => {
    await withFetchStub((call) => {
      const path = new URL(call.url).pathname;
      if (path === "/v7/weather/now") return jsonResponse(nowPayload());
      if (path === "/v7/weather/72h") {
        return jsonResponse({ error: "forbidden" }, 403);
      }
      if (path === "/v7/weather/24h") return jsonResponse(hourlyPayload());
      return jsonResponse({ indexes: [] });
    }, async (calls) => {
      const result = await getQWeather(31.2, 121.4);
      assertEquals(result.status, "OK");
      assertEquals(result.hourly.length, 1);
      assert(
        calls.some((call) => new URL(call.url).pathname === "/v7/weather/72h"),
      );
      assert(
        calls.some((call) => new URL(call.url).pathname === "/v7/weather/24h"),
      );
    });
  });
});

Deno.test("qweather: air-quality permission failure does not fail main weather", async () => {
  await withEnv(ENV, async () => {
    await withFetchStub((call) => {
      const path = new URL(call.url).pathname;
      if (path === "/v7/weather/now") return jsonResponse(nowPayload());
      if (path === "/v7/weather/72h") return jsonResponse(hourlyPayload());
      return jsonResponse({ error: "private upstream detail" }, 403);
    }, async () => {
      const result = await getQWeather(31.2, 121.4);
      assertEquals(result.status, "OK");
      assertEquals(result.current?.temperature, 12.5);
      assertEquals(result.current?.airQuality, null);
      assertEquals(result.hourly.length, 1);
    });
  });
});

Deno.test("qweather: malformed main responses become UNAVAILABLE without upstream details", async () => {
  await withEnv(ENV, async () => {
    await withFetchStub((call) => {
      const path = new URL(call.url).pathname;
      if (path === "/v7/weather/now") return new Response("not-json");
      if (path === "/v7/weather/72h") return jsonResponse(hourlyPayload());
      return jsonResponse({ indexes: [] });
    }, async () => {
      const result = await getQWeather(31.2, 121.4);
      assertEquals(result.status, "UNAVAILABLE");
      assertEquals(result.current, null);
      assertEquals(result.hourly, []);
      assert(!result.message?.includes("not-json"));
    });
  });
});
