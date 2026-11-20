import type { HourlyWeather, WeatherData } from "../shared/contracts.ts";
import { fetchTrustedJson, ProviderHttpError } from "./http.ts";

const BASE_URL = "https://api.met.no";
const HOSTS = ["api.met.no"] as const;
const USER_AGENT = "PhotoMateAI/1.0 https://github.com/Zenghw520/PhotoMate-AI";

const SYMBOLS: Record<string, string> = {
  clearsky: "晴",
  fair: "晴间多云",
  partlycloudy: "多云",
  cloudy: "阴",
  fog: "雾",
  lightrain: "小雨",
  rain: "雨",
  heavyrain: "大雨",
  lightsleet: "小雨夹雪",
  sleet: "雨夹雪",
  lightsnow: "小雪",
  snow: "雪",
  heavysnow: "大雪",
  thunderstorm: "雷阵雨",
};

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function localIso(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return null;
  return new Date(time + 8 * 3_600_000).toISOString().slice(0, 19) + "+08:00";
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

function symbolText(value: unknown): string {
  const symbol = record(value)?.symbol_code;
  if (typeof symbol !== "string") return "";
  const key = symbol.replace(/_(day|night|polartwilight)$/, "");
  return SYMBOLS[key] ?? "";
}

function nextDetail(
  data: Record<string, unknown>,
  period: "next_1_hours" | "next_6_hours",
): Record<string, unknown> | null {
  return record(record(data[period])?.details);
}

function mapHourly(value: unknown): HourlyWeather | null {
  const item = record(value);
  const data = record(item?.data);
  const instant = record(data?.instant);
  const details = record(instant?.details);
  const time = localIso(item?.time);
  if (!item || !data || !details || !time) return null;
  const next = nextDetail(data, "next_1_hours") ??
    nextDetail(data, "next_6_hours");
  const windDegree = numberValue(details.wind_from_direction);
  const condition = symbolText(record(data?.next_1_hours)?.summary) ||
    symbolText(record(data?.next_6_hours)?.summary);
  return {
    time,
    temperature: numberValue(details.air_temperature),
    condition,
    humidity: numberValue(details.relative_humidity),
    cloud: numberValue(details.cloud_area_fraction),
    cloudHigh: numberValue(details.cloud_area_fraction_high),
    cloudMid: numberValue(details.cloud_area_fraction_medium),
    cloudLow: numberValue(details.cloud_area_fraction_low),
    aerosolOpticalDepth: null,
    precipitationProbability: null,
    precipitation: numberValue(next?.precipitation_amount),
    windSpeed: numberValue(details.wind_speed),
    windGust: numberValue(details.wind_speed_of_gust),
    windDirection: windDirection(windDegree),
    visibility: null,
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

function providerDetail(error: unknown): string {
  if (error instanceof ProviderHttpError) {
    return `${error.code}:${error.status ?? "-"}`;
  }
  return error instanceof Error ? error.name : "unknown";
}

/** Real model forecast with high/mid/low cloud layers; no API key required. */
export async function getMetNorway(
  latitude: number,
  longitude: number,
): Promise<WeatherData> {
  if (
    !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 || Math.abs(longitude) > 180
  ) return emptyWeather("UNAVAILABLE", "MET Norway 查询坐标无效。");

  try {
    const payload = await fetchTrustedJson<unknown>({
      baseUrl: BASE_URL,
      path: "/weatherapi/locationforecast/2.0/complete",
      allowedHosts: HOSTS,
      query: {
        lat: latitude.toFixed(4),
        lon: longitude.toFixed(4),
      },
      headers: { "User-Agent": USER_AGENT },
      timeoutMs: 6_000,
      maxResponseBytes: 1024 * 1024,
      retries: 1,
    });
    const series = record(record(payload)?.properties)?.timeseries;
    if (!Array.isArray(series)) {
      return emptyWeather("UNAVAILABLE", "MET Norway 返回数据无法解析。");
    }
    const hourly = series
      .map((entry) => mapHourly(entry))
      .filter((entry): entry is HourlyWeather => entry !== null)
      .slice(0, 96);
    if (hourly.length === 0) {
      return emptyWeather("UNAVAILABLE", "MET Norway 数据为空。");
    }
    return {
      status: "OK",
      current: null,
      hourly,
      sources: ["MET Norway"],
      missingFields: [],
      message: null,
    };
  } catch (error) {
    console.error("metno_request_failed", providerDetail(error));
    return emptyWeather("UNAVAILABLE", "MET Norway 服务暂不可用。");
  }
}
