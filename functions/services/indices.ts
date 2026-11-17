import type {
  HourlyWeather,
  PhotographyIndexEntry,
  PhotographyIndices,
  PotentialScore,
  ScoreBasis,
  TimelineItem,
  WeatherData,
} from "../shared/contracts.ts";

type IndexId = PhotographyIndexEntry["id"];
type PeriodId = Exclude<IndexId, "DAWN" | "DUSK">;
type FactorKey =
  | "window"
  | "cloud"
  | "clearSky"
  | "cloudStructure"
  | "lowCloud"
  | "visibility"
  | "precipitationProbability"
  | "precipitation"
  | "windSpeed"
  | "humidity"
  | "aerosolOpticalDepth";

interface ThemeConfig {
  label: string;
  kinds: TimelineItem["kind"][];
  weights: Partial<Record<FactorKey, number>>;
}

const THEMES: Record<PeriodId, ThemeConfig> = {
  LANDSCAPE: {
    label: "风光摄影",
    kinds: [
      "DAWN",
      "SUNRISE",
      "MORNING_GOLDEN",
      "EVENING_GOLDEN",
      "SUNSET",
      "DUSK",
    ],
    weights: {
      window: 20,
      cloud: 10,
      cloudStructure: 10,
      lowCloud: 10,
      visibility: 20,
      precipitationProbability: 10,
      precipitation: 5,
      windSpeed: 5,
      humidity: 5,
      aerosolOpticalDepth: 5,
    },
  },
  PORTRAIT: {
    label: "人像摄影",
    kinds: ["SUNRISE", "MORNING_GOLDEN", "EVENING_GOLDEN", "SUNSET", "DUSK"],
    weights: {
      window: 25,
      cloud: 20,
      cloudStructure: 5,
      lowCloud: 10,
      visibility: 10,
      precipitationProbability: 15,
      precipitation: 5,
      windSpeed: 5,
      humidity: 5,
    },
  },
  URBAN: {
    label: "建筑摄影",
    kinds: ["DAYTIME", "EVENING_GOLDEN", "SUNSET", "DUSK", "NIGHT"],
    weights: {
      window: 20,
      cloud: 5,
      cloudStructure: 5,
      lowCloud: 5,
      visibility: 20,
      precipitationProbability: 10,
      precipitation: 5,
      windSpeed: 20,
      humidity: 5,
      aerosolOpticalDepth: 5,
    },
  },
  NIGHT: {
    label: "夜景摄影",
    kinds: ["DUSK", "NIGHT"],
    weights: {
      window: 15,
      clearSky: 20,
      lowCloud: 10,
      visibility: 20,
      precipitationProbability: 10,
      precipitation: 5,
      windSpeed: 15,
      humidity: 5,
    },
  },
  ASTRONOMY: {
    label: "星空摄影",
    kinds: ["NIGHT"],
    weights: {
      window: 15,
      clearSky: 25,
      lowCloud: 10,
      visibility: 25,
      precipitationProbability: 10,
      humidity: 5,
      aerosolOpticalDepth: 10,
    },
  },
};

const FACTOR_LABELS: Record<
  FactorKey,
  { label: string; unit: string; explanation: string }
> = {
  window: {
    label: "光线窗口基准",
    unit: "分",
    explanation: "由太阳时段与题材适配计算，只用于窗口排序",
  },
  cloud: {
    label: "总云量",
    unit: "%",
    explanation: "适度云层能柔化光线并提供层次，过厚或过少都会削弱表现",
  },
  clearSky: {
    label: "晴空程度",
    unit: "%",
    explanation: "夜间云量越低，星空与夜景灯光越清晰",
  },
  cloudStructure: {
    label: "高云 + 中云",
    unit: "%",
    explanation: "中高云承接低角度光，是霞光与层次的重要载体",
  },
  lowCloud: {
    label: "低云量",
    unit: "%",
    explanation: "低云会遮挡太阳和远景，越高越不利于拍摄",
  },
  visibility: {
    label: "能见度",
    unit: "m",
    explanation: "能见度越高，远景层次与大气通透度越好",
  },
  precipitationProbability: {
    label: "降水概率",
    unit: "%",
    explanation: "降水概率越低，拍摄窗口越可靠",
  },
  precipitation: {
    label: "小时降水量",
    unit: "mm",
    explanation: "降水会直接影响镜头、设备和行程安全",
  },
  windSpeed: {
    label: "风速",
    unit: "m/s",
    explanation: "风速越低，脚架与长曝光越稳定",
  },
  humidity: {
    label: "相对湿度",
    unit: "%",
    explanation: "湿度过高会增加水汽、结露与消光风险",
  },
  aerosolOpticalDepth: {
    label: "气溶胶光学厚度",
    unit: "",
    explanation: "气溶胶越高，远景与星空越容易被消光",
  },
};

