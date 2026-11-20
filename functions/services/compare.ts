import type {
  CompareItemInput,
  CompareItemResult,
  CompareRequest,
  CompareResponse,
  CompareWindow,
  HourlyWeather,
  LocationResult,
  SlotKind,
  TimelineItem,
  TimeWindow,
} from "../shared/contracts.ts";
import type { DatabaseClient } from "./cache.ts";
import { getTodayPhotography } from "./today.ts";

const DIRECTIONS = ["北", "东北", "东", "东南", "南", "西南", "西", "西北"];

function directionName(degrees: number) {
  return DIRECTIONS[Math.round((((degrees % 360) + 360) % 360) / 45) % 8];
}

function pickWindow(
  timeline: TimelineItem[],
  slotKind: SlotKind | null | undefined,
): TimelineItem | null {
  const usable = timeline.filter((item) => !item.isPast);
  const pool = usable.length ? usable : timeline;
  if (slotKind) {
    const exact = pool.find((item) => item.kind === slotKind);
    if (exact) return exact;
  }
  return [...pool].sort((left, right) =>
    (right.score ?? -1) - (left.score ?? -1)
  )[0] ?? null;
}

function hoursInWindow(hourly: HourlyWeather[], window: TimeWindow) {
  const start = Date.parse(window.start) - 15 * 60_000;
  const end = Date.parse(window.end) + 15 * 60_000;
  return hourly.filter((entry) => {
    const time = Date.parse(entry.time);
    return Number.isFinite(time) && time >= start && time <= end;
  });
}

function maxOf(values: Array<number | null | undefined>) {
  const numbers = values.filter((value): value is number =>
    typeof value === "number" && Number.isFinite(value)
  );
  return numbers.length ? Math.max(...numbers) : null;
}

function minOf(values: Array<number | null | undefined>) {
  const numbers = values.filter((value): value is number =>
    typeof value === "number" && Number.isFinite(value)
  );
  return numbers.length ? Math.min(...numbers) : null;
}

function avgOf(values: Array<number | null | undefined>) {
  const numbers = values.filter((value): value is number =>
    typeof value === "number" && Number.isFinite(value)
  );
  return numbers.length
    ? numbers.reduce((sum, value) => sum + value, 0) / numbers.length
    : null;
}

function confidenceOf(
  context: Awaited<ReturnType<typeof getTodayPhotography>>,
  slot: TimelineItem,
  coveredHours: number,
): "LOW" | "MEDIUM" | "HIGH" {
  if (coveredHours === 0) return "LOW";
  const noon = Date.parse(context.solar.solarNoon);
  const dawn = Date.parse(slot.start) < noon;
  const potential = dawn ? context.potential.dawn : context.potential.dusk;
  if (potential.scoreMode === "UNAVAILABLE") return "LOW";
  return potential.confidenceLevel;
}

async function buildItem(
  input: CompareItemInput,
  theme: CompareRequest["theme"],
  slotKind: SlotKind | undefined,
  db: DatabaseClient | undefined,
  now: Date,
): Promise<CompareItemResult> {
  const context = await getTodayPhotography(
    input.location,
    theme,
    db,
    now,
    input.date,
    true,
  );
  const slot = pickWindow(context.timeline, slotKind);
  if (!slot) {
    return {
      label: input.label ?? context.location.name,
      date: context.date,
      location: context.location as LocationResult,
      window: null,
      warnings: ["该日期没有可用的光线窗口。"],
    };
  }
  const hours = hoursInWindow(context.weather.hourly, slot);
  const coveredHours = hours.length;
  const start = Date.parse(slot.start);
  const end = Date.parse(slot.end);
  // 逐小时预报通常整点；用窗口内可对齐的小时数估算覆盖率。
  const totalHours = Math.max(1, Math.round((end - start) / 3_600_000));
  const precipitation = hours
    .map((entry) => entry.precipitation)
    .filter((value): value is number => value !== null);
  const azimuth = ((slot.solar.azimuth % 360) + 360) % 360;
  const window: CompareWindow = {
    slotId: slot.slotId,
    kind: slot.kind,
    label: slot.label,
    start: slot.start,
    end: slot.end,
    arrivalTime: new Date(start - 40 * 60_000).toISOString(),
    score: slot.score,
    confidence: confidenceOf(context, slot, coveredHours),
    precipitationProbability: maxOf(
      hours.map((entry) => entry.precipitationProbability),
    ),
    precipitation: precipitation.length
      ? precipitation.reduce((sum, value) => sum + value, 0)
      : null,
    windGust: maxOf(hours.map((entry) => entry.windGust)),
    visibility: minOf(hours.map((entry) => entry.visibility)),
    cloud: avgOf(hours.map((entry) => entry.cloud)),
    cloudHigh: avgOf(hours.map((entry) => entry.cloudHigh)),
    cloudMid: avgOf(hours.map((entry) => entry.cloudMid)),
    cloudLow: avgOf(hours.map((entry) => entry.cloudLow)),
    cameraAzimuth: azimuth,
    cameraDirection: `面朝${directionName(azimuth)} ${Math.round(azimuth)}°`,
    coveredHours,
    totalHours,
    partial: coveredHours === 0 || coveredHours < totalHours,
  };
  const warnings: string[] = [];
  if (coveredHours === 0) {
    warnings.push("窗口没有逐小时预报覆盖，仅保留天文窗口。");
  } else if (window.partial) {
    warnings.push(
      `窗口内仅 ${coveredHours} 个预报点覆盖，比较结果按实际覆盖时段计算。`,
    );
  }
  return {
    label: input.label ?? context.location.name,
    date: context.date,
    location: context.location as LocationResult,
    window,
    warnings,
  };
}

