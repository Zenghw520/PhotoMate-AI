import { getOpenMeteo } from "./openmeteo.ts";
import { assertEquals, jsonResponse, withFetchStub } from "./test_utils.ts";

function payload() {
  return {
    latitude: 31.2304,
    longitude: 121.4737,
    timezone: "Asia/Shanghai",
    utc_offset_seconds: 28_800,
    current: {
      time: "2026-01-02T06:00",
      temperature_2m: 12,
      relative_humidity_2m: 60,
      apparent_temperature: 11,
      precipitation: 0.2,
      weather_code: 3,
      cloud_cover: 40,
      pressure_msl: 1015,
      wind_speed_10m: 10.8,
      wind_direction_10m: 135,
    },
    hourly: {
      time: ["2026-01-02T06:00", "2026-01-02T07:00"],
      temperature_2m: [13, 14],
      relative_humidity_2m: [58, 57],
      precipitation_probability: [40, 20],
      precipitation: [0.3, 0],
      weather_code: [61, 2],
      cloud_cover: [50, 30],
      cloud_cover_low: [20, 10],
      cloud_cover_mid: [35, 25],
      cloud_cover_high: [60, 45],
      wind_speed_10m: [14.4, 7.2],
      wind_direction_10m: [180, 360],
      visibility: [18_000, 22_000],
    },
  };
}

Deno.test("openmeteo: maps current, layered clouds and aerosol with correct units", async () => {
  await withFetchStub((call) => {
    const url = new URL(call.url);
    if (url.origin === "https://air-quality-api.open-meteo.com") {
      assertEquals(url.pathname, "/v1/air-quality");
      assertEquals(
        url.searchParams.get("hourly"),
        "aerosol_optical_depth",
      );
      return jsonResponse({
        hourly: {
          time: ["2026-01-02T06:00", "2026-01-02T07:00"],
          aerosol_optical_depth: [0.12, 0.2],
        },
      });
    }
    assertEquals(url.origin, "https://api.open-meteo.com");
    assertEquals(url.pathname, "/v1/forecast");
    assertEquals(url.searchParams.get("latitude"), "31.2304");
    assertEquals(url.searchParams.get("longitude"), "121.4737");
    assertEquals(url.searchParams.get("timezone"), "Asia/Shanghai");
    assertEquals(url.searchParams.get("forecast_days"), "3");
    assertEquals(url.searchParams.get("past_days"), "1");
    assertEquals(url.searchParams.get("wind_speed_unit"), "kmh");
    assertEquals(url.searchParams.get("appid"), null);
    return jsonResponse(payload());
  }, async (calls) => {
    const result = await getOpenMeteo(31.2304, 121.4737);
    assertEquals(result.status, "OK");
    assertEquals(result.sources, ["Open-Meteo"]);
    assertEquals(result.current?.observedAt, "2026-01-02T06:00:00+08:00");
    assertEquals(result.current?.temperature, 12);
    assertEquals(result.current?.condition, "阴");
    assertEquals(result.current?.humidity, 60);
    assertEquals(result.current?.cloud, 40);
    assertEquals(result.current?.windSpeed, 10.8);
    assertEquals(result.current?.windDirection, "东南风");
    assertEquals(result.current?.visibility, 18_000);
    assertEquals(result.current?.airQuality, null);
    assertEquals(result.hourly.length, 2);
    assertEquals(result.hourly[0].time, "2026-01-02T06:00:00+08:00");
    assertEquals(result.hourly[0].temperature, 13);
    assertEquals(result.hourly[0].condition, "小雨");
    assertEquals(result.hourly[0].precipitationProbability, 40);
    assertEquals(result.hourly[0].windSpeed, 4);
    assertEquals(result.hourly[0].visibility, 18_000);
    assertEquals(result.hourly[0].cloudLow, 20);
    assertEquals(result.hourly[0].cloudMid, 35);
    assertEquals(result.hourly[0].cloudHigh, 60);
    assertEquals(result.hourly[0].aerosolOpticalDepth, 0.12);
    assertEquals(result.hourly[1].condition, "多云");
    assertEquals(result.hourly[1].aerosolOpticalDepth, 0.2);
    assertEquals(calls.length, 2);
  });
});

Deno.test("openmeteo: empty payload degrades instead of inventing values", async () => {
  await withFetchStub(() => jsonResponse({}), async () => {
    const result = await getOpenMeteo(31.2304, 121.4737);
    assertEquals(result.status, "UNAVAILABLE");
    assertEquals(result.current, null);
    assertEquals(result.hourly, []);
    assertEquals(result.sources, []);
  });
});