const METRICS: Record<Exclude<FactorKey, "window">, (value: number) => number> =
  {
    cloud: (value) => {
      if (value < 5) return 30;
      if (value < 20) return 60;
      if (value <= 70) return 95;
      if (value <= 85) return 70;
      return 40;
    },
    clearSky: (value) => value,
    cloudStructure: (value) => {
      if (value < 5) return 45;
      if (value < 20) return 75;
      if (value <= 70) return 100;
      if (value <= 85) return 70;
      return 40;
    },
    lowCloud: (value) => {
      if (value <= 20) return 100;
      if (value <= 40) return 85;
      if (value <= 60) return 60;
      if (value <= 80) return 35;
      return 15;
    },
    visibility: (value) => {
      if (value >= 20_000) return 100;
      if (value >= 10_000) return 85;
      if (value >= 5_000) return 60;
      if (value >= 2_000) return 30;
      return 10;
    },
    precipitationProbability: (value) => Math.max(0, 100 - value),
    precipitation: (value) => Math.max(0, 100 - value * 25),
    windSpeed: (value) => {
      if (value <= 3) return 100;
      if (value <= 6) return 85;
      if (value <= 9) return 60;
      return 30;
    },
    humidity: (value) => {
      if (value < 35) return 70;
      if (value <= 75) return 100;
      if (value <= 88) return 70;
      return 35;
    },
    aerosolOpticalDepth: (value) => {
      if (value <= 0.15) return 100;
      if (value <= 0.3) return 85;
      if (value <= 0.5) return 65;
      if (value <= 0.8) return 40;
      return 20;
    },
  };

const OVERALL_WEIGHTS: Record<IndexId, number> = {
  LANDSCAPE: 0.2,
  PORTRAIT: 0.12,
  URBAN: 0.14,
  NIGHT: 0.14,
  ASTRONOMY: 0.15,
  DAWN: 0.13,
  DUSK: 0.12,
};

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value * 10) / 10));
}

