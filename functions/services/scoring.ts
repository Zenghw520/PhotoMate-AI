import type {
  HourlyWeather,
  PotentialScore,
  ScoreBasis,
  TimeWindow,
} from "../shared/contracts.ts";

const LOOKOUT_MS = 90 * 60 * 1000;
const FIELD_ORDER = [
  "cloud",
  "precipitationProbability",
  "precipitation",
  "visibility",
  "humidity",
  "windSpeed",
  "cloudHigh",
  "cloudMid",
  "cloudLow",
  "aerosolOpticalDepth",
] as const;

type WeatherField = (typeof FIELD_ORDER)[number];

/**
 * 朝霞与晚霞使用独立权重：清晨更看重低云与湿度（逆温、晨雾），
 * 傍晚更看重风速与能见度。两者都只基于真实逐小时数据。
 */
const WEIGHT_PROFILES: Record<"dawn" | "dusk", Record<WeatherField, number>> = {
  dawn: {
    cloud: 45,
    precipitationProbability: 15,
    precipitation: 10,
    visibility: 15,
    humidity: 7,
    windSpeed: 6,
    cloudHigh: 8,
    cloudMid: 8,
    cloudLow: 12,
    aerosolOpticalDepth: 5,
  },
  dusk: {
    cloud: 45,
    precipitationProbability: 15,
    precipitation: 10,
    visibility: 16,
    humidity: 5,
    windSpeed: 9,
    cloudHigh: 8,
    cloudMid: 8,
    cloudLow: 10,
    aerosolOpticalDepth: 5,
  },
};

type Metric = (value: number) => number;

const METRICS: Record<WeatherField, Metric> = {
  cloud: (value) => {
    if (value <= 20) return 70 + value * 1.25;
    if (value <= 60) return 95 + (value - 20) * 0.125;
    return Math.max(0, 100 - (value - 60) * 1.8);
  },
  precipitationProbability: (value) => Math.max(0, 100 - value),
  precipitation: (value) => Math.max(0, 100 - Math.max(0, value) * 20),
  visibility: (value) => {
    if (value >= 10_000) return 100;
    if (value <= 1_000) return 20;
    return 20 + (value - 1_000) * 80 / 9_000;
  },
  humidity: (value) => {
    if (value < 40) return Math.max(40, 80 - (40 - value));
    if (value <= 70) return 100 - Math.abs(value - 55) * 0.4;
    return Math.max(0, 94 - (value - 70) * 2.5);
  },
  windSpeed: (value) => {
    if (value <= 3) return 100;
    if (value <= 8) return 100 - (value - 3) * 12;
    return Math.max(0, 40 - (value - 8) * 10);
  },
  cloudHigh: (value) => {
    if (value < 5) return 55;
    if (value < 20) return 80;
    if (value <= 65) return 100;
    if (value <= 85) return 75;
    return 45;
  },
  cloudMid: (value) => {
    if (value < 5) return 50;
    if (value < 20) return 78;
    if (value <= 60) return 100;
    if (value <= 85) return 72;
    return 40;
  },
  cloudLow: (value) => {
    if (value <= 20) return 100;
    if (value <= 40) return 85;
    if (value <= 60) return 60;
    if (value <= 80) return 35;
    return 15;
  },
  aerosolOpticalDepth: (value) => {
    if (value <= 0.15) return 100;
    if (value <= 0.3) return 85;
    if (value <= 0.5) return 65;
    if (value <= 0.8) return 40;
    return 20;
  },
};

const LABELS: Record<
  WeatherField,
  { label: string; unit: string; explanation: string }
