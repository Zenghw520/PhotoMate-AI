import { computeSolar, solarPositionAt } from "../astronomy/solar.ts";
import type {
  HourlyWeather,
  LocationResult,
  SlotKind,
  SolarData,
  ThemeId,
  TimelineItem,
  TimelineWeather,
  TimeWindow,
} from "../shared/contracts.ts";
import { scoreTwilight } from "./scoring.ts";

const LOOKOUT_MS = 90 * 60 * 1000;
const DAY_MS = 86_400_000;
const OFFSET_MS = 8 * 60 * 60 * 1000;

interface Candidate extends TimeWindow {
  kind: SlotKind;
  label: string;
}

const BASE_SCORE: Record<SlotKind, number> = {
  DAWN: 76,
  SUNRISE: 86,
  MORNING_GOLDEN: 92,
  DAYTIME: 58,
  EVENING_GOLDEN: 92,
  SUNSET: 86,
  DUSK: 80,
  BLUE_HOUR: 80,
  NIGHT: 48,
};

const THEME_ADJUSTMENTS: Record<ThemeId, Partial<Record<SlotKind, number>>> = {
  PORTRAIT: {
    MORNING_GOLDEN: 6,
    EVENING_GOLDEN: 6,
    SUNRISE: 3,
    SUNSET: 3,
    DAYTIME: -10,
    NIGHT: -10,
  },
  LANDSCAPE: {
    DAWN: 6,
    SUNRISE: 6,
    SUNSET: 6,
    DUSK: 6,
    BLUE_HOUR: 5,
    NIGHT: 5,
    DAYTIME: -5,
  },
  ARCHITECTURE: {
    MORNING_GOLDEN: 3,
    EVENING_GOLDEN: 3,
    DAYTIME: 10,
    DUSK: 8,
    BLUE_HOUR: 10,
    NIGHT: 6,
  },
  STREET: {
    DAYTIME: 10,
    NIGHT: 8,
    MORNING_GOLDEN: 2,
    EVENING_GOLDEN: 2,
    DUSK: 4,
  },
  FOOD: {
    DAYTIME: 15,
    NIGHT: 5,
    DAWN: -20,
    SUNRISE: -15,
    SUNSET: -10,
    MORNING_GOLDEN: -5,
    EVENING_GOLDEN: -5,
  },
  NIGHT: {
    NIGHT: 42,
    DUSK: 15,
    BLUE_HOUR: 20,
    DAWN: 5,
    DAYTIME: -35,
    MORNING_GOLDEN: -20,
    EVENING_GOLDEN: -15,
  },
  TRAVEL: {
    DAYTIME: 8,
    SUNRISE: 5,
    SUNSET: 5,
    MORNING_GOLDEN: 4,
    EVENING_GOLDEN: 4,
    DUSK: 4,
  },
};

function clampScore(value: number): number {
  return Math.round(Math.min(100, Math.max(0, value)));
}

function time(value: string): number {
  return Date.parse(value);
}

function beforeNoon(window: TimeWindow, solarNoon: number): boolean {
  return (time(window.start) + time(window.end)) / 2 <= solarNoon;
}

function nextLocalDate(solarNoon: string): string {
  return new Date(time(solarNoon) + DAY_MS + OFFSET_MS).toISOString().slice(
    0,
    10,
  );
}

function createCandidates(
  location: LocationResult,
  solar: SolarData,
): Candidate[] {
  const candidates: Candidate[] = [];
  const noon = time(solar.solarNoon);
  const goldenHours = [...solar.goldenHours].sort((a, b) =>
    time(a.start) - time(b.start)
  );
  const blueHours = [...solar.blueHours].sort((a, b) =>
    time(a.start) - time(b.start)
  );
  const morningGolden = goldenHours.find((window) => beforeNoon(window, noon));
  const eveningGolden = [...goldenHours].reverse().find((window) =>
    !beforeNoon(window, noon)
  );
  const morningBlue = blueHours.find((window) => beforeNoon(window, noon));
  const eveningBlue = [...blueHours].reverse().find((window) =>
    !beforeNoon(window, noon)
  );
  const sunrise = solar.sunrise ? time(solar.sunrise) : null;
  const sunset = solar.sunset ? time(solar.sunset) : null;
  const add = (
    kind: SlotKind,
    label: string,
    start: string | null,
    end: string | null,
  ) => {
    if (
      !start || !end || !Number.isFinite(time(start)) ||
      !Number.isFinite(time(end)) || time(start) >= time(end)
    ) return;
    candidates.push({ kind, label, start, end });
  };

  if (morningBlue) add("DAWN", "朝霞蓝调", morningBlue.start, morningBlue.end);
  if (morningGolden) {
    if (
      sunrise !== null && sunrise > time(morningGolden.start) &&
      sunrise < time(morningGolden.end)
    ) {
      add("SUNRISE", "日出窗口", morningGolden.start, solar.sunrise);
      add("MORNING_GOLDEN", "早晨黄金时刻", solar.sunrise, morningGolden.end);
    } else {
      add(
        "MORNING_GOLDEN",
        "早晨黄金时刻",
        morningGolden.start,
        morningGolden.end,
      );
    }
  }

  const daytimeStart = morningGolden?.end ?? solar.sunrise ??
    morningBlue?.end ?? null;
  const daytimeEnd = eveningGolden?.start ?? solar.sunset ??
    eveningBlue?.start ?? null;
  add("DAYTIME", "白天", daytimeStart, daytimeEnd);

  if (eveningGolden) {
    if (
      sunset !== null && sunset > time(eveningGolden.start) &&
      sunset < time(eveningGolden.end)
    ) {
      add("EVENING_GOLDEN", "傍晚黄金时刻", eveningGolden.start, solar.sunset);
      add("SUNSET", "日落暮光", solar.sunset, eveningGolden.end);
    } else {
      add(
        "EVENING_GOLDEN",
        "傍晚黄金时刻",
        eveningGolden.start,
        eveningGolden.end,
      );
    }
  }
  if (eveningBlue) add("DUSK", "晚霞蓝调", eveningBlue.start, eveningBlue.end);

  if (eveningBlue) {
    const nextSolar = computeSolar(
      location.latitude,
      location.longitude,
      nextLocalDate(solar.solarNoon),
    );
    const nextNoon = time(nextSolar.solarNoon);
    const nextMorningBlue = nextSolar.blueHours.find((window) =>
      beforeNoon(window, nextNoon)
    );
    if (nextMorningBlue) {
      add("NIGHT", "夜间", eveningBlue.end, nextMorningBlue.start);
    }
  }

  candidates.sort((a, b) =>
    time(a.start) - time(b.start) || time(a.end) - time(b.end)
  );
  const nonOverlapping: Candidate[] = [];
  for (const candidate of candidates) {
    const previous = nonOverlapping.at(-1);
    const start = previous && time(candidate.start) < time(previous.end)
      ? previous.end
      : candidate.start;
    if (time(start) < time(candidate.end)) {
      nonOverlapping.push({ ...candidate, start });
    }
  }
  return nonOverlapping;
}

