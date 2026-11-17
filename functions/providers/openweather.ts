import type {
  CurrentWeather,
  HourlyWeather,
  WeatherData,
} from "../shared/contracts.ts";
import { secretValue } from "../shared/env.ts";
import { fetchTrustedJson, ProviderHttpError } from "./http.ts";

const BASE_URL = "https://api.openweathermap.org";
const HOSTS = ["openweathermap.org"] as const;

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function cloudCover(value: unknown): number | null {
  if (typeof value === "number") return numberValue(value);
  return numberValue(record(value)?.all);
}

function shanghaiIso(epochSeconds: number): string {
  return new Date(epochSeconds * 1000 + 8 * 3600 * 1000)
    .toISOString()
    .slice(0, 19) + "+08:00";
}

function windDirection(degrees: number | null): string {
  if (degrees === null) return "";
  const directions = [
    "北风",
    "东北风",
    "东风",
    "东南风",
    "南风",
    "西南风",
    "西风",
    "西北风",
  ];
  return directions[Math.round((((degrees % 360) + 360) % 360) / 45) % 8];
}

function condition(item: Record<string, unknown>): string {
  const weather = Array.isArray(item.weather) ? record(item.weather[0]) : null;
  return text(weather?.description) ?? text(weather?.main) ?? "";
}

function precipitation(
  item: Record<string, unknown>,
  suffix: "1h" | "3h",
): number | null {
  const rain = record(item.rain);
  const snow = record(item.snow);
  const rainValue = numberValue(rain?.[suffix]);
  const snowValue = numberValue(snow?.[suffix]);
  if (rainValue === null && snowValue === null) return null;
  return (rainValue ?? 0) + (snowValue ?? 0);
}

function mapCurrent(value: unknown): CurrentWeather | null {
  const item = record(value);
  if (!item) return null;
  const main = record(item.main) ?? item;
  const wind = record(item.wind) ?? item;
  const dt = numberValue(item.dt);
  if (dt === null) return null;
  const windDegree = numberValue(wind.deg) ?? numberValue(item.wind_deg);
  const windSpeed = numberValue(wind.speed) ?? numberValue(item.wind_speed);
  return {
    observedAt: shanghaiIso(dt),
    temperature: numberValue(main.temp),
    feelsLike: numberValue(main.feels_like),
    condition: condition(item),
    humidity: numberValue(main.humidity),
    cloud: cloudCover(item.clouds),
    precipitation: precipitation(item, "1h"),
    // Current wind is km/h in the shared contract; OpenWeather returns m/s.
    windSpeed: windSpeed === null ? null : windSpeed * 3.6,
    windDirection: windDirection(windDegree),
    windDegree,
    visibility: numberValue(item.visibility),
    pressure: numberValue(main.pressure),
    airQuality: null,
  };
}

function mapHourly(
  value: unknown,
  precipitationSuffix: "1h" | "3h",
): HourlyWeather | null {
  const item = record(value);
  if (!item) return null;
  const main = record(item.main) ?? item;
  const wind = record(item.wind) ?? item;
  const dt = numberValue(item.dt);
  if (dt === null) return null;
  const windDegree = numberValue(wind.deg) ?? numberValue(item.wind_deg);
  const windSpeed = numberValue(wind.speed) ?? numberValue(item.wind_speed);
  const pop = numberValue(item.pop);
  return {
    time: shanghaiIso(dt),
    temperature: numberValue(main.temp),
    condition: condition(item),
    humidity: numberValue(main.humidity),
    cloud: cloudCover(item.clouds),
    precipitationProbability: pop === null ? null : pop * 100,
    precipitation: precipitation(item, precipitationSuffix),
    windSpeed,
    windDirection: windDirection(windDegree),
    visibility: numberValue(item.visibility),
  };
}

function emptyWeather(
  status: WeatherData["status"],
  message: string,
): WeatherData {
  return {
    status,
    current: null,
    hourly: [],
    sources: [],
    missingFields: [],
    message,
  };
}

