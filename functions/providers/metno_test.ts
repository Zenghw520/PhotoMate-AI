import { getMetNorway } from "./metno.ts";
import {
  assert,
  assertEquals,
  jsonResponse,
  withFetchStub,
} from "./test_utils.ts";

const SERIES = {
  type: "Feature",
  properties: {
    timeseries: [
      {
        time: "2026-11-17T04:00:00Z",
        data: {
          instant: {
            details: {
              air_temperature: 6.7,
              relative_humidity: 48,
              cloud_area_fraction: 58.6,
              cloud_area_fraction_high: 3.9,
              cloud_area_fraction_medium: 56.2,
              cloud_area_fraction_low: 23.4,
              wind_from_direction: 127.8,
              wind_speed: 0.9,
            },
          },
          next_1_hours: {
            summary: { symbol_code: "partlycloudy_day" },
            details: { precipitation_amount: 0.2 },
          },
        },
      },
    ],
  },
};

Deno.test("metno: maps real layered cloud without inventing visibility", async () => {
  await withFetchStub(
    (call) => {
      const url = new URL(call.url);
      assertEquals(url.hostname, "api.met.no");
      assertEquals(
        url.pathname,
        "/weatherapi/locationforecast/2.0/complete",
      );
      assertEquals(url.searchParams.get("lat"), "39.9000");
      assertEquals(
        new Headers(call.init?.headers).get("user-agent"),
        "Zhuguang/1.0 https://github.com/Zenghw520/PhotoMate-AI",
      );
      return jsonResponse(SERIES);
    },
    async (calls) => {
      const result = await getMetNorway(39.9, 116.4);
      assertEquals(calls.length, 1);
      assertEquals(result.status, "OK");
      assertEquals(result.sources, ["MET Norway"]);
      assertEquals(result.current, null);
      assertEquals(result.hourly.length, 1);
      assertEquals(result.hourly[0].time, "2026-11-17T12:00:00+08:00");
      assertEquals(result.hourly[0].cloud, 58.6);
      assertEquals(result.hourly[0].cloudHigh, 3.9);
      assertEquals(result.hourly[0].cloudMid, 56.2);
      assertEquals(result.hourly[0].cloudLow, 23.4);
      assertEquals(result.hourly[0].condition, "多云");
      assertEquals(result.hourly[0].precipitation, 0.2);
      assertEquals(result.hourly[0].visibility, null);
      assertEquals(result.hourly[0].precipitationProbability, null);
    },
  );
});

Deno.test("metno: malformed responses become unavailable", async () => {
  await withFetchStub(
    () => jsonResponse({ type: "Feature", properties: null }),
    async () => {
      const result = await getMetNorway(39.9, 116.4);
      assertEquals(result.status, "UNAVAILABLE");
      assertEquals(result.hourly, []);
    },
  );
});

Deno.test("metno: invalid coordinates do not call upstream", async () => {
  await withFetchStub(
    () => {
      assert(false, "upstream should not be called");
    },
    async (calls) => {
      const result = await getMetNorway(120, 116.4);
      assertEquals(result.status, "UNAVAILABLE");
      assertEquals(calls.length, 0);
    },
  );
});
