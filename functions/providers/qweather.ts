import type {
  AirQuality,
  CurrentWeather,
  HourlyWeather,
  WeatherData,
} from "../shared/contracts.ts";
import { secretValue } from "../shared/env.ts";
import {
  fetchTrustedJson,
  isHostnameAllowed,
  ProviderHttpError,
} from "./http.ts";

const QWEATHER_HOSTS = ["qweather.com", "qweatherapi.com"] as const;

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function sources(payload: Record<string, unknown>): string[] {
  const refer = record(payload.refer);
  if (!refer || !Array.isArray(refer.sources)) return [];
  return refer.sources.filter((value): value is string =>
    typeof value === "string" && value.trim() !== ""
  )
    .map((value) => value.trim());
}

class QWeatherFailure extends Error {
  constructor(public detail: string) {
    super("QWeather request failed");
  }
}

function v7Root(payload: unknown): Record<string, unknown> {
  const root = record(payload);
  if (!root || root.code !== "200") {
    console.error("qweather_api_code", root?.code ?? "invalid");
    throw new QWeatherFailure(`和风返回代码 ${root?.code ?? "无效"}`);
  }
  return root;
}

function providerDetail(error: unknown): string {
  if (error instanceof ProviderHttpError) {
    return `${error.code}:${error.status ?? "-"}`;
  }
  return error instanceof Error ? error.name : "unknown";
}

function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim();
  return /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
}

function baseUrlProblem(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "parse";
  }
  if (url.protocol !== "https:") return "protocol";
  if (url.username || url.password) return "credentials";
  if (url.search || url.hash) return "query";
  if (!isHostnameAllowed(url.hostname, QWEATHER_HOSTS)) return "host";
  return "unknown";
}

async function request(
  baseUrl: string,
  apiKey: string,
  path: string,
  query: Record<string, string | undefined>,
): Promise<unknown> {
  try {
    return await fetchTrustedJson<unknown>({
      baseUrl,
      path,
      allowedHosts: QWEATHER_HOSTS,
      query,
      headers: { "X-QW-Api-Key": apiKey },
      timeoutMs: 5_000,
      maxResponseBytes: 512 * 1024,
      retries: 1,
    });
  } catch (error) {
    const detail = error instanceof ProviderHttpError
      ? error.code === "INVALID_URL"
        ? `API Host 无效（${baseUrlProblem(baseUrl)}）`
        : `${error.code}${error.status === null ? "" : ` HTTP ${error.status}`}`
      : error instanceof Error
      ? error.name
      : "未知错误";
    console.error("qweather_request_failed", path, detail);
    if (error instanceof ProviderHttpError && error.code === "INVALID_URL") {
      console.error("qweather_base_url_rejected", baseUrlProblem(baseUrl));
    }
    throw new QWeatherFailure(detail);
  }
}

