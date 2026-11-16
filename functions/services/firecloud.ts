import type {
  FireCloudOutlook,
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
  cloudHigh: 8,
  cloudMid: 8,
  cloudLow: 10,
  aerosolOpticalDepth: 6,
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
    label: "总云量",
    unit: "%",
    explanation: "总云量适中时更可能有被低角度阳光染色的云层",
  },
  cloudHigh: {
    label: "高云量",
    unit: "%",
    explanation: "高云是主要色彩载体，适量时形成晚霞幕布，过厚会压暗色彩",
  },
  cloudMid: {
    label: "中云量",
    unit: "%",
    explanation: "中云同样承接低角度光，过多会削弱透光与层次",
  },
  cloudLow: {
    label: "低云量",
    unit: "%",
    explanation: "低云过多会遮挡太阳，直接削弱火烧云所需的低角度直射光",
  },
  aerosolOpticalDepth: {
    label: "气溶胶光学厚度",
    unit: "",
    explanation: "气溶胶越高，色彩越容易被消光，空气通透度下降",
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

function possibility(
  score: number | null,
  cloud: number | null,
): {
  value: FireCloudOutlook["possibility"];
  label: string;
} {
  if (score === null || cloud === null) return { value: null, label: "未知" };
  const levels: Array<FireCloudOutlook["possibility"]> = [
    "LOW",
    "MEDIUM",
    "HIGH",
  ];
  let level = score >= 70 ? 2 : score >= 45 ? 1 : 0;
  if (cloud > 92) level = Math.min(level, 0);
  else if (cloud > 75) level = Math.min(level, 1);
  else if (cloud < 8) level = Math.min(level, 0);
  else if (cloud < 15) level = Math.min(level, 1);
  const value = levels[level];
  return {
    value,
    label: value === "HIGH" ? "较高" : value === "MEDIUM" ? "中等" : "较低",
  };
}

function cloudNote(
  cloud: number | null,
  layers: { high: number | null; mid: number | null; low: number | null },
): string {
  if (cloud === null) return "窗口附近缺少云量数据，无法判断火烧云条件。";
  if (layers.low !== null && layers.low > 75) {
    return `低云约 ${
      Math.round(layers.low)
    }%，云层可能遮挡低角度阳光，火烧云条件较差。`;
  }
  const hasLayers = layers.high !== null || layers.mid !== null;
  if (hasLayers) {
    const screen = (layers.high ?? 0) + (layers.mid ?? 0);
    if (screen < 8) return "中高云很少，缺少可被低角度阳光染色的云层。";
    if (screen > 80) return "中高云偏厚，天空容易发灰，色彩层次可能受限。";
    if (
      screen >= 20 && screen <= 70 &&
      (layers.low === null || layers.low <= 40)
    ) {
      return "中高云适量、低云较少，具备较好的火烧云云层结构。";
    }
  }
  if (cloud < 5) return "总云量过低，缺少可被低角度阳光染色的云层。";
  if (cloud < 20) return "总云量偏少，色彩载体有限，画面可能以纯色天空为主。";
  if (cloud <= 70) return "总云量适中，具备形成火烧云的云层条件。";
  if (cloud <= 85) return "总云量偏多，低层云可能遮挡低角度阳光。";
  return "总云量很高，天空容易灰暗，火烧云色彩可能被遮挡。";
}

function vividnessScore(
  cloud: number | null,
  visibility: number | null,
  humidity: number | null,
  precipitationProbability: number | null,
  layers: { high: number | null; mid: number | null; low: number | null },
  aerosolOpticalDepth: number | null,
): number | null {
  if (cloud === null) return null;
  let score: number;
  if (layers.high !== null || layers.mid !== null) {
    const screen = Math.min(100, (layers.high ?? 0) + (layers.mid ?? 0));
    score = screen < 5
      ? 15
      : screen < 15
      ? 45
      : screen <= 60
      ? 90
      : screen <= 80
      ? 65
      : 30;
    if (layers.low !== null) {
      if (layers.low > 90) score -= 45;
      else if (layers.low > 75) score -= 30;
      else if (layers.low > 55) score -= 18;
      else if (layers.low > 35) score -= 8;
    }
  } else {
    score = cloud < 5
      ? 15
      : cloud < 20
      ? 40
      : cloud < 45
      ? 75
      : cloud <= 65
      ? 90
      : cloud <= 80
      ? 72
      : cloud <= 88
      ? 45
      : cloud <= 92
      ? 30
      : 18;
  }
  if (visibility !== null) {
    if (visibility >= 20_000) score += 5;
    else if (visibility < 5_000) score -= 15;
    else if (visibility < 10_000) score -= 8;
  }
  if (humidity !== null) {
    if (humidity > 88) score -= 10;
    else if (humidity > 75) score -= 5;
  }
  if (precipitationProbability !== null && precipitationProbability > 60) {
    score -= 10;
  }
  if (aerosolOpticalDepth !== null) {
    if (aerosolOpticalDepth > 0.8) score -= 20;
    else if (aerosolOpticalDepth > 0.6) score -= 15;
    else if (aerosolOpticalDepth > 0.4) score -= 8;
    else if (aerosolOpticalDepth <= 0.2) score += 3;
  }
  return Math.max(0, Math.min(100, Math.round(score)));
}

function vividnessLabel(score: number | null): string {
  if (score === null) return "未知";
  if (score >= 75) return "很鲜艳";
  if (score >= 55) return "较鲜艳";
  if (score >= 35) return "一般";
  return "偏淡";
}

function outlook(
  score: number | null,
  cloud: number | null,
  visibility: number | null,
  humidity: number | null,
  precipitationProbability: number | null,
  layers: { high: number | null; mid: number | null; low: number | null },
  aerosolOpticalDepth: number | null,
): FireCloudOutlook {
  const chance = possibility(score, cloud);
  const vividness = vividnessScore(
    cloud,
    visibility,
    humidity,
    precipitationProbability,
    layers,
    aerosolOpticalDepth,
  );
  return {
    possibility: chance.value,
    possibilityLabel: chance.label,
    vividness,
    vividnessLabel: vividnessLabel(vividness),
    cloudCover: cloud,
    cloudNote: cloudNote(cloud, layers),
    cloudHigh: layers.high,
    cloudMid: layers.mid,
    cloudLow: layers.low,
    aerosolOpticalDepth,
  };
}

function emptyOutlook(note: string): FireCloudOutlook {
  return {
    possibility: null,
    possibilityLabel: "未知",
    vividness: null,
    vividnessLabel: "未知",
    cloudCover: null,
    cloudNote: note,
    cloudHigh: null,
    cloudMid: null,
    cloudLow: null,
    aerosolOpticalDepth: null,
  };
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
      basis: validWindow && records.length > 0 ? basis : [],
      missingFields: !validWindow
        ? ["sunEvent"]
        : records.length === 0
        ? []
        : missingFields,
      forecastWindow: validWindow ? forecastWindow : null,
      scoreMode: "UNAVAILABLE",
      summary: `${reason}，无法评估${eventName}火烧云环境潜力。`,
      direction,
      outlook: emptyOutlook("窗口前后缺少云量数据，无法判断可能性与鲜艳度。"),
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
  ) layerGate *= 0.7;
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
      0.66,
      0.44 * completeness * freshness * (0.8 + 0.2 * windowCoverage),
    ),
    2,
  );
  const score = round(weightedScore * cloudGate * layerGate);
  const hasLayers = values.cloudHigh !== null || values.cloudMid !== null ||
    values.cloudLow !== null;
  const hasAerosol = values.aerosolOpticalDepth !== null;
  const dataNote = hasLayers && hasAerosol
    ? "已纳入高中低云分层与气溶胶数据"
    : hasLayers
    ? "已纳入高中低云分层，但缺少气溶胶数据"
    : hasAerosol
    ? "含气溶胶数据，但缺少高中低云分层"
    : "缺少高中低云分层与气溶胶数据";
  const notes = [dataNote];
  if (lowCloud !== null && lowCloud >= 55) {
    notes.push("低云遮挡明显，评分已下调");
  }
  if (
    (values.cloudHigh !== null || values.cloudMid !== null) &&
    screenCloud < 8
  ) {
    notes.push("中高云偏少，评分已下调");
  }
  if (values.aerosolOpticalDepth !== null && values.aerosolOpticalDepth > 0.5) {
    notes.push("气溶胶偏高，评分已下调");
  }
  const summary =
    `${eventName}火烧云环境潜力为${score}分，基于窗口前后约1小时的${records.length}条逐小时数据；` +
    `${notes.join("；")}，分数只表示环境条件，不代表火烧云出现概率。`;

  return {
    status: "OK",
    score,
    confidence,
    confidenceLevel: confidenceLevel(confidence),
    basis,
    missingFields,
    forecastWindow,
    scoreMode: missingFields.length ? "PARTIAL" : "FULL",
    summary,
    direction,
    outlook: outlook(
      score,
      cloudValue,
      values.visibility,
      values.humidity,
      values.precipitationProbability,
      {
        high: values.cloudHigh,
        mid: values.cloudMid,
        low: values.cloudLow,
      },
      values.aerosolOpticalDepth,
    ),
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
    missingFields: ["sunEvent"],
    forecastWindow: null,
    scoreMode: "UNAVAILABLE",
    summary,
    direction: kind === "dawn" ? "EAST" : "WEST",
    outlook: emptyOutlook("当日太阳事件不可用，无法判断可能性与鲜艳度。"),
  };
}