> = {
  cloud: {
    label: "云量",
    unit: "%",
    explanation: "适度云层有利于反射霞光，满天厚云可能遮挡光线",
  },
  precipitationProbability: {
    label: "降水概率",
    unit: "%",
    explanation: "降水概率越低，拍摄窗口越可靠",
  },
  precipitation: {
    label: "降水量",
    unit: "mm",
    explanation: "降水量越低，镜头和行程受降水影响越小",
  },
  visibility: {
    label: "能见度",
    unit: "m",
    explanation: "能见度越高，远处层次与霞光细节越容易保留",
  },
  humidity: {
    label: "相对湿度",
    unit: "%",
    explanation: "过高湿度可能削弱通透度，过低湿度也不利于形成合适云层",
  },
  windSpeed: {
    label: "风速",
    unit: "m/s",
    explanation: "较低风速有利于稳定机位，强风会增加抖动和安全风险",
  },
  cloudHigh: {
    label: "高云量",
    unit: "%",
    explanation: "高云是霞光色彩的主要载体，适量时形成幕布，过厚会压暗色彩",
  },
  cloudMid: {
    label: "中云量",
    unit: "%",
    explanation: "中云同样承接低角度光，过多会削弱透光与层次",
  },
  cloudLow: {
    label: "低云量",
    unit: "%",
    explanation: "低云过多会遮挡地平线附近的太阳，减少直射染色",
  },
  aerosolOpticalDepth: {
    label: "气溶胶光学厚度",
    unit: "",
    explanation: "气溶胶越高，色彩越容易被消光，空气通透度下降",
  },
};

