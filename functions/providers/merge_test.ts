import { mergeWeather } from "./merge.ts";
import type {
  CurrentWeather,
  HourlyWeather,
  WeatherData,
} from "../shared/contracts.ts";
import { assert, assertEquals } from "./test_utils.ts";

function current(
  overrides: Partial<CurrentWeather> = {},
): CurrentWeather {
  return {
    observedAt: "2026-01-02T06:00:00+08:00",
    temperature: 10,
    feelsLike: 9,
    condition: "多云",
    humidity: 50,
    cloud: 20,
    precipitation: 0,
    windSpeed: 2,
    windDirection: "北风",
    windDegree: 0,
    visibility: 20_000,
    pressure: 1015,
    airQuality: { aqi: 50, category: "良", primaryPollutant: null },
    ...overrides,
  };
}

function hourly(
  time: string,
  overrides: Partial<HourlyWeather> = {},
): HourlyWeather {
  return {
    time,
    temperature: 10,
    condition: "多云",
    humidity: 50,
    cloud: 20,
    precipitationProbability: 10,
    precipitation: 0,
    windSpeed: 2,
    windDirection: "北风",
    visibility: 20_000,
    ...overrides,
  };
}

function weather(overrides: Partial<WeatherData> = {}): WeatherData {
  return {
    status: "OK",
    current: current(),
    hourly: [hourly("2026-01-02T06:00:00+08:00")],
    sources: ["和风天气", "QWeather"],
    missingFields: [],
    message: null,
    ...overrides,
  };
}

Deno.test("merge: both sources contribute equal-weight numeric fields", () => {
  const left = weather();
  const right = weather({
    current: current({
      observedAt: "2026-01-02T06:05:00+08:00",
      temperature: 20,
      humidity: 70,
      cloud: 60,
      condition: "小雨",
      airQuality: null,
      windDirection: "南风",
    }),
    hourly: [
      hourly("2026-01-02T06:00:00+08:00", {
        temperature: 20,
        humidity: 70,
        cloud: 60,
        condition: "小雨",
        precipitationProbability: 30,
      }),
    ],
    sources: ["OpenWeather"],
  });

  const merged = mergeWeather(left, right);
  assertEquals(merged.status, "OK");
  assertEquals(merged.current?.temperature, 15);
  assertEquals(merged.current?.humidity, 60);
  assertEquals(merged.current?.cloud, 40);
  assertEquals(merged.current?.condition, "多云");
  assertEquals(merged.current?.observedAt, "2026-01-02T06:05:00+08:00");
  assertEquals(merged.current?.airQuality?.aqi, 50);
  assertEquals(merged.hourly.length, 1);
  assertEquals(merged.hourly[0].temperature, 15);
  assertEquals(merged.hourly[0].cloud, 40);
  assertEquals(merged.hourly[0].precipitationProbability, 20);
  assertEquals(merged.hourly[0].time, "2026-01-02T06:00:00+08:00");
  assert(merged.sources.includes("和风天气"));
  assert(merged.sources.includes("OpenWeather"));
});

Deno.test("merge: three sources average numeric fields equally", () => {
  const time = "2026-01-02T06:00:00+08:00";
  const qweather = weather();
  const openWeather = weather({
    current: current({ temperature: 20, cloud: 50 }),
    hourly: [hourly(time, { temperature: 20, cloud: 50 })],
    sources: ["OpenWeather"],
  });
  const openMeteo = weather({
    current: current({ temperature: 30, cloud: 80 }),
    hourly: [hourly(time, { temperature: 30, cloud: 80 })],
    sources: ["Open-Meteo"],
  });

  const merged = mergeWeather(qweather, openWeather, openMeteo);
  assertEquals(merged.current?.temperature, 20);
  assertEquals(merged.current?.cloud, 50);
  assertEquals(merged.hourly[0].temperature, 20);
  assertEquals(merged.hourly[0].cloud, 50);
  assertEquals(merged.sources, [
    "和风天气",
    "QWeather",
    "OpenWeather",
    "Open-Meteo",
  ]);
});

Deno.test("merge: one configured source is used without invented values", () => {
  const left = weather();
  const unavailable = weather({
    status: "UNCONFIGURED",
    current: null,
    hourly: [],
    sources: [],
    message: "未配置 OPENWEATHER_API_KEY。",
  });
  assertEquals(mergeWeather(left, unavailable).current?.temperature, 10);
  assertEquals(mergeWeather(unavailable, left).current?.temperature, 10);

  const bothUnavailable = mergeWeather(unavailable, unavailable);
  assertEquals(bothUnavailable.status, "UNCONFIGURED");
  assertEquals(bothUnavailable.current, null);
  assertEquals(bothUnavailable.hourly, []);
});

Deno.test("merge: both unavailable stays unavailable", () => {
  const unavailable = weather({
    status: "UNAVAILABLE",
    current: null,
    hourly: [],
    sources: [],
    message: "服务暂不可用。",
  });
  const merged = mergeWeather(unavailable, unavailable);
  assertEquals(merged.status, "UNAVAILABLE");
  assertEquals(merged.current, null);
});
