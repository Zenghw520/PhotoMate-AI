import type {
  CurrentWeather,
  HourlyWeather,
  WeatherData,
} from "../shared/contracts.ts";

const ALIGNMENT_MS = 90 * 60 * 1000;

function average(
  left: number | null,
  right: number | null,
): number | null {
  if (left === null && right === null) return null;
  if (left === null) return right;
  if (right === null) return left;
  return (left + right) / 2;
}

function active(status: WeatherData["status"]) {
  return status === "OK" || status === "STALE";
}

function laterTime(
  left: string,
  right: string,
): string {
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);
  if (!Number.isFinite(leftTime)) return right;
  if (!Number.isFinite(rightTime)) return left;
  return leftTime >= rightTime ? left : right;
}

function mergeCurrent(
  left: CurrentWeather | null,
  right: CurrentWeather | null,
): CurrentWeather | null {
  if (!left) return right;
  if (!right) return left;
  return {
    observedAt: laterTime(left.observedAt, right.observedAt),
    temperature: average(left.temperature, right.temperature),
    feelsLike: average(left.feelsLike, right.feelsLike),
    condition: left.condition || right.condition,
    humidity: average(left.humidity, right.humidity),
    cloud: average(left.cloud, right.cloud),
    precipitation: average(left.precipitation, right.precipitation),
    windSpeed: average(left.windSpeed, right.windSpeed),
    windDirection: left.windDirection || right.windDirection,
    windDegree: left.windDegree ?? right.windDegree,
    visibility: average(left.visibility, right.visibility),
    pressure: average(left.pressure, right.pressure),
    airQuality: left.airQuality ?? right.airQuality,
  };
}

function nearestEntry(
  entries: HourlyWeather[],
  target: string,
): HourlyWeather | null {
  const targetTime = Date.parse(target);
  if (!Number.isFinite(targetTime)) return null;
  let nearest: HourlyWeather | null = null;
  let distance = ALIGNMENT_MS;
  for (const entry of entries) {
    const difference = Math.abs(Date.parse(entry.time) - targetTime);
    if (Number.isFinite(difference) && difference <= distance) {
      nearest = entry;
      distance = difference;
    }
  }
  return nearest;
}

function mergeHourlyEntry(
  primary: HourlyWeather,
  secondary: HourlyWeather | null,
): HourlyWeather {
  if (!secondary) return primary;
  return {
    time: primary.time,
    temperature: average(primary.temperature, secondary.temperature),
    condition: primary.condition || secondary.condition,
    humidity: average(primary.humidity, secondary.humidity),
    cloud: average(primary.cloud, secondary.cloud),
    precipitationProbability: average(
      primary.precipitationProbability,
      secondary.precipitationProbability,
    ),
    precipitation: average(
      primary.precipitation,
      secondary.precipitation,
    ),
    windSpeed: average(primary.windSpeed, secondary.windSpeed),
    windDirection: primary.windDirection || secondary.windDirection,
    visibility: average(primary.visibility, secondary.visibility),
  };
}

function mergeHourly(
  left: HourlyWeather[],
  right: HourlyWeather[],
): HourlyWeather[] {
  if (left.length === 0) return right;
  if (right.length === 0) return left;
  return left.map((entry) =>
    mergeHourlyEntry(entry, nearestEntry(right, entry.time))
  );
}

function missingFields(
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
      ["airQuality", current.airQuality],
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

/** Numeric fields use an equal-weight average when both sources provide them. */
export function mergeWeather(
  left: WeatherData,
  right: WeatherData,
): WeatherData {
  if (!active(left.status) && !active(right.status)) {
    const status = left.status === "UNCONFIGURED" &&
        right.status === "UNCONFIGURED"
      ? "UNCONFIGURED"
      : "UNAVAILABLE";
    return {
      status,
      current: null,
      hourly: [],
      sources: [],
      missingFields: [],
      message: left.message ?? right.message ?? "天气服务暂不可用。",
    };
  }
  if (!active(right.status)) {
    return {
      ...left,
      sources: left.sources.length ? left.sources : ["和风天气"],
    };
  }
  if (!active(left.status)) {
    return {
      ...right,
      sources: right.sources.length ? right.sources : ["OpenWeather"],
    };
  }

  const current = mergeCurrent(left.current, right.current);
  const hourly = mergeHourly(left.hourly, right.hourly);
  const status = left.status === "STALE" && right.status === "STALE"
    ? "STALE"
    : "OK";
  return {
    status,
    current,
    hourly,
    sources: [...new Set([...left.sources, ...right.sources])],
    missingFields: missingFields(current, hourly),
    message: status === "STALE" ? "多源天气使用短时缓存。" : null,
  };
}
