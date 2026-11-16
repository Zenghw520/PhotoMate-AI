import type {
  CurrentWeather,
  HourlyWeather,
  WeatherData,
} from "../shared/contracts.ts";
import { fetchTrustedJson, ProviderHttpError } from "./http.ts";

const BASE_URL = "https://api.open-meteo.com";
const HOSTS = ["open-meteo.com"] as const;
const CURRENT_FIELDS = [
  "temperature_2m",
  "relative_humidity_2m",
  "apparent_temperature",
  "precipitation",
  "weather_code",
  "cloud_cover",
  "pressure_msl",
  "wind_speed_10m",
  "wind_direction_10m",
].join(",");
const HOURLY_FIELDS = [
  "temperature_2m",
  "relative_humidity_2m",
  "precipitation_probability",
  "precipitation",
  "weather_code",
  "cloud_cover",
  "cloud_cover_low",
  "cloud_cover_mid",
  "cloud_cover_high",
  "wind_speed_10m",
  "wind_direction_10m",
  "visibility",
].join(",");
const AIR_QUALITY_BASE_URL = "https://air-quality-api.open-meteo.com";

const CONDITIONS: Record<number, string> = {
  0: "晴",
  1: "晴间多云",
  2: "多云",
  3: "阴",
  45: "雾",
  48: "雾凇",
  51: "毛毛雨",
  53: "毛毛雨",
  55: "毛毛雨",
  56: "冻毛毛雨",
  57: "冻毛毛雨",
  61: "小雨",
  63: "中雨",
  65: "大雨",
  66: "冻雨",
  67: "冻雨",
  71: "小雪",
  73: "中雪",
  75: "大雪",
  77: "米雪",
  80: "阵雨",
  81: "阵雨",
  82: "强阵雨",
  85: "阵雪",
  86: "阵雪",
  95: "雷阵雨",
  96: "雷暴伴冰雹",
  99: "雷暴伴冰雹",
};

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function numberAt(value: unknown, index: number): number | null {
  return Array.isArray(value) ? numberValue(value[index]) : null;
}

function condition(code: number | null): string {
  return code === null ? "" : CONDITIONS[code] ?? "";
}

