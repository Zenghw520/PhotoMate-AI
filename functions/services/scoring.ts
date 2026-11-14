import type {
  HourlyWeather,
  PotentialScore,
  ScoreBasis,
  TimeWindow,
} from "../shared/contracts.ts";

const LOOKOUT_MS = 90 * 60 * 1000;
const WEIGHTS = {
  cloud: 45,
  precipitationProbability: 15,
  precipitation: 10,
  visibility: 15,
  humidity: 5,
  windSpeed: 10,
} as const;

type WeatherField = keyof typeof WEIGHTS;

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
  const values = {} as Record<WeatherField, number | null>;
  for (const field of Object.keys(WEIGHTS) as WeatherField[]) {
    values[field] = average(
      records.map((entry) => entry[field]).filter((value): value is number =>
        typeof value === "number" && Number.isFinite(value)
      ),
    );
  }

  const missingFields: string[] = (Object.keys(WEIGHTS) as WeatherField[])
    .filter((field) => values[field] === null);
  missingFields.push("cloudLayers");
  const basis: ScoreBasis[] = (Object.keys(WEIGHTS) as WeatherField[]).map((
    field,
  ) => ({
    code: field,
    label: LABELS[field].label,
    value: values[field] === null ? null : round(values[field]!),
    unit: LABELS[field].unit,
    contribution: null,
    explanation: values[field] === null
      ? "窗口附近没有该字段的真实逐小时数据"
      : LABELS[field].explanation,
  }));
  basis.push({
    code: "cloudLayers",
    label: "高中低云分层",
    value: null,
    unit: "%",
    contribution: null,
    explanation: "当前逐小时契约没有高中低云分层，因此限制置信度",
  });

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
      basis,
      missingFields,
      forecastWindow: validWindow ? forecastWindow : null,
      scoreMode: "UNAVAILABLE",
      summary: `${reason}，无法评估${eventName}潜力。`,
    };
  }

  const availableWeight = (Object.keys(WEIGHTS) as WeatherField[]).reduce(
    (sum, field) => sum + (values[field] === null ? 0 : WEIGHTS[field]),
    0,
  );
  let weightedScore = 0;
  for (
    let index = 0;
    index < (Object.keys(WEIGHTS) as WeatherField[]).length;
    index++
  ) {
    const field = (Object.keys(WEIGHTS) as WeatherField[])[index];
    const value = values[field];
    if (value === null) continue;
    const contribution = METRICS[field](value) * WEIGHTS[field] /
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
  const completeness = availableWeight / 100;
  const confidence = round(
    Math.min(
      0.74,
      (0.3 + 0.55 * completeness + 0.15 * windowCoverage) * freshness,
    ),
    2,
  );
  const score = round(weightedScore);
  const partial = missingFields.some((field) => field !== "cloudLayers");
  const summary =
    `${eventName}潜力评分为${score}分，基于窗口前后90分钟内的${records.length}条逐小时数据；` +
    `${
      partial ? "部分字段缺失，已按剩余权重归一化；" : "基础天气字段完整；"
    }缺少高中低云分层，置信度仅表示数据完整性、窗口覆盖与时效性，不是${eventName}出现概率。`;

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