function round(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function average(values: number[]): number | null {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;
}

function confidenceLevel(confidence: number): "LOW" | "MEDIUM" | "HIGH" {
  if (confidence >= 0.8) return "HIGH";
  if (confidence >= 0.45) return "MEDIUM";
  return "LOW";
}

export function scoreTwilight(
  kind: "dawn" | "dusk",
  forecastWindow: TimeWindow,
  hourly: HourlyWeather[],
  fetchedAt: Date,
  now: Date = new Date(),
): PotentialScore {
  const start = Date.parse(forecastWindow.start);
  const end = Date.parse(forecastWindow.end);
  const validWindow = Number.isFinite(start) && Number.isFinite(end) &&
    start < end;
  const records = validWindow
    ? hourly.filter((entry) => {
      const time = Date.parse(entry.time);
      return Number.isFinite(time) && time >= start - LOOKOUT_MS &&
        time <= end + LOOKOUT_MS;
    })
    : [];
  const eventName = kind === "dawn" ? "朝霞" : "晚霞";
  const weights = WEIGHT_PROFILES[kind];
  const values = {} as Record<WeatherField, number | null>;
  for (const field of FIELD_ORDER) {
    values[field] = average(
      records.map((entry) => entry[field]).filter((value): value is number =>
        typeof value === "number" && Number.isFinite(value)
      ),
    );
  }

  const missingFields: string[] = FIELD_ORDER.filter((field) =>
    values[field] === null
  );
  const basis: ScoreBasis[] = FIELD_ORDER.map((field) => ({
    code: field,
    label: LABELS[field].label,
    value: values[field] === null ? null : round(values[field]!),
    unit: LABELS[field].unit,
    contribution: null,
    explanation: values[field] === null
      ? "窗口附近没有该字段的真实逐小时数据"
      : LABELS[field].explanation,
  }));

  if (!validWindow || records.length === 0 || values.cloud === null) {
    const reason = !validWindow
      ? "拍摄窗口时间无效"
      : records.length === 0
      ? "窗口前后90分钟内没有真实逐小时天气数据"
      : "窗口附近完全缺少云量数据";
    return {
      status: records.length ? "INSUFFICIENT_DATA" : "UNAVAILABLE",
      score: null,
      confidence: 0,
      confidenceLevel: "LOW",
      basis: validWindow && records.length > 0 ? basis : [],
      missingFields: !validWindow
        ? ["sunEvent"]
        : records.length === 0
        ? []
        : missingFields,
      forecastWindow: validWindow ? forecastWindow : null,
      scoreMode: "UNAVAILABLE",
      summary: `${reason}，无法评估${eventName}潜力。`,
    };
  }

  const availableWeight = FIELD_ORDER.reduce(
    (sum, field) => sum + (values[field] === null ? 0 : weights[field]),
    0,
  );
  let weightedScore = 0;
  for (let index = 0; index < FIELD_ORDER.length; index++) {
    const field = FIELD_ORDER[index];
    const value = values[field];
    if (value === null) continue;
    const contribution = METRICS[field](value) * weights[field] /
      availableWeight;
    weightedScore += contribution;
    basis[index].contribution = round(contribution);
  }

  const insideWindow = records.filter((entry) => {
    const time = Date.parse(entry.time);
    return time >= start && time <= end;
  }).length;
  const windowCoverage = insideWindow / records.length;
  const ageHours =
    Number.isFinite(fetchedAt.getTime()) && Number.isFinite(now.getTime())
      ? Math.max(0, (now.getTime() - fetchedAt.getTime()) / 3_600_000)
      : 72;
  const freshness = ageHours <= 3
    ? 1
    : ageHours <= 12
    ? 0.85
    : ageHours <= 24
    ? 0.65
    : 0.4;
  const totalWeight = FIELD_ORDER.reduce(
    (sum, field) => sum + weights[field],
    0,
  );
  const completeness = availableWeight / totalWeight;
  const confidence = round(
    Math.min(
      0.74,
      (0.3 + 0.55 * completeness + 0.15 * windowCoverage) * freshness,
    ),
    2,
  );
  const lowCloud = values.cloudLow;
  const screenCloud = (values.cloudHigh ?? 0) + (values.cloudMid ?? 0);
  let layerGate = 1;
  if (lowCloud !== null) {
    if (lowCloud >= 90) layerGate *= 0.4;
    else if (lowCloud >= 75) layerGate *= 0.55;
    else if (lowCloud >= 55) layerGate *= 0.75;
    else if (lowCloud >= 35) layerGate *= 0.9;
  }
  if (
    (values.cloudHigh !== null || values.cloudMid !== null) &&
    screenCloud < 8
  ) layerGate *= 0.8;
  const aerosol = values.aerosolOpticalDepth;
  if (aerosol !== null) {
    if (aerosol > 0.8) layerGate *= 0.8;
    else if (aerosol > 0.5) layerGate *= 0.9;
  }
  const score = round(weightedScore * layerGate);
  const partial = missingFields.length > 0;
  const hasLayers = values.cloudHigh !== null || values.cloudMid !== null ||
    values.cloudLow !== null;
  const hasAerosol = aerosol !== null;
  const layerNote = hasLayers && hasAerosol
    ? "已纳入高中低云分层与气溶胶数据"
    : hasLayers
    ? "已纳入高中低云分层，但缺少气溶胶数据"
    : hasAerosol
    ? "含气溶胶数据，但缺少高中低云分层"
    : "缺少高中低云分层与气溶胶数据";
  const notes = [layerNote];
  if (lowCloud !== null && lowCloud >= 55) {
    notes.push("低云遮挡明显，评分已下调");
  } else if (
    (values.cloudHigh !== null || values.cloudMid !== null) &&
    screenCloud < 8
  ) {
    notes.push("中高云偏少，评分已下调");
  }
  if (aerosol !== null && aerosol > 0.5) {
    notes.push("气溶胶偏高，评分已下调");
  }
  const summary =
    `${eventName}环境评分 ${score} 分，窗口前后 90 分钟共 ${records.length} 条逐小时数据。` +
    `${partial ? "部分字段缺失，评分已按可用数据归一化。" : "天气字段完整。"}${
      notes.join("；")
    }。置信度反映数据完整性与时效性。`;

  return {
    status: "OK",
    score,
    confidence,
    confidenceLevel: confidenceLevel(confidence),
    basis,
    missingFields,
    forecastWindow,
    scoreMode: partial ? "PARTIAL" : "FULL",
    summary,
  };
}
