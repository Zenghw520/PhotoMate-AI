import type {
  FireCloudPrediction,
  HourlyWeather,
  ScoreBasis,
  TimeWindow,
} from "../shared/contracts.ts";

const LOOKOUT_MS = 20 * 60 * 1000;
const WEIGHTS = {
  cloud: 40,
  precipitationProbability: 20,
  precipitation: 10,
  visibility: 15,
  humidity: 10,
  windSpeed: 5,
} as const;

type WeatherField = keyof typeof WEIGHTS;
type Metric = (value: number) => number;

const METRICS: Record<WeatherField, Metric> = {
  cloud: (value) => {
    if (value < 5) return 10;
    if (value < 25) return 30 + (value - 5) * 2.5;
    if (value < 55) return 80 + (value - 25) * (20 / 30);
    if (value <= 80) return 100 - (value - 55) * 1.2;
    if (value <= 92) return 70 - (value - 80) * 3;
    return 24;
  },
  precipitationProbability: (value) => Math.max(0, 100 - value),
  precipitation: (value) => Math.max(0, 100 - Math.max(0, value) * 25),
  visibility: (value) => {
    if (value >= 15_000) return 100;
    if (value >= 10_000) return 85;
    if (value >= 5_000) return 60;
    if (value >= 2_000) return 30;
    return 10;
  },
  humidity: (value) => {
    if (value <= 70) return 100;
    if (value <= 85) return 100 - (value - 70) * 3;
    return Math.max(20, 55 - (value - 85) * 2);
  },
  windSpeed: (value) => {
    if (value <= 3) return 100;
    if (value <= 8) return 100 - (value - 3) * 8;
    return Math.max(20, 60 - (value - 8) * 5);
  },
};

const LABELS: Record<
  WeatherField,
  { label: string; unit: string; explanation: string }
> = {
  cloud: {
    label: "总云量",
    unit: "%",
    explanation:
      "总云量适中时更可能有被低角度阳光染色的云层；缺少分层，无法区分高云与低云",
  },
  precipitationProbability: {
    label: "降水概率",
    unit: "%",
    explanation: "降水概率越低，云层透光和视线条件通常越稳定",
  },
  precipitation: {
    label: "降水量",
    unit: "mm",
    explanation: "明显降水往往对应更厚的云层，会削弱低角度阳光",
  },
  visibility: {
    label: "能见度",
    unit: "m",
    explanation: "能见度越高，远景层次和霞光色彩越容易保留",
  },
  humidity: {
    label: "相对湿度",
    unit: "%",
    explanation: "湿度过高可能增加消光和低层水汽遮挡",
  },
  windSpeed: {
    label: "风速",
    unit: "m/s",
    explanation: "风速只影响拍摄稳定性，不作为火烧云形成的主要依据",
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

export function scoreFireCloud(
  kind: "dawn" | "dusk",
  forecastWindow: TimeWindow,
  hourly: HourlyWeather[],
  fetchedAt: Date,
  now: Date = new Date(),
): FireCloudPrediction {
  const direction = kind === "dawn" ? "EAST" : "WEST";
  const eventName = kind === "dawn" ? "日出" : "日落";
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
  missingFields.push("cloudLayers", "aerosolOpticalDepth");
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
  basis.push(
    {
      code: "cloudLayers",
      label: "高中低云分层",
      value: null,
      unit: "%",
      contribution: null,
      explanation:
        "当前逐小时契约没有云层高度分层，无法判断高云幕布和低云遮挡，因此限制置信度",
    },
    {
      code: "aerosolOpticalDepth",
      label: "气溶胶光学厚度",
      value: null,
      unit: "",
      contribution: null,
      explanation: "缺少气溶胶数据，无法评估大气消光对色彩的影响",
    },
  );

  if (!validWindow || records.length === 0 || values.cloud === null) {
    const reason = !validWindow
      ? "拍摄窗口时间无效"
      : records.length === 0
      ? "窗口前后约1小时内没有真实逐小时天气数据"
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
      summary: `${reason}，无法评估${eventName}火烧云环境潜力。`,
      direction,
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

  const cloudValue = values.cloud!;
  const cloudGate = cloudValue < 5
    ? 0.35
    : cloudValue < 12
    ? 0.7
    : cloudValue >= 92
    ? 0.55
    : cloudValue >= 85
    ? 0.75
    : 1;
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
    0.44 * completeness * freshness * (0.8 + 0.2 * windowCoverage),
    2,
  );
  const score = round(weightedScore * cloudGate);
  const summary =
    `${eventName}火烧云环境潜力为${score}分，基于窗口前后约1小时的${records.length}条逐小时数据；` +
    "缺少高中低云分层与气溶胶数据，分数只表示环境条件，不代表火烧云出现概率。";

  return {
    status: "OK",
    score,
    confidence,
    confidenceLevel: confidenceLevel(confidence),
    basis,
    missingFields,
    forecastWindow,
    scoreMode: "PARTIAL",
    summary,
    direction,
  };
}

export function unavailableFireCloud(
  kind: "dawn" | "dusk",
  summary: string,
): FireCloudPrediction {
  return {
    status: "UNAVAILABLE",
    score: null,
    confidence: 0,
    confidenceLevel: "LOW",
    basis: [],
    missingFields: ["sunEvent", "cloudLayers", "aerosolOpticalDepth"],
    forecastWindow: null,
    scoreMode: "UNAVAILABLE",
    summary,
    direction: kind === "dawn" ? "EAST" : "WEST",
  };
}