function scoreOf(window: CompareWindow | null) {
  if (!window) return -1;
  const rainPenalty = (window.precipitationProbability ?? 0) * 0.25;
  const gustPenalty = Math.max(0, (window.windGust ?? 0) - 6) * 3;
  const visibilityBonus = window.visibility === null
    ? 0
    : Math.min(6, window.visibility / 4000);
  return (window.score ?? 0) - rainPenalty - gustPenalty + visibilityBonus;
}

export async function compareWindows(
  input: CompareRequest,
  db?: DatabaseClient,
  now = new Date(),
): Promise<CompareResponse> {
  const items = await Promise.all(
    input.items.map((item) =>
      buildItem(item, input.theme, input.slotKind, db, now)
    ),
  );
  const eligible = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.window && item.window.coveredHours > 0);
  let bestIndex: number | null = null;
  let reason = "没有足够覆盖的预报窗口，暂无法判断哪一项更好。";
  if (eligible.length > 0) {
    const best = eligible.reduce((current, candidate) =>
      scoreOf(candidate.item.window) > scoreOf(current.item.window)
        ? candidate
        : current
    );
    bestIndex = best.index;
    const window = best.item.window!;
    const others = eligible.filter(({ index }) => index !== best.index);
    const comparison = others.slice(0, 2).map(({ item }) => {
      const other = item.window!;
      const differences: string[] = [];
      if (
        (other.precipitationProbability ?? 0) >
          (window.precipitationProbability ?? 0)
      ) {
        differences.push(
          `降水概率更高（${Math.round(other.precipitationProbability ?? 0)}%）`,
        );
      }
      if ((other.windGust ?? 0) > (window.windGust ?? 0)) {
        differences.push(`阵风更大（${(other.windGust ?? 0).toFixed(1)} m/s）`);
      }
      if ((other.score ?? 0) < (window.score ?? 0)) {
        differences.push(`窗口评分 ${Math.round(other.score ?? 0)} 分`);
      }
      if (other.confidence === "LOW" && window.confidence !== "LOW") {
        differences.push("置信度更低");
      }
      return `${item.label}${
        differences.length ? `：${differences.join("、")}` : "：条件接近"
      }`;
    });
    reason = `${best.item.label} 更合适：${window.label} 评分 ${
      window.score === null ? "—" : Math.round(window.score)
    } 分，降水概率 ${
      window.precipitationProbability === null
        ? "暂无数据"
        : `${Math.round(window.precipitationProbability)}%`
    }，阵风 ${
      window.windGust === null
        ? "暂无数据"
        : `${window.windGust.toFixed(1)} m/s`
    }${comparison.length ? `；${comparison.join("；")}` : ""}。`;
  }
  const warnings = [
    "仅比较预报实际覆盖的时段；没有覆盖的窗口会标注，并排除出推荐。",
  ];
  if (input.items.length < 2) warnings.push("至少需要两项才能比较。");
  return {
    generatedAt: now.toISOString(),
    theme: input.theme,
    slotKind: input.slotKind ?? null,
    items,
    bestIndex,
    reason,
    warnings,
  };
}