function localIso(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const text = value.trim();
  if (/[+-]\d{2}:\d{2}$/.test(text)) return text;
  return `${text.length === 16 ? `${text}:00` : text}+08:00`;
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

function nearestVisibility(
  hourly: HourlyWeather[],
  target: string,
): number | null {
  const targetTime = Date.parse(target);
  if (!Number.isFinite(targetTime)) return null;
  let value: number | null = null;
  let distance = 90 * 60 * 1000;
  for (const entry of hourly) {
    const difference = Math.abs(Date.parse(entry.time) - targetTime);
    if (Number.isFinite(difference) && difference <= distance) {
      distance = difference;
      value = entry.visibility;
    }
  }
  return value;
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

function missingFieldList(
  current: CurrentWeather | null,
  hourly: HourlyWeather[],
): string[] {
  const missing: string[] = [];
  if (current) {
    const fields: Array<[keyof CurrentWeather, unknown]> = [
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
    for (const [field, value] of fields) {
      if (value === null) missing.push(`current.${field}`);
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
      if (value === null) missing.push(`hourly.${index}.${field}`);
    }
  }
  return missing;
}

function providerDetail(error: unknown): string {
  if (error instanceof ProviderHttpError) {
    return `${error.code}:${error.status ?? "-"}`;
  }
  return error instanceof Error ? error.name : "unknown";
}

async function loadAerosolOpticalDepth(
  latitude: number,
  longitude: number,
): Promise<Map<string, number>> {
  const values = new Map<string, number>();
  try {
    const payload = await fetchTrustedJson<unknown>({
      baseUrl: AIR_QUALITY_BASE_URL,
      path: "/v1/air-quality",
      allowedHosts: HOSTS,
      query: {
        latitude: latitude.toFixed(4),
        longitude: longitude.toFixed(4),
        hourly: "aerosol_optical_depth",
        timezone: "Asia/Shanghai",
        forecast_days: "3",
      },
      timeoutMs: 4_000,
      maxResponseBytes: 256 * 1024,
      retries: 0,
    });
    const hourly = record(record(payload)?.hourly);
    const times = hourly && Array.isArray(hourly.time) ? hourly.time : [];
    for (let index = 0; index < times.length; index++) {
      const time = localIso(times[index]);
      const value = numberAt(hourly?.aerosol_optical_depth, index);
      if (time && value !== null) values.set(time, value);
    }
  } catch (error) {
    console.error("openmeteo_air_failed", providerDetail(error));
  }
  return values;
}

function mapHourly(
  root: Record<string, unknown>,
  aerosol: Map<string, number>,
): HourlyWeather[] {
  const source = record(root.hourly);
  const times = source && Array.isArray(source.time) ? source.time : [];
  const hourly: HourlyWeather[] = [];
  for (let index = 0; index < times.length; index++) {
    const time = localIso(times[index]);
    if (!time) continue;
    const windSpeed = numberAt(source?.wind_speed_10m, index);
    const windDegree = numberAt(source?.wind_direction_10m, index);
    hourly.push({
      time,
      temperature: numberAt(source?.temperature_2m, index),
      condition: condition(numberAt(source?.weather_code, index)),
      humidity: numberAt(source?.relative_humidity_2m, index),
      cloud: numberAt(source?.cloud_cover, index),
      cloudHigh: numberAt(source?.cloud_cover_high, index),
      cloudMid: numberAt(source?.cloud_cover_mid, index),
      cloudLow: numberAt(source?.cloud_cover_low, index),
      aerosolOpticalDepth: aerosol.get(time) ?? null,
      precipitationProbability: numberAt(
        source?.precipitation_probability,
        index,
      ),
      precipitation: numberAt(source?.precipitation, index),
      // Hourly wind is m/s across providers; this API reports km/h.
      windSpeed: windSpeed === null ? null : windSpeed / 3.6,
      windDirection: windDirection(windDegree),
      visibility: numberAt(source?.visibility, index),
    });
  }
  return hourly;
}

function mapCurrent(
  root: Record<string, unknown>,
  hourly: HourlyWeather[],
): CurrentWeather | null {
  const current = record(root.current);
  if (!current) return null;
  const observedAt = localIso(current.time);
  if (!observedAt) return null;
  const windDegree = numberValue(current.wind_direction_10m);
  return {
    observedAt,
    temperature: numberValue(current.temperature_2m),
    feelsLike: numberValue(current.apparent_temperature),
    condition: condition(numberValue(current.weather_code)),
    humidity: numberValue(current.relative_humidity_2m),
    cloud: numberValue(current.cloud_cover),
    precipitation: numberValue(current.precipitation),
    // Current wind is km/h in the shared contract.
    windSpeed: numberValue(current.wind_speed_10m),
    windDirection: windDirection(windDegree),
    windDegree,
    visibility: nearestVisibility(hourly, observedAt),
    pressure: numberValue(current.pressure_msl),
    airQuality: null,
  };
}

export async function getOpenMeteo(
  latitude: number,
  longitude: number,
): Promise<WeatherData> {
  if (
    !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 || Math.abs(longitude) > 180
  ) return emptyWeather("UNAVAILABLE", "Open-Meteo 查询坐标无效。");

  try {
    const [payload, aerosol] = await Promise.all([
      fetchTrustedJson<unknown>({
        baseUrl: BASE_URL,
        path: "/v1/forecast",
        allowedHosts: HOSTS,
        query: {
          latitude: latitude.toFixed(4),
          longitude: longitude.toFixed(4),
          current: CURRENT_FIELDS,
          hourly: HOURLY_FIELDS,
          timezone: "Asia/Shanghai",
          wind_speed_unit: "kmh",
          forecast_days: "3",
          past_days: "1",
        },
        timeoutMs: 5_000,
        maxResponseBytes: 512 * 1024,
        retries: 1,
      }),
      loadAerosolOpticalDepth(latitude, longitude),
    ]);
    const root = record(payload);
    if (!root) {
      return emptyWeather("UNAVAILABLE", "Open-Meteo 返回数据无法解析。");
    }
    const hourly = mapHourly(root, aerosol);
    const current = mapCurrent(root, hourly);
    if (!current && hourly.length === 0) {
      return emptyWeather("UNAVAILABLE", "Open-Meteo 数据为空。");
    }
    return {
      status: "OK",
      current,
      hourly: hourly.slice(0, 96),
      sources: ["Open-Meteo"],
      missingFields: missingFieldList(current, hourly.slice(0, 96)),
      message: null,
    };
  } catch (error) {
    console.error("openmeteo_request_failed", providerDetail(error));
    return emptyWeather("UNAVAILABLE", "Open-Meteo 服务暂不可用。");
  }
}
