import type {
  PhotographyIndexEntry,
  PhotographyIndices,
  PotentialScore,
  TimelineItem,
  WeatherData,
} from "../shared/contracts.ts";

const WEIGHTS: Record<PhotographyIndexEntry["id"], number> = {
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

function scoreNote(score: number | null, fallback: string): string {
  if (score === null) return fallback;
  if (score >= 70) return "条件适合";
  if (score >= 45) return "条件一般";
  return "条件偏弱";
}

function averageScores(
  items: TimelineItem[],
  kinds: TimelineItem["kind"][],
): { score: number | null; count: number } {
  const scores = items
    .filter((item) => kinds.includes(item.kind))
    .map((item) => item.score)
    .filter((score): score is number => score !== null);
  return {
    score: scores.length
      ? clampScore(
        scores.reduce((sum, score) => sum + score, 0) / scores.length,
      )
      : null,
    count: scores.length,
  };
}

function nightWeatherAdjustment(
  nightItems: TimelineItem[],
  weather: WeatherData,
): { delta: number; note: string } {
  const windows = nightItems.filter((item) => item.kind === "NIGHT");
  if (windows.length === 0) {
    return { delta: 0, note: "缺少夜间窗口，星空指数未作云量修正" };
  }
  const clouds: number[] = [];
  const visibilities: number[] = [];
  for (const entry of weather.hourly) {
    const time = Date.parse(entry.time);
    const inside = windows.some((window) =>
      time >= Date.parse(window.start) && time <= Date.parse(window.end)
    );
    if (!inside) continue;
    if (entry.cloud !== null) clouds.push(entry.cloud);
    if (entry.visibility !== null) visibilities.push(entry.visibility);
  }
  const average = (values: number[]) =>
    values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : null;
  const cloud = average(clouds);
  const visibility = average(visibilities);
  if (cloud === null) {
    return { delta: 0, note: "夜间云量缺失，星空指数未作云量修正" };
  }
  let delta = cloud >= 80 ? -25 : cloud >= 60 ? -12 : cloud <= 20 ? 5 : 0;
  if (visibility !== null && visibility < 10_000) delta -= 8;
  return {
    delta,
    note: `夜间平均云量 ${Math.round(cloud)}%，星空指数${
      delta === 0 ? "未作修正" : `修正 ${delta > 0 ? "+" : ""}${delta} 分`
    }`,
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
  const landscape = averageScores(input.landscape, [
    "DAWN",
    "SUNRISE",
    "MORNING_GOLDEN",
    "EVENING_GOLDEN",
    "SUNSET",
    "DUSK",
  ]);
  const portrait = averageScores(input.portrait, [
    "SUNRISE",
    "MORNING_GOLDEN",
    "EVENING_GOLDEN",
    "SUNSET",
    "DUSK",
  ]);
  const urban = averageScores(input.urban, [
    "DAYTIME",
    "EVENING_GOLDEN",
    "SUNSET",
    "BLUE_HOUR",
    "NIGHT",
  ]);
  const night = averageScores(input.night, [
    "DUSK",
    "BLUE_HOUR",
    "NIGHT",
  ]);
  const astronomyBase = averageScores(input.night, ["NIGHT"]);
  const astronomyAdjustment = nightWeatherAdjustment(
    input.night,
    input.weather,
  );
  const astronomy = astronomyBase.score === null
    ? null
    : clampScore(astronomyBase.score + astronomyAdjustment.delta);

  const entries: PhotographyIndexEntry[] = [
    {
      id: "LANDSCAPE",
      label: "风光摄影",
      score: landscape.score,
      note: `${
        scoreNote(landscape.score, "缺少可用光线窗口")
      } · ${landscape.count} 个时段`,
    },
    {
      id: "PORTRAIT",
      label: "人像摄影",
      score: portrait.score,
      note: `${
        scoreNote(portrait.score, "缺少可用光线窗口")
      } · ${portrait.count} 个时段`,
    },
    {
      id: "URBAN",
      label: "城市与街拍",
      score: urban.score,
      note: `${
        scoreNote(urban.score, "缺少可用光线窗口")
      } · ${urban.count} 个时段`,
    },
    {
      id: "NIGHT",
      label: "夜景摄影",
      score: night.score,
      note: `${scoreNote(night.score, "缺少夜间窗口")} · ${night.count} 个时段`,
    },
    {
      id: "ASTRONOMY",
      label: "星空摄影",
      score: astronomy,
      note: astronomyAdjustment.note,
    },
    {
      id: "DAWN",
      label: "朝霞摄影",
      score: input.potential.dawn.score,
      note: `${scoreNote(input.potential.dawn.score, "朝霞数据不足")} · ${
        input.potential.dawn.confidenceLevel === "HIGH"
          ? "置信度较高"
          : input.potential.dawn.confidenceLevel === "MEDIUM"
          ? "置信度中等"
          : "置信度较低"
      }`,
    },
    {
      id: "DUSK",
      label: "晚霞摄影",
      score: input.potential.dusk.score,
      note: `${scoreNote(input.potential.dusk.score, "晚霞数据不足")} · ${
        input.potential.dusk.confidenceLevel === "HIGH"
          ? "置信度较高"
          : input.potential.dusk.confidenceLevel === "MEDIUM"
          ? "置信度中等"
          : "置信度较低"
      }`,
    },
  ];

  const available = entries.filter((entry) => entry.score !== null) as Array<
    PhotographyIndexEntry & { score: number }
  >;
  let weighted = 0;
  let weightTotal = 0;
  for (const entry of available) {
    weighted += entry.score * WEIGHTS[entry.id];
    weightTotal += WEIGHTS[entry.id];
  }
  const overall = weightTotal > 0 ? clampScore(weighted / weightTotal) : null;
  const weatherUsable = input.weather.status === "OK" ||
    input.weather.status === "STALE";
  const confidence: PhotographyIndices["confidence"] = !weatherUsable ||
      available.length < 4
    ? "LOW"
    : available.length >= 6 && input.weather.status === "OK"
    ? "HIGH"
    : "MEDIUM";

  const basis = [
    "综合指数按风光、人像、城市、夜景、星空、朝霞、晚霞的可用评分加权。",
    "题材评分来自当天真实逐小时天气与本地天文窗口，不是固定模板。",
    "星空指数按夜间平均云量与能见度修正。",
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
