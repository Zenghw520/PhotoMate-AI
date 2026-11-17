import type {
  LocationInput,
  LocationResult,
  PhotographyPlan,
  PotentialScore,
  ThemeId,
  TimeWindow,
  TodayResponse,
  WeatherData,
} from "../shared/contracts.ts";
import { computeSolar } from "../astronomy/solar.ts";
import { getOpenMeteo } from "../providers/openmeteo.ts";
import { getOpenWeather } from "../providers/openweather.ts";
import { getMetNorway } from "../providers/metno.ts";
import { mergeWeather } from "../providers/merge.ts";
import { getQWeather } from "../providers/qweather.ts";
import { enhancePlans } from "../providers/deepseek.ts";
import {
  cacheFreshness,
  coordinateGrid,
  createCacheStore,
  makeCacheKey,
} from "./cache.ts";
import type { DatabaseClient } from "./cache.ts";
import { buildRulePlans } from "./planner.ts";
import { scoreTwilight } from "./scoring.ts";
import { scoreFireCloud, unavailableFireCloud } from "./firecloud.ts";
import {
  type DayJournal,
  journalHasPastHours,
  mergeDayJournal,
  mergeHourlyForScoring,
} from "./day_journal.ts";
import { buildTimeline } from "./timeline.ts";
import { buildPhotographyIndices } from "./indices.ts";
import { buildWeatherAlerts } from "./weather_alerts.ts";
import { claimAiUsage } from "./usage.ts";

