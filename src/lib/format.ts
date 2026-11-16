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

