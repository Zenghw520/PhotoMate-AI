import type { CurrentWeather, WeatherData } from "../shared/contracts.ts";
import { fetchTrustedJson } from "./http.ts";

const CAIYUN_BASE_URL = "https://api.caiyunapp.com";
const CAIYUN_HOSTS = ["api.caiyunapp.com"] as const;

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

function percentage(value: unknown): number | null {
  const number = numberValue(value);
  return number === null ? null : number * 100;
}

function compassDirection(degrees: number | null): string {
  if (degrees === null) return "";
  const directions = [
    "北",
    "北东北",
    "东北",
    "东东北",
    "东",
    "东东南",
    "东南",
    "南东南",
    "南",
    "南西南",
    "西南",
    "西西南",
    "西",
    "西西北",
    "西北",
    "北西北",
  ];
  return directions[Math.round((((degrees % 360) + 360) % 360) / 22.5) % 16];
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

/** Optional realtime-only auxiliary weather; it never throws into the primary weather chain. */
export async function getCaiyunWeather(
  latitude: number,
  longitude: number,
): Promise<WeatherData> {
  const apiKey = Deno.env.get("CAIYUN_API_KEY")?.trim();
  if (!apiKey) {
    return emptyWeather(
      "UNCONFIGURED",
      "未配置 CAIYUN_API_KEY，已跳过彩云天气。",
    );
  }
  if (
    !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 || Math.abs(longitude) > 180
  ) return emptyWeather("UNAVAILABLE", "彩云天气查询坐标无效。");

  try {
    const payload = await fetchTrustedJson<unknown>({
      baseUrl: CAIYUN_BASE_URL,
      path: `/v2.6/${
        encodeURIComponent(apiKey)
      }/${longitude},${latitude}/realtime`,
      allowedHosts: CAIYUN_HOSTS,
      query: { lang: "zh_CN", unit: "metric" },
      timeoutMs: 4_500,
      maxResponseBytes: 256 * 1024,
      retries: 1,
    });
    const root = record(payload);
    const realtime = record(record(root?.result)?.realtime);
    const serverTime = numberValue(root?.server_time);
    if (root?.status !== "ok" || !realtime || serverTime === null) {
      return emptyWeather("UNAVAILABLE", "彩云天气服务暂不可用。");
    }

    const precipitation = record(record(realtime.precipitation)?.local);
    const wind = record(realtime.wind);
    const air = record(realtime.air_quality);
    const aqi = record(air?.aqi);
    const description = record(air?.description);
    const windDegree = numberValue(wind?.direction);
    const aqiValue = numberValue(aqi?.chn);
    const category = text(description?.chn);
    const current: CurrentWeather = {
      observedAt: new Date(serverTime * 1000).toISOString(),
      temperature: numberValue(realtime.temperature),
      feelsLike: numberValue(realtime.apparent_temperature),
      condition: text(realtime.skycon) ?? "",
      humidity: percentage(realtime.humidity),
      cloud: percentage(realtime.cloudrate),
      precipitation: numberValue(precipitation?.intensity),
      windSpeed: numberValue(wind?.speed),
      windDirection: compassDirection(windDegree),
      windDegree,
      visibility: numberValue(realtime.visibility),
      pressure: numberValue(realtime.pressure),
      airQuality: aqiValue === null && category === null ? null : {
        aqi: aqiValue,
        category,
        primaryPollutant: null,
      },
    };
    const fields: Array<[string, unknown]> = [
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
    return {
      status: "OK",
      current,
      hourly: [],
      sources: ["Caiyun v2.6 realtime"],
      missingFields: fields.filter(([, value]) => value === null).map((
        [name],
      ) => `current.${name}`),
      message: null,
    };
  } catch {
    return emptyWeather("UNAVAILABLE", "彩云天气服务暂不可用。");
  }
}