async function fetchAirQuality(
  baseUrl: string,
  apiKey: string,
  latitude: string,
  longitude: string,
): Promise<AirQuality | null> {
  const payload = await request(
    baseUrl,
    apiKey,
    `/airquality/v1/current/${latitude}/${longitude}`,
    { lang: "zh" },
  );
  const root = record(payload);
  const indexes = root?.indexes;
  if (!Array.isArray(indexes) || indexes.length === 0) return null;
  // QWeather documents the first index as the location's default/local-standard AQI.
  const index = record(indexes[0]);
  if (!index) return null;
  const pollutant = record(root?.primaryPollutant);
  const primary = text(pollutant?.name) ?? text(pollutant?.code);
  return {
    aqi: numberValue(index.aqi),
    category: text(index.category),
    primaryPollutant: primary && primary !== "NA" ? primary : null,
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

async function fetchHourlyForecast(
  baseUrl: string,
  apiKey: string,
  location: string,
): Promise<Record<string, unknown>> {
  try {
    return v7Root(
      await request(baseUrl, apiKey, "/v7/weather/72h", {
        location,
        lang: "zh",
        unit: "m",
      }),
    );
  } catch (error) {
    if (!(error instanceof QWeatherFailure)) throw error;
    console.error("qweather_hourly_fallback", "24h", error.detail);
    return v7Root(
      await request(baseUrl, apiKey, "/v7/weather/24h", {
        location,
        lang: "zh",
        unit: "m",
      }),
    );
  }
}

function coordinate(
  value: number,
  minimum: number,
  maximum: number,
): string | null {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    return null;
  }
  const rounded = value.toFixed(2);
  return rounded === "-0.00" ? "0.00" : rounded;
}

export async function getQWeather(
  latitude: number,
  longitude: number,
): Promise<WeatherData> {
  const apiKey = secretValue("QWEATHER_API_KEY");
  const baseUrlValue = secretValue("QWEATHER_API_BASE_URL");
  if (!apiKey || !baseUrlValue) {
    return emptyWeather(
      "UNCONFIGURED",
      "未配置 QWEATHER_API_KEY 或 QWEATHER_API_BASE_URL。",
    );
  }
  const baseUrl = normalizeBaseUrl(baseUrlValue);
  const lat = coordinate(latitude, -90, 90);
  const lon = coordinate(longitude, -180, 180);
  if (!lat || !lon) return emptyWeather("UNAVAILABLE", "天气查询坐标无效。");

  const location = `${lon},${lat}`;
  try {
    // Air quality is isolated so a lack of account permission never rejects main weather.
    const airPromise = fetchAirQuality(baseUrl, apiKey, lat, lon).catch(
      (error) => {
        console.error("qweather_air_quality_failed", providerDetail(error));
        return null;
      },
    );
    const [nowPayload, hourlyRoot, airQuality] = await Promise.all([
      request(baseUrl, apiKey, "/v7/weather/now", {
        location,
        lang: "zh",
        unit: "m",
      }),
      fetchHourlyForecast(baseUrl, apiKey, location),
      airPromise,
    ]);

    const nowRoot = v7Root(nowPayload);
    const now = record(nowRoot.now);
    const observedAt = text(now?.obsTime);
    if (!now || !observedAt || !Array.isArray(hourlyRoot.hourly)) {
      throw new Error("Incomplete QWeather response");
    }

    const missingFields: string[] = [];
    const currentVisibility = numberValue(now.vis);
    const current: CurrentWeather = {
      observedAt,
      temperature: numberValue(now.temp),
      feelsLike: numberValue(now.feelsLike),
      condition: text(now.text) ?? "",
      humidity: numberValue(now.humidity),
      cloud: numberValue(now.cloud),
      precipitation: numberValue(now.precip),
      windSpeed: numberValue(now.windSpeed),
      windDirection: text(now.windDir) ?? "",
      windDegree: numberValue(now.wind360),
      visibility: currentVisibility === null ? null : currentVisibility * 1000,
      pressure: numberValue(now.pressure),
      airQuality,
    };

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
      ["airQuality", current.airQuality],
    ];
    for (const [field, value] of currentFields) {
      if (value === null) missingFields.push(`current.${field}`);
    }

    const hourly: HourlyWeather[] = [];
    for (const [index, value] of hourlyRoot.hourly.slice(0, 72).entries()) {
      const item = record(value);
      const time = text(item?.fxTime);
      if (!item || !time) {
        missingFields.push(`hourly.${index}.time`);
        continue;
      }
      const windSpeed = numberValue(item.windSpeed);
      const visibility = numberValue(item.vis);
      const mapped: HourlyWeather = {
        time,
        temperature: numberValue(item.temp),
        condition: text(item.text) ?? "",
        humidity: numberValue(item.humidity),
        cloud: numberValue(item.cloud),
        precipitationProbability: numberValue(item.pop),
        precipitation: numberValue(item.precip),
        windSpeed: windSpeed === null ? null : windSpeed / 3.6,
        windDirection: text(item.windDir) ?? "",
        visibility: visibility === null ? null : visibility * 1000,
      };
      const fields: Array<[keyof HourlyWeather, unknown]> = [
        ["temperature", mapped.temperature],
        ["condition", mapped.condition || null],
        ["humidity", mapped.humidity],
        ["cloud", mapped.cloud],
        ["precipitationProbability", mapped.precipitationProbability],
        ["precipitation", mapped.precipitation],
        ["windSpeed", mapped.windSpeed],
        ["windDirection", mapped.windDirection || null],
        ["visibility", mapped.visibility],
      ];
      for (const [field, fieldValue] of fields) {
        if (fieldValue === null) missingFields.push(`hourly.${index}.${field}`);
      }
      hourly.push(mapped);
    }

    return {
      status: "OK",
      current,
      hourly,
      sources: [
        ...new Set(["和风天气", ...sources(nowRoot), ...sources(hourlyRoot)]),
      ],
      missingFields,
      message: airQuality ? null : "实时空气质量不可用或账号未授权。",
    };
  } catch (error) {
    return emptyWeather(
      "UNAVAILABLE",
      error instanceof QWeatherFailure
        ? `和风天气服务暂不可用（${error.detail}）。`
        : "和风天气服务暂不可用。",
    );
  }
}
