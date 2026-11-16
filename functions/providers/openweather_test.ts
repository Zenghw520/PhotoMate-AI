import { getOpenWeather } from "./openweather.ts";
import {
  assert,
  assertEquals,
  jsonResponse,
  withEnv,
  withFetchStub,
} from "./test_utils.ts";

const DT = Date.parse("2026-01-02T06:00:00+08:00") / 1000;
const ENV = { OPENWEATHER_API_KEY: "test-openweather-key" };

function oneCallPayload() {
  return {
    current: {
      dt: DT,
      temp: 12,
      feels_like: 11,
      pressure: 1015,
      humidity: 60,
      clouds: 40,
      visibility: 20_000,
      wind_speed: 3,
      wind_deg: 135,
      weather: [{ main: "Clouds", description: "多云" }],
      rain: { "1h": 0.2 },
    },
    hourly: [{
      dt: DT,
      temp: 13,
      humidity: 58,
      clouds: 50,
      wind_speed: 4,
      wind_deg: 180,
      pop: 0.4,
      visibility: 18_000,
      weather: [{ main: "Rain", description: "小雨" }],
      rain: { "1h": 0.3 },
    }],
  };
}

Deno.test("openweather: maps one call current and hourly data", async () => {
  await withEnv(ENV, async () => {
    await withFetchStub((call) => {
      const url = new URL(call.url);
      assertEquals(url.pathname, "/data/3.0/onecall");
      assertEquals(url.searchParams.get("appid"), "test-openweather-key");
      assertEquals(url.searchParams.get("lat"), "31.2304");
      assertEquals(url.searchParams.get("lon"), "121.4737");
      assertEquals(url.searchParams.get("units"), "metric");
      assertEquals(url.searchParams.get("lang"), "zh_cn");
      return jsonResponse(oneCallPayload());
    }, async (calls) => {
      const result = await getOpenWeather(31.2304, 121.4737);
      assertEquals(result.status, "OK");
      assertEquals(result.sources, ["OpenWeather"]);
      assertEquals(result.current?.temperature, 12);
      assertEquals(result.current?.condition, "多云");
      assertEquals(result.current?.cloud, 40);
      assertEquals(result.current?.windSpeed, 10.8);
      assertEquals(result.current?.precipitation, 0.2);
      assertEquals(result.current?.windDirection, "东南风");
      assertEquals(result.current?.visibility, 20_000);
      assertEquals(result.current?.airQuality, null);
      assertEquals(result.hourly.length, 1);
      assertEquals(result.hourly[0].time, "2026-01-02T06:00:00+08:00");
      assertEquals(result.hourly[0].precipitationProbability, 40);
      assertEquals(result.hourly[0].precipitation, 0.3);
      assertEquals(result.hourly[0].visibility, 18_000);
      assertEquals(calls.length, 1);
    });
  });
});

Deno.test("openweather: falls back to free current and 3h forecast endpoints", async () => {
  await withEnv(ENV, async () => {
    await withFetchStub((call) => {
      const url = new URL(call.url);
      if (url.pathname === "/data/3.0/onecall") {
        return jsonResponse({ error: "subscription required" }, 401);
      }
      if (url.pathname === "/data/2.5/weather") {
        return jsonResponse({
          dt: DT,
          main: {
            temp: 12,
            feels_like: 11,
            pressure: 1015,
            humidity: 60,
          },
          clouds: { all: 40 },
          visibility: 20_000,
          wind: { speed: 3, deg: 135 },
          weather: [{ main: "Clouds", description: "多云" }],
          rain: { "1h": 0.2 },
        });
      }
      if (url.pathname === "/data/2.5/forecast") {
        return jsonResponse({
          list: [{
            dt: DT,
            main: { temp: 13, humidity: 58 },
            clouds: { all: 50 },
            wind: { speed: 4, deg: 180 },
            pop: 0.4,
            visibility: 18_000,
            weather: [{ main: "Rain", description: "小雨" }],
            rain: { "3h": 0.6 },
          }],
        });
      }
      return jsonResponse({ error: "unexpected" }, 404);
    }, async (calls) => {
      const result = await getOpenWeather(31.2304, 121.4737);
      assertEquals(result.status, "OK");
      assertEquals(result.current?.temperature, 12);
      assertEquals(result.hourly.length, 1);
      assertEquals(result.hourly[0].precipitation, 0.6);
      assert(
        calls.some((call) =>
          new URL(call.url).pathname === "/data/3.0/onecall"
        ),
      );
      assert(
        calls.some((call) =>
          new URL(call.url).pathname === "/data/2.5/weather"
        ),
      );
      assert(
        calls.some((call) =>
          new URL(call.url).pathname === "/data/2.5/forecast"
        ),
      );
    });
  });
});

Deno.test("openweather: unconfigured does not fetch and malformed responses degrade", async () => {
  await withEnv({ OPENWEATHER_API_KEY: null }, async () => {
    await withFetchStub(() => jsonResponse({}), async (calls) => {
      const result = await getOpenWeather(31.2304, 121.4737);
      assertEquals(result.status, "UNCONFIGURED");
      assertEquals(calls.length, 0);
    });
  });

  await withEnv(ENV, async () => {
    await withFetchStub(() => jsonResponse({}), async () => {
      const result = await getOpenWeather(31.2304, 121.4737);
      assertEquals(result.status, "UNAVAILABLE");
      assertEquals(result.current, null);
      assertEquals(result.hourly, []);
    });
  });
});