function round(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function average(values: number[]): number | null {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;
}

function scoreNote(score: number | null, fallback: string): string {
  if (score === null) return fallback;
  if (score >= 70) return "条件适合";
  if (score >= 45) return "条件一般";
  return "条件偏弱";
}

function confidenceLabel(value: PhotographyIndexEntry["confidence"]) {
  if (value === "HIGH") return "置信度较高";
  if (value === "MEDIUM") return "置信度中等";
  return "置信度较低";
}

function periodItems(items: TimelineItem[], kinds: TimelineItem["kind"][]) {
  return items.filter((item) => kinds.includes(item.kind));
}

function windowRecords(items: TimelineItem[], hourly: HourlyWeather[]) {
  const seen = new Set<string>();
  const records: HourlyWeather[] = [];
  for (const item of items) {
    const start = Date.parse(item.start) - 30 * 60_000;
    const end = Date.parse(item.end) + 30 * 60_000;
    for (const entry of hourly) {
      const time = Date.parse(entry.time);
      if (!Number.isFinite(time) || time < start || time > end) continue;
      if (seen.has(entry.time)) continue;
      seen.add(entry.time);
      records.push(entry);
    }
  }
  return records;
}

function windowLabel(items: TimelineItem[]) {
  if (items.length === 0) return "缺少可用光线窗口";
  const labels = [...new Set(items.map((item) => item.label))];
  return labels.length <= 3
    ? labels.join("、")
    : `${labels.slice(0, 3).join("、")} 等 ${items.length} 个时段`;
}

function factorValue(
  key: FactorKey,
  records: HourlyWeather[],
  windowScore: number | null,
): { value: number | null; missing: string[] } {
  if (key === "window") {
    return {
      value: windowScore,
      missing: windowScore === null ? ["lightWindow"] : [],
    };
  }
  if (key === "cloudStructure") {
    const high = average(
      records.map((entry) => entry.cloudHigh).filter((value): value is number =>
        typeof value === "number" && Number.isFinite(value)
      ),
    );
    const mid = average(
      records.map((entry) => entry.cloudMid).filter((value): value is number =>
        typeof value === "number" && Number.isFinite(value)
      ),
    );
    const missing: string[] = [];
    if (high === null) missing.push("cloudHigh");
    if (mid === null) missing.push("cloudMid");
    return {
      value: high === null || mid === null ? null : Math.min(100, high + mid),
      missing,
    };
  }
  const source: keyof HourlyWeather = key === "clearSky"
    ? "cloud"
    : key === "lowCloud"
    ? "cloudLow"
    : key;
  const value = average(
    records.map((entry) => entry[source]).filter((value): value is number =>
      typeof value === "number" && Number.isFinite(value)
    ),
  );
  if (value === null) {
    return { value: null, missing: [source] };
  }
  return {
    value: key === "clearSky" ? 100 - value : value,
    missing: [],
  };
}

function scorePeriod(
  id: PeriodId,
  timeline: TimelineItem[],
  hourly: HourlyWeather[],
  weatherUsable: boolean,
): PhotographyIndexEntry {
  const config = THEMES[id];
  const items = periodItems(timeline, config.kinds);
  const scores = items.map((item) => item.score).filter(
    (score): score is number => score !== null,
  );
  const windowScore = average(scores);
  const records = windowRecords(items, hourly);
  const factorKeys = Object.keys(config.weights) as FactorKey[];
  const totalWeight = factorKeys.reduce(
    (sum, key) => sum + (config.weights[key] ?? 0),
    0,
  );

  if (items.length === 0) {
    return {
      id,
      label: config.label,
      score: null,
      note: "所选日期缺少该题材可用的太阳光线窗口",
      confidence: "LOW",
      status: "UNAVAILABLE",
      windowLabel: windowLabel(items),
      basis: [],
      missingFields: ["lightWindow"],
    };
  }

  const values = new Map<
    FactorKey,
    { value: number | null; missing: string[] }
  >();
  const missing = new Set<string>();
  for (const key of factorKeys) {
    const result = factorValue(key, records, windowScore);
    values.set(key, result);
    for (const field of result.missing) missing.add(field);
  }

  let availableWeight = 0;
  let weighted = 0;
  const basis: ScoreBasis[] = factorKeys.map((key) => {
    const result = values.get(key)!;
    const weight = config.weights[key] ?? 0;
    const label = FACTOR_LABELS[key];
    let contribution: number | null = null;
    if (result.value !== null) {
      availableWeight += weight;
      if (key === "window") {
        contribution = result.value * weight;
        weighted += contribution;
      } else {
        contribution = METRICS[key](result.value) * weight;
        weighted += contribution;
      }
    }
    return {
      code: key,
      label: label.label,
      value: result.value === null ? null : round(result.value),
      unit: label.unit,
      contribution: null,
      explanation: result.value === null
        ? "所选时段没有该字段的真实逐小时数据"
        : label.explanation,
    };
  });

  if (availableWeight === 0) {
    return {
      id,
      label: config.label,
      score: null,
      note: "所选时段缺少真实天气和光线评分",
      confidence: "LOW",
      status: "UNAVAILABLE",
      windowLabel: windowLabel(items),
      basis,
      missingFields: [...missing],
    };
  }

  const weatherAvailableWeight = factorKeys
    .filter((key) => key !== "window" && values.get(key)!.value !== null)
    .reduce((sum, key) => sum + (config.weights[key] ?? 0), 0);
  if (records.length === 0 || weatherAvailableWeight === 0) {
    return {
      id,
      label: config.label,
      score: null,
      note: records.length === 0
        ? "所选时段没有真实逐小时天气，未给出摄影天气评分"
        : "所选时段天气字段全部缺失，未给出摄影天气评分",
      confidence: "LOW",
      status: "UNAVAILABLE",
      windowLabel: windowLabel(items),
      basis,
      missingFields: [...missing],
    };
  }

  for (const item of basis) {
    const raw = values.get(item.code as FactorKey)?.value;
    const weight = config.weights[item.code as FactorKey] ?? 0;
    if (raw === null || raw === undefined) continue;
    const normalized = item.code === "window"
      ? raw
      : METRICS[item.code as Exclude<FactorKey, "window">](raw);
    item.contribution = round(normalized * weight / availableWeight);
  }
  const score = clampScore(weighted / availableWeight);
  const completeness = availableWeight / totalWeight;
  const confidence: PhotographyIndexEntry["confidence"] = !weatherUsable
    ? "LOW"
    : completeness >= 0.85 && records.length >= 3
    ? "HIGH"
    : completeness >= 0.5
    ? "MEDIUM"
    : "LOW";
  const status: PhotographyIndexEntry["status"] = missing.size > 0
    ? "PARTIAL"
    : "OK";

  return {
    id,
    label: config.label,
    score,
    note: `${scoreNote(score, "数据不足")} · ${items.length} 个时段 · ${
      confidenceLabel(confidence)
    }`,
    confidence,
    status,
    windowLabel: windowLabel(items),
    basis,
    missingFields: [...missing],
  };
}

function twilightEntry(
  id: "DAWN" | "DUSK",
  potential: PotentialScore,
): PhotographyIndexEntry {
  const label = id === "DAWN" ? "朝霞摄影" : "晚霞摄影";
  if (potential.score === null) {
    return {
      id,
      label,
      score: null,
      note: potential.summary || "朝晚霞数据不足",
      confidence: potential.confidenceLevel,
      status: "UNAVAILABLE",
      windowLabel: potential.forecastWindow
        ? `${id === "DAWN" ? "日出" : "日落"}前后约 45 分钟`
        : "太阳事件窗口不可用",
      basis: potential.basis,
      missingFields: potential.missingFields,
    };
  }
  return {
    id,
    label,
    score: potential.score,
    note: `${scoreNote(potential.score, "数据不足")} · ${
      confidenceLabel(potential.confidenceLevel)
    }`,
    confidence: potential.confidenceLevel,
    status: potential.scoreMode === "PARTIAL" ? "PARTIAL" : "OK",
    windowLabel: potential.forecastWindow
      ? `${id === "DAWN" ? "日出" : "日落"}前后约 45 分钟`
      : "太阳事件窗口不可用",
    basis: potential.basis,
    missingFields: potential.missingFields,
  };
}

export function buildPhotographyIndices(input: {
  landscape: TimelineItem[];
  portrait: TimelineItem[];
  urban: TimelineItem[];
  night: TimelineItem[];
  potential: { dawn: PotentialScore; dusk: PotentialScore };
  weather: WeatherData;
}): PhotographyIndices {
  const weatherUsable = input.weather.status === "OK" ||
    input.weather.status === "STALE";
  const entries: PhotographyIndexEntry[] = [
    scorePeriod(
      "LANDSCAPE",
      input.landscape,
      input.weather.hourly,
      weatherUsable,
    ),
    scorePeriod(
      "PORTRAIT",
      input.portrait,
      input.weather.hourly,
      weatherUsable,
    ),
    scorePeriod("URBAN", input.urban, input.weather.hourly, weatherUsable),
    scorePeriod("NIGHT", input.night, input.weather.hourly, weatherUsable),
    scorePeriod(
      "ASTRONOMY",
      input.night,
      input.weather.hourly,
      weatherUsable,
    ),
    twilightEntry("DAWN", input.potential.dawn),
    twilightEntry("DUSK", input.potential.dusk),
  ];

  const available = entries.filter((entry) => entry.score !== null) as Array<
    PhotographyIndexEntry & { score: number }
  >;
  let weighted = 0;
  let weightTotal = 0;
  for (const entry of available) {
    weighted += entry.score * OVERALL_WEIGHTS[entry.id];
    weightTotal += OVERALL_WEIGHTS[entry.id];
  }
  const overall = weightTotal > 0 ? clampScore(weighted / weightTotal) : null;
  const confidence: PhotographyIndices["confidence"] = !weatherUsable ||
      available.length < 4
    ? "LOW"
    : available.length >= 6 && input.weather.status === "OK"
    ? "HIGH"
    : "MEDIUM";

  const basis = [
    "七个题材各自使用独立权重，分成光线窗口、云层结构、能见度、降水、风速、湿度与气溶胶等因子。",
    "每个题材的分数由所选日期真实逐小时天气计算，展开“评分依据”可核对每个因子的数值与贡献。",
    "朝霞与晚霞采用不同的气象权重，并直接展示日出/日落窗口的逐小时数据。",
    "缺少字段时按剩余权重归一化并标注；不会用模拟值补齐。",
  ];
  if (input.weather.status === "STALE") {
    basis.push("天气来自短时真实缓存，指数置信度已降低。");
  }
  if (!weatherUsable) {
    basis.push("天气暂不可用，依赖天气的题材指数已降级或暂停。");
  }
  if (available.length < entries.length) {
    basis.push("部分题材缺少可用时段或评分，未参与综合加权。");
  }

  const trend = input.landscape
    .filter((item) => item.score !== null)
    .map((item) => ({
      time: item.start,
      label: item.label,
      score: item.score,
    }));

  return { overall, confidence, entries, trend, basis };
}
