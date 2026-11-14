import { getCaiyunWeather } from "./caiyun.ts";
import {
  assert,
  assertEquals,
  jsonResponse,
  withEnv,
  withFetchStub,
} from "./test_utils.ts";

Deno.test("caiyun: optional client is explicitly unconfigured", async () => {
  await withEnv({ CAIYUN_API_KEY: null }, async () => {
    await withFetchStub(() => jsonResponse({}), async (calls) => {
      const result = await getCaiyunWeather(31.2, 121.4);
      assertEquals(result.status, "UNCONFIGURED");
      assertEquals(result.current, null);
      assertEquals(calls.length, 0);
    });
  });
});

Deno.test("caiyun: maps real realtime observations without fabricating hourly data", async () => {
  await withEnv({ CAIYUN_API_KEY: "test-caiyun-key" }, async () => {
    await withFetchStub((call) => {
      const url = new URL(call.url);
      assert(url.pathname.startsWith("/v2.6/test-caiyun-key/121.4,31.2/"));
      assertEquals(url.pathname, "/v2.6/test-caiyun-key/121.4,31.2/realtime");
      return jsonResponse({
        status: "ok",
        server_time: 1767227040,
        result: {
          realtime: {
            temperature: 10.2,
            apparent_temperature: 8.1,
            humidity: 0.45,
            cloudrate: 0.25,
            skycon: "CLOUDY",
            precipitation: { local: { intensity: 0.3 } },
            wind: { speed: 3.2, direction: 90 },
            visibility: 12,
            pressure: 1012,
            air_quality: { aqi: { chn: 40 }, description: { chn: "优" } },
          },
        },
      });
    }, async (calls) => {
      const result = await getCaiyunWeather(31.2, 121.4);
      assertEquals(result.status, "OK");
      assertEquals(
        result.current?.observedAt,
        new Date(1767227040 * 1000).toISOString(),
      );
      assertEquals(result.current?.humidity, 45);
      assertEquals(result.current?.cloud, 25);
      assertEquals(result.current?.windDirection, "东");
      assertEquals(result.current?.airQuality, {
        aqi: 40,
        category: "优",
        primaryPollutant: null,
      });
      assertEquals(result.hourly, []);
      assertEquals(calls.length, 1);
    });
  });
});

Deno.test("caiyun: malformed responses return UNAVAILABLE instead of throwing", async () => {
  await withEnv({ CAIYUN_API_KEY: "test-caiyun-key" }, async () => {
    await withFetchStub(() => new Response("broken"), async () => {
      const result = await getCaiyunWeather(31.2, 121.4);
      assertEquals(result.status, "UNAVAILABLE");
      assertEquals(result.current, null);
    });
  });
});