function timelineWeather(entry: HourlyWeather): TimelineWeather {
  return {
    condition: entry.condition,
    cloud: entry.cloud,
    precipitationProbability: entry.precipitationProbability,
    windSpeed: entry.windSpeed,
    visibility: entry.visibility,
  };
}

function weatherRisks(weather: TimelineWeather | null): string[] {
  if (!weather) {
    return ["缺少窗口附近的天气覆盖，实际云量、降水和能见度仍不确定"];
  }
  const risks: string[] = [];
  if ((weather.precipitationProbability ?? 0) >= 50) {
    risks.push("降水概率较高，需准备防雨并关注临场变化");
  }
  if ((weather.windSpeed ?? 0) >= 8) {
    risks.push("风速较高，注意脚架稳定与拍摄安全");
  }
  if (weather.visibility !== null && weather.visibility < 5000) {
    risks.push("能见度偏低，远景层次可能受限");
  }
  if ((weather.cloud ?? 0) >= 90) risks.push("云量很高，太阳与霞光可能被遮挡");
  return risks;
}

export function buildTimeline(
  location: LocationResult,
  solar: SolarData,
  hourly: HourlyWeather[],
  theme: ThemeId,
  now: Date = new Date(),
): TimelineItem[] {
  const nowMs = now.getTime();
  return createCandidates(location, solar).map((candidate) => {
    const start = time(candidate.start);
    const end = time(candidate.end);
    const midpoint = (start + end) / 2;
    const position = solarPositionAt(
      location.latitude,
      location.longitude,
      new Date(midpoint),
    );
    const nearby = hourly.filter((entry) => {
      const timestamp = time(entry.time);
      return Number.isFinite(timestamp) && timestamp >= start - LOOKOUT_MS &&
        timestamp <= end + LOOKOUT_MS;
    });
    const nearest = nearby.length
      ? nearby.reduce((best, entry) =>
        Math.abs(time(entry.time) - midpoint) <
            Math.abs(time(best.time) - midpoint)
          ? entry
          : best
      )
      : null;
    const potential = scoreTwilight(
      midpoint <= time(solar.solarNoon) ? "dawn" : "dusk",
      { start: candidate.start, end: candidate.end },
      hourly,
      now,
      now,
    );
    const themeScore = clampScore(
      BASE_SCORE[candidate.kind] +
        (THEME_ADJUSTMENTS[theme][candidate.kind] ?? 0),
    );
    const hasWeatherScore = potential.score !== null;
    const score = hasWeatherScore
      ? clampScore(themeScore * 0.45 + potential.score! * 0.55)
      : themeScore;
    const reasons = [
      `窗口中点太阳高度约${position.elevation.toFixed(1)}°，方位约${
        position.azimuth.toFixed(0)
      }°`,
      `主题适配分为${themeScore}分，分数用于窗口排序，不是出片概率`,
    ];
    if (hasWeatherScore) {
      reasons.push(
        `结合窗口前后90分钟内的真实逐小时天气，天气潜力为${potential.score}分`,
      );
      if (potential.scoreMode === "PARTIAL") {
        reasons.push("部分天气字段缺失，已按剩余权重归一化");
      }
    } else {
      reasons.push(
        "窗口前后90分钟内无可用云量与天气覆盖，评分仅依据太阳时段和主题适配",
      );
    }
    const slotDate = candidate.start.slice(0, 10);
    return {
      slotId: `${slotDate}-${candidate.kind.toLowerCase()}`,
      start: candidate.start,
      end: candidate.end,
      kind: candidate.kind,
      label: candidate.label,
      score,
      scoreMode: hasWeatherScore ? "FULL" : "ASTRO_ONLY",
      solar: position,
      weather: nearest ? timelineWeather(nearest) : null,
      isPast: end <= nowMs,
      reasons,
      risks: weatherRisks(nearest ? timelineWeather(nearest) : null),
    };
  });
}
