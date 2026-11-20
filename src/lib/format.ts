import type { LocationPrecision } from "@/functions/shared/contracts";

const timeFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  month: "long",
  day: "numeric",
  weekday: "short",
});

export function formatTime(value: string | null) {
  return value ? timeFormatter.format(new Date(value)) : "暂不可用";
}

export function formatRange(start: string, end: string) {
  return `${formatTime(start)} — ${formatTime(end)}`;
}

export function formatDate(value: string) {
  return dateFormatter.format(new Date(`${value}T12:00:00+08:00`));
}

export function shanghaiDate(offsetDays = 0) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  const date = new Date(
    Date.UTC(
      Number(value.year),
      Number(value.month) - 1,
      Number(value.day) + offsetDays,
    ),
  );
  return date.toISOString().slice(0, 10);
}

export function formatObservedAt(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

export function compass(degrees: number) {
  const names = ["北", "东北", "东", "东南", "南", "西南", "西", "西北"];
  return names[Math.round((((degrees % 360) + 360) % 360) / 45) % 8];
}

export function metric(value: number | null, unit: string, digits = 0) {
  return value === null ? "—" : `${value.toFixed(digits)}${unit}`;
}

/** 统一评分依据与指标的单位格式，避免出现 33.333333333333336%。 */
export function formatMetricValue(value: number, unit: string) {
  if (unit === "%" || unit === "分") return `${Math.round(value)}${unit}`;
  if (unit === "mm" || unit === "m/s" || unit === "km/h" || unit === "km") {
    return `${value.toFixed(1)}${unit}`;
  }
  if (unit === "°") return `${value.toFixed(1)}${unit}`;
  return `${Number.isInteger(value) ? value : value.toFixed(1)}${unit}`;
}

export function scoreLabel(score: number | null) {
  if (score === null) return "数据不足";
  if (score >= 80) return "很值得等待";
  if (score >= 65) return "条件较好";
  if (score >= 45) return "可以一试";
  return "条件一般";
}

export function fireCloudLabel(score: number | null) {
  if (score === null) return "数据不足";
  if (score >= 80) return "较有希望";
  if (score >= 65) return "可以关注";
  if (score >= 45) return "条件一般";
  return "希望较小";
}

export function precisionLabel(precision: LocationPrecision) {
  if (precision === "GPS") return "GPS 定位";
  if (precision === "MANUAL") return "手动坐标";
  return "区县中心";
}

export function compactLocationName(location: {
  precision: LocationPrecision;
  name: string;
  region?: string;
}) {
  if (location.precision !== "GPS" || !location.region) return location.name;
  const parts = location.region.split(/\s+/).filter(Boolean)
    .filter((part, index, all) => part !== all[index - 1]);
  return parts.slice(-3).join("") || location.name;
}

export function cameraLabel(
  make: string | null,
  model: string | null,
): string | null {
  const brand = make?.trim() ?? "";
  const name = model?.trim() ?? "";
  if (!name) return brand || null;
  if (!brand) return name;
  const brandTokens = brand.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const modelHead = name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)[0];
  if (
    name.toLowerCase().startsWith(brand.toLowerCase()) ||
    (modelHead !== undefined && brandTokens.includes(modelHead))
  ) {
    return name;
  }
  return `${brand} ${name}`;
}

export function formatExifDateTime(value: string | null): string | null {
  if (!value) return null;
  return value.replace(
    /^(\d{4}):(\d{2}):(\d{2})([ T].*)?$/,
    "$1-$2-$3$4",
  );
}

export function focalLengthChip(
  focalLength: number | null,
  focalLength35: number | null,
): { label: string; value: string } | null {
  if (focalLength !== null && focalLength35 !== null) {
    return {
      label: "焦距",
      value: `${focalLength}mm（等效 ${focalLength35}mm）`,
    };
  }
  if (focalLength35 !== null) {
    return { label: "等效焦距", value: `${focalLength35}mm` };
  }
  if (focalLength !== null) {
    return { label: "镜头焦距", value: `${focalLength}mm` };
  }
  return null;
}

const WEATHER_FIELD_LABELS: Record<string, string> = {
  cloud: "云量",
  cloudHigh: "高云量",
  cloudMid: "中云量",
  cloudLow: "低云量",
  cloudLayers: "云层分层",
  aerosolOpticalDepth: "气溶胶光学厚度",
  precipitationProbability: "降水概率",
  precipitation: "降水量",
  visibility: "能见度",
  humidity: "相对湿度",
  windSpeed: "风速",
  windGust: "阵风",
  windDirection: "风向",
  windDegree: "风向角",
  temperature: "气温",
  feelsLike: "体感温度",
  condition: "天气现象",
  pressure: "气压",
  airQuality: "空气质量",
  sunEvent: "太阳事件",
};

export function missingFieldLabel(code: string) {
  const suffix = code.split(".").pop() ?? code;
  return WEATHER_FIELD_LABELS[code] ?? WEATHER_FIELD_LABELS[suffix] ?? code;
}

/** Groups repeated per-hour field codes into one readable line. */
export function summarizeMissingFields(codes: string[]) {
  const current = new Set<string>();
  const hourly = new Map<string, number>();
  const other = new Set<string>();
  for (const code of codes) {
    const parts = code.split(".");
    const field = parts[parts.length - 1];
    if (parts[0] === "current") {
      current.add(missingFieldLabel(field));
    } else if (parts[0] === "hourly") {
      hourly.set(field, (hourly.get(field) ?? 0) + 1);
    } else {
      other.add(missingFieldLabel(code));
    }
  }
  const summary = [...other];
  for (const field of current) summary.push(`当前${field}`);
  for (const [field, count] of hourly) {
    summary.push(
      `逐小时${missingFieldLabel(field)}${count > 1 ? `（${count} 小时）` : ""}`,
    );
  }
  return summary;
}

