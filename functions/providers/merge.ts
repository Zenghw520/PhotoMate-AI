import type {
  CurrentWeather,
  HourlyWeather,
  WeatherData,
} from "../shared/contracts.ts";

const ALIGNMENT_MS = 90 * 60 * 1000;

function average(values: Array<number | null>): number | null {
  const available = values.filter((value): value is number =>
    value !== null && Number.isFinite(value)
  );
  return available.length
    ? available.reduce((sum, value) => sum + value, 0) / available.length
    : null;
}

function firstText(values: string[]): string {
  return values.find((value) => value.trim() !== "") ?? "";
}

function firstNumber(values: Array<number | null>): number | null {
  return values.find((value) => value !== null) ?? null;
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

function mergeCurrent(items: CurrentWeather[]): CurrentWeather | null {
  if (items.length === 0) return null;
  if (items.length === 1) return items[0];
  return {
    observedAt: items.map((item) => item.observedAt).reduce(laterTime),
    temperature: average(items.map((item) => item.temperature)),
    feelsLike: average(items.map((item) => item.feelsLike)),
    condition: firstText(items.map((item) => item.condition)),
    humidity: average(items.map((item) => item.humidity)),
    cloud: average(items.map((item) => item.cloud)),
    precipitation: average(items.map((item) => item.precipitation)),
    windSpeed: average(items.map((item) => item.windSpeed)),
    windDirection: firstText(items.map((item) => item.windDirection)),
    windDegree: firstNumber(items.map((item) => item.windDegree)),
    visibility: average(items.map((item) => item.visibility)),
    pressure: average(items.map((item) => item.pressure)),
    airQuality:
      items.map((item) => item.airQuality).find((value) => value !== null) ??
        null,
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
  secondaries: Array<HourlyWeather | null>,
): HourlyWeather {
  const items = [
    primary,
    ...secondaries.filter((entry): entry is HourlyWeather => entry !== null),
  ];
  if (items.length === 1) return primary;
  return {
    time: primary.time,
    temperature: average(items.map((item) => item.temperature)),
    condition: firstText(items.map((item) => item.condition)),
    humidity: average(items.map((item) => item.humidity)),
    cloud: average(items.map((item) => item.cloud)),
    precipitationProbability: average(
      items.map((item) => item.precipitationProbability),
    ),
    precipitation: average(items.map((item) => item.precipitation)),
    windSpeed: average(items.map((item) => item.windSpeed)),
    windDirection: firstText(items.map((item) => item.windDirection)),
    visibility: average(items.map((item) => item.visibility)),
    cloudHigh: average(items.map((item) => item.cloudHigh ?? null)),
    cloudMid: average(items.map((item) => item.cloudMid ?? null)),
    cloudLow: average(items.map((item) => item.cloudLow ?? null)),
    aerosolOpticalDepth: average(
      items.map((item) => item.aerosolOpticalDepth ?? null),
    ),
  };
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

/**
 * Merges any number of weather sources. Numeric fields use an equal-weight
 * average over the sources that provide them; text fields keep source order
 * priority (和风天气 first). The longest hourly series provides the timeline.
 */
export function mergeWeather(...sources: WeatherData[]): WeatherData {
  const available = sources.filter((source) => active(source.status));
  if (available.length === 0) {
    const status = sources.every((source) => source.status === "UNCONFIGURED")
      ? "UNCONFIGURED"
      : "UNAVAILABLE";
    return {
      status,
      current: null,
      hourly: [],
      sources: [],
      missingFields: [],
      message: sources.find((source) => source.message)?.message ??
        "天气服务暂不可用。",
    };
  }

  const current = mergeCurrent(
    available.map((source) => source.current).filter((
      item,
    ): item is CurrentWeather => item !== null),
  );
  const base = available.reduce((longest, source) =>
    source.hourly.length > longest.hourly.length ? source : longest
  );
  const others = available.filter((source) => source !== base);
  const hourly = base.hourly.map((entry) =>
    mergeHourlyEntry(
      entry,
      others.map((source) => nearestEntry(source.hourly, entry.time)),
    )
  );
  const status = available.every((source) => source.status === "STALE")
    ? "STALE"
    : "OK";
  return {
    status,
    current,
    hourly,
    sources: [...new Set(available.flatMap((source) => source.sources))],
    missingFields: missingFields(current, hourly),
    message: status === "STALE" ? "多源天气使用短时缓存。" : null,
  };
}