function shanghaiDate(now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${value.year}-${value.month}-${value.day}`;
}

function isWeatherData(value: unknown): value is WeatherData {
  if (!value || typeof value !== "object") return false;
  const weather = value as Partial<WeatherData>;
  return typeof weather.status === "string" && Array.isArray(weather.hourly) &&
    Array.isArray(weather.sources) && Array.isArray(weather.missingFields);
}

function withForecastTime(weather: WeatherData, at: Date): WeatherData {
  if (!weather.forecastUpdatedAt && weather.hourly.length === 0) return weather;
  return {
    ...weather,
    forecastUpdatedAt: weather.forecastUpdatedAt ?? at.toISOString(),
  };
}

async function loadWeather(
  location: LocationInput,
  db: DatabaseClient | undefined,
  now: Date,
) {
  const cache = createCacheStore(db);
  const key = await makeCacheKey("weather", "merged:v7", {
    latitude: coordinateGrid(location.latitude).toFixed(3),
    longitude: coordinateGrid(location.longitude).toFixed(3),
  });
  const cached = await cache.get(key);
  const cachedWeather = cached && isWeatherData(cached.payload)
    ? cached.payload
    : null;
  if (cached && cachedWeather && cacheFreshness(cached, now) === "FRESH") {
    return {
      weather: withForecastTime(
        { ...cachedWeather, status: "OK" as const },
        new Date(cachedWeather.forecastUpdatedAt ?? cached.fetchedAt),
      ),
      fetchedAt: new Date(cached.fetchedAt),
    };
  }

  const [qweather, openWeather, openMeteo, metNorway] = await Promise.all([
    getQWeather(location.latitude, location.longitude),
    getOpenWeather(location.latitude, location.longitude),
    getOpenMeteo(location.latitude, location.longitude),
    getMetNorway(location.latitude, location.longitude),
  ]);
  const fresh = withForecastTime(
    mergeWeather(qweather, openWeather, openMeteo, metNorway),
    now,
  );
  if (fresh.status === "OK") {
    const criticalMissing = fresh.missingFields.some((field) =>
      !field.startsWith("hourly.") ||
      /\.(cloud|temperature|humidity|precipitationProbability|windSpeed)$/
        .test(field)
    );
    await cache.set(
      key,
      "weather",
      fresh,
      fresh.current?.observedAt ?? null,
      criticalMissing
        ? 30
        : fresh.missingFields.length === 0
        ? 10 * 60
        : 5 * 60,
    );
    return { weather: fresh, fetchedAt: now };
  }
  if (cached && cachedWeather && cacheFreshness(cached, now) === "STALE") {
    return {
      weather: withForecastTime({
        ...cachedWeather,
        status: "STALE" as const,
        message: "实时更新暂时失败，当前展示短时真实缓存，评分置信度已降低。",
      }, new Date(cachedWeather.forecastUpdatedAt ?? cached.fetchedAt)),
      fetchedAt: new Date(cached.fetchedAt),
    };
  }
  return { weather: fresh, fetchedAt: now };
}

function eventWindow(event: string | null): TimeWindow | null {
  if (!event) return null;
  const midpoint = Date.parse(event);
  if (!Number.isFinite(midpoint)) return null;
  const start = new Date(midpoint - 45 * 60 * 1000);
  const end = new Date(midpoint + 45 * 60 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
}

function isPastWindow(window: TimeWindow | null, now: Date): boolean {
  return Boolean(window && Date.parse(window.end) < now.getTime());
}

function unavailablePotential(summary: string): PotentialScore {
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
  };
}

function dailyLimit() {
  const configured = Number(Deno.env.get("AI_DAILY_LIMIT") ?? "120");
  return Number.isInteger(configured) && configured >= 1 && configured <= 200
    ? configured
    : 40;
}

async function plansWithEnhancement(
  location: LocationResult,
  theme: ThemeId,
  timeline: TodayResponse["timeline"],
  rulePlans: PhotographyPlan[],
  usageDate: string,
  db: DatabaseClient | undefined,
  skipAi = false,
) {
  if (skipAi) {
    return {
      mode: "RULE_BASED" as const,
      aiStatus: "DISABLED" as const,
      items: rulePlans,
    };
  }
  if (!rulePlans.length) {
    return {
      mode: "RULE_BASED" as const,
      aiStatus: "DISABLED" as const,
      items: rulePlans,
    };
  }
  if (!Deno.env.get("DEEPSEEK_API_KEY")?.trim()) {
    return {
      mode: "RULE_BASED" as const,
      aiStatus: "DISABLED" as const,
      items: rulePlans,
    };
  }
  const claimed = await claimAiUsage(db, usageDate, dailyLimit());
  if (!claimed) {
    return {
      mode: "RULE_BASED" as const,
      aiStatus: "LIMIT_REACHED" as const,
      items: rulePlans,
    };
  }
  const enhanced = await enhancePlans({
    location,
    theme,
    timeline,
    plans: rulePlans,
  });
  return {
    mode: enhanced.status === "SUCCESS"
      ? "AI_ENHANCED" as const
      : "RULE_BASED" as const,
    aiStatus: enhanced.status,
    items: enhanced.plans,
  };
}

export async function getTodayPhotography(
  locationInput: LocationInput,
  theme: ThemeId,
  db?: DatabaseClient,
  now = new Date(),
  dateOverride?: string,
  skipAi = false,
): Promise<TodayResponse> {
  const today = shanghaiDate(now);
  const date = dateOverride ?? today;
  const location: LocationResult = {
    ...locationInput,
    timezone: "Asia/Shanghai",
  };
  const solar = computeSolar(location.latitude, location.longitude, date);
  const { weather, fetchedAt } = await loadWeather(location, db, now);
  let targetJournal: DayJournal | null = null;
  if (weather.hourly.length > 0) {
    const journalDates = [
      ...new Set(weather.hourly.map((entry) => entry.time.slice(0, 10))),
    ];
    for (const journalDate of journalDates) {
      const merged = await mergeDayJournal(
        db,
        location,
        journalDate,
        weather.hourly,
        now,
      );
      if (journalDate === date) targetJournal = merged;
    }
  }
  const scoringHourly = mergeHourlyForScoring(
    weather.hourly,
    targetJournal,
    now,
  );
  const journalCreatedAt =
    targetJournal && journalHasPastHours(targetJournal, now) &&
      Number.isFinite(Date.parse(targetJournal.createdAt))
      ? new Date(targetJournal.createdAt)
      : fetchedAt;
  const dawnWindow = eventWindow(solar.sunrise);
  const duskWindow = eventWindow(solar.sunset);
  const dawnFetchedAt = isPastWindow(dawnWindow, now)
    ? journalCreatedAt
    : fetchedAt;
  const duskFetchedAt = isPastWindow(duskWindow, now)
    ? journalCreatedAt
    : fetchedAt;
  const potential = {
    dawn: dawnWindow
      ? scoreTwilight("dawn", dawnWindow, scoringHourly, dawnFetchedAt, now)
      : unavailablePotential("当天日出事件不可用，无法评估朝霞潜力。"),
    dusk: duskWindow
      ? scoreTwilight("dusk", duskWindow, scoringHourly, duskFetchedAt, now)
      : unavailablePotential("当天日落事件不可用，无法评估晚霞潜力。"),
  };
  const fireCloud = {
    dawn: dawnWindow
      ? scoreFireCloud("dawn", dawnWindow, scoringHourly, dawnFetchedAt, now)
      : unavailableFireCloud(
        "dawn",
        "当天日出事件不可用，无法评估日出火烧云环境潜力。",
      ),
    dusk: duskWindow
      ? scoreFireCloud("dusk", duskWindow, scoringHourly, duskFetchedAt, now)
      : unavailableFireCloud(
        "dusk",
        "当天日落事件不可用，无法评估日落火烧云环境潜力。",
      ),
  };
  const timeline = buildTimeline(
    location,
    solar,
    scoringHourly,
    theme,
    now,
  );
  const alerts = buildWeatherAlerts(scoringHourly, timeline, date, now);
  const indices = buildPhotographyIndices({
    landscape: timeline,
    portrait: buildTimeline(location, solar, scoringHourly, "PORTRAIT", now),
    urban: buildTimeline(location, solar, scoringHourly, "STREET", now),
    night: buildTimeline(location, solar, scoringHourly, "NIGHT", now),
    potential,
    weather: { ...weather, hourly: scoringHourly },
  });
  const rulePlans = buildRulePlans(timeline, theme, location);
  const plans = await plansWithEnhancement(
    location,
    theme,
    timeline,
    rulePlans,
    today,
    db,
    skipAi,
  );
  const warnings: string[] = [];
  if (weather.status === "UNCONFIGURED") {
    warnings.push(
      "天气服务尚未配置，当前仅展示真实天文结果与规则建议，不对霞光作无依据评分。",
    );
  }
  if (weather.status === "UNAVAILABLE") {
    warnings.push("真实天气暂不可用，霞光与环境评分已暂停，天文时间仍可参考。");
  }
  if (weather.status === "STALE") {
    warnings.push("天气来自短时真实缓存，观测时间和数据状态已在页面标注。");
  }
  const pastReused = date === today &&
    journalHasPastHours(targetJournal, now) &&
    ((isPastWindow(dawnWindow, now) &&
      (potential.dawn.score !== null || fireCloud.dawn.score !== null)) ||
      (isPastWindow(duskWindow, now) &&
        (potential.dusk.score !== null || fireCloud.dusk.score !== null)));
  if (pastReused) {
    warnings.push(
      "今日已过时段的评分使用站点当日留存的逐小时天气回算，可能与当时显示存在差异。",
    );
  }
  if (
    date !== today && weather.hourly.length > 0 &&
    !weather.hourly.some((entry) => entry.time.slice(0, 10) === date)
  ) {
    warnings.push(
      "所选日期的逐小时预报覆盖不足，霞光评分暂停；天文时间仍可参考。",
    );
  }
  if (location.precision === "DISTRICT") {
    warnings.push(
      "搜索结果为区县中心，具体机位与遮挡以现场为准。",
    );
  }
  if (location.precision === "GPS") {
    warnings.push(
      "GPS 为设备坐标，具体机位与遮挡以现场为准。",
    );
  }
  if (plans.aiStatus === "DISABLED" && rulePlans.length) {
    warnings.push("DeepSeek 未启用，当前展示可解释的规则建议。");
  }
  if (plans.aiStatus === "LIMIT_REACHED") {
    warnings.push("今日公共 AI 体验额度已用完，已自动切换为完整规则建议。");
  }
  if (
    plans.aiStatus === "UNAVAILABLE" || plans.aiStatus === "INVALID_RESPONSE"
  ) warnings.push("AI 表达增强暂不可用，已回退为经过事实校验的规则建议。");

  return {
    generatedAt: now.toISOString(),
    date,
    timezone: "Asia/Shanghai",
    location,
    weather,
    solar,
    indices,
    potential,
    fireCloud,
    timeline,
    alerts,
    plans,
    warnings,
  };
}