function buildWeather(
  current: CurrentWeather | null,
  hourly: HourlyWeather[],
): WeatherData {
  const missingFields: string[] = [];
  if (current) {
    const currentFields: Array<[keyof CurrentWeather, unknown]> = [
      ["temperature", current.temperature],
      ["feelsLike", current.feelsLike],
      ["condition", current.condition || null],
      ["humidity", current.humidity],
      ["cloud", current.cloud],
      ["precipitation", current.precipitation],
      ["windSpeed", current.windSpeed],
      ["windDirection", current.windDirection || null],
      ["windDegree", current.windDegree],
      ["visibility", current.visibility],
      ["pressure", current.pressure],
    ];
    for (const [field, value] of currentFields) {
      if (value === null) missingFields.push(`current.${field}`);
    }
  }
  for (const [index, entry] of hourly.entries()) {
    const fields: Array<[keyof HourlyWeather, unknown]> = [
      ["temperature", entry.temperature],
      ["condition", entry.condition || null],
      ["humidity", entry.humidity],
      ["cloud", entry.cloud],
      ["precipitationProbability", entry.precipitationProbability],
      ["precipitation", entry.precipitation],
      ["windSpeed", entry.windSpeed],
      ["windDirection", entry.windDirection || null],
      ["visibility", entry.visibility],
    ];
    for (const [field, value] of fields) {
      if (value === null) missingFields.push(`hourly.${index}.${field}`);
    }
  }
  if (!current && hourly.length === 0) {
    return emptyWeather("UNAVAILABLE", "OpenWeather 数据为空。");
  }
  return {
    status: "OK",
    current,
    hourly,
    sources: ["OpenWeather"],
    missingFields,
    message: null,
  };
}

function providerDetail(error: unknown): string {
  if (error instanceof ProviderHttpError) {
    return `${error.code}:${error.status ?? "-"}`;
  }
  return error instanceof Error ? error.name : "unknown";
}

async function request(
  apiKey: string,
  path: string,
  query: Record<string, string>,
  timeoutMs = 5_000,
): Promise<unknown> {
  return await fetchTrustedJson<unknown>({
    baseUrl: BASE_URL,
    path,
    allowedHosts: HOSTS,
    query: { ...query, appid: apiKey, units: "metric", lang: "zh_cn" },
    timeoutMs,
    maxResponseBytes: 512 * 1024,
    retries: 0,
  });
}

export async function getOpenWeather(
  latitude: number,
  longitude: number,
): Promise<WeatherData> {
  const apiKey = secretValue("OPENWEATHER_API_KEY");
  if (!apiKey) {
    return emptyWeather("UNCONFIGURED", "未配置 OPENWEATHER_API_KEY。");
  }
  if (
    !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 || Math.abs(longitude) > 180
  ) return emptyWeather("UNAVAILABLE", "OpenWeather 查询坐标无效。");

  const location = {
    lat: latitude.toFixed(4),
    lon: longitude.toFixed(4),
  };
  try {
    try {
      const payload = await request(apiKey, "/data/3.0/onecall", {
        ...location,
        exclude: "minutely,daily,alerts",
      }, 7_000);
      const root = record(payload);
      const current = mapCurrent(root?.current);
      const hourly = (Array.isArray(root?.hourly) ? root.hourly : [])
        .map((entry) => mapHourly(entry, "1h"))
        .filter((entry): entry is HourlyWeather => entry !== null);
      const result = buildWeather(current, hourly);
      if (result.status === "OK") return result;
    } catch (error) {
      console.error("openweather_onecall_fallback", providerDetail(error));
    }
    const [currentPayload, forecastPayload] = await Promise.all([
      request(apiKey, "/data/2.5/weather", location),
      request(apiKey, "/data/2.5/forecast", location),
    ]);
    const current = mapCurrent(currentPayload);
    const forecast = record(forecastPayload);
    const hourly = (Array.isArray(forecast?.list) ? forecast.list : [])
      .map((entry) => mapHourly(entry, "3h"))
      .filter((entry): entry is HourlyWeather => entry !== null);
    return buildWeather(current, hourly);
  } catch (error) {
    console.error("openweather_request_failed", providerDetail(error));
    return emptyWeather("UNAVAILABLE", "OpenWeather 服务暂不可用。");
  }
}
