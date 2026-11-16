import type {
  CustomPlan,
  CustomPlanRequest,
  CustomPlansResponse,
} from "../shared/contracts.ts";
import { secretValue } from "../shared/env.ts";
import {
  type CustomPlansInput,
  generateCustomPlans,
} from "../providers/deepseek.ts";
import type { DatabaseClient } from "./cache.ts";
import { getTodayPhotography } from "./today.ts";
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

function dailyLimit() {
  const configured = Number(Deno.env.get("AI_DAILY_LIMIT") ?? "120");
  return Number.isInteger(configured) && configured >= 1 && configured <= 200
    ? configured
    : 40;
}

function visibilityText(value: number | null) {
  return value === null ? "—" : `${(value / 1000).toFixed(1)}km`;
}

export async function generateCustomPlanResponse(
  input: CustomPlanRequest,
  db?: DatabaseClient,
  now = new Date(),
): Promise<CustomPlansResponse> {
  const context = await getTodayPhotography(
    input.location,
    input.theme,
    db,
    now,
    input.date,
    true,
  );
  const future = context.timeline.filter((slot) => !slot.isPast);
  const candidates = future.slice(0, 8);
  const current = context.weather.current;
  const isToday = context.date === shanghaiDate(now);
  const firstWeather = candidates[0]?.weather ?? null;
  const weatherSummary = isToday && current
    ? `${current.condition || "天气未知"} ${
      current.temperature ?? "—"
    }°C · 云量 ${current.cloud ?? "—"}% · 能见度 ${
      visibilityText(current.visibility)
    } · ${current.windDirection || ""} ${current.windSpeed ?? "—"}km/h`
    : firstWeather
    ? `所选日期逐小时天气：${firstWeather.condition} · 云量 ${
      firstWeather.cloud ?? "—"
    }% · 降水概率 ${firstWeather.precipitationProbability ?? "—"}%`
    : "所选日期暂无可用逐小时天气。";

  const weatherForAi = isToday && current
    ? {
      status: context.weather.status,
      condition: current.condition || null,
      temperature: current.temperature,
      cloud: current.cloud,
      humidity: current.humidity,
      windSpeed: current.windSpeed,
      visibility: current.visibility,
    }
    : null;

  const aiInput: CustomPlansInput = {
    subject: input.subject,
    theme: input.theme,
    location: {
      name: context.location.name,
      latitude: context.location.latitude,
      longitude: context.location.longitude,
    },
    date: context.date,
    weather: weatherForAi,
    slots: candidates.map((slot) => ({
      slotId: slot.slotId,
      label: slot.label,
      start: slot.start,
      end: slot.end,
      score: slot.score,
      scoreMode: slot.scoreMode,
      solar: slot.solar,
      weather: slot.weather,
    })),
  };

  let aiStatus: CustomPlansResponse["aiStatus"] = "DISABLED";
  let summary = "";
  let aiPlans: Awaited<ReturnType<typeof generateCustomPlans>>["plans"] = [];

  if (candidates.length === 0) {
    summary = "所选日期没有可用的未来光线窗口，暂时无法生成拍摄方案。";
  } else if (secretValue("DEEPSEEK_API_KEY")) {
    const claimed = await claimAiUsage(db, shanghaiDate(now), dailyLimit());
    if (!claimed) {
      aiStatus = "LIMIT_REACHED";
    } else {
      const ai = await generateCustomPlans(aiInput);
      aiStatus = ai.status;
      if (ai.status === "SUCCESS") {
        summary = ai.summary ?? "";
        aiPlans = ai.plans;
      }
    }
  }

  const slotMap = new Map(context.timeline.map((slot) => [slot.slotId, slot]));
  let plans: CustomPlan[] = aiPlans.flatMap((plan) => {
    const slot = slotMap.get(plan.slotId);
    if (!slot) return [];
    return [{
      slotId: plan.slotId,
      title: plan.title,
      timeWindow: { start: slot.start, end: slot.end },
      subjectApproach: plan.subjectApproach,
      composition: plan.composition,
      cameraSettings: plan.cameraSettings,
      lightAnalysis: plan.lightAnalysis,
      risks: plan.risks,
      solar: slot.solar,
      weather: slot.weather,
    }];
  });

  if (plans.length === 0) {
    const fallbackSlots = [...candidates]
      .sort((left, right) => (right.score ?? -1) - (left.score ?? -1))
      .slice(0, 2);
    plans = fallbackSlots.map((slot) => ({
      slotId: slot.slotId,
      title: `围绕「${input.subject}」的${slot.label}`,
      timeWindow: { start: slot.start, end: slot.end },
      subjectApproach:
        `先确认「${input.subject}」在画面中的位置与可用前景，不预设未核实的机位；结合现场环境调整主体与背景关系。`,
      composition:
        "利用现场可用的线条、前景或重复元素组织画面，保持主体与背景的层次；最终构图需结合现场确认。",
      cameraSettings:
        "先从 f/5.6、1/125s、自动白平衡开始，按现场测光与主体运动调整。",
      lightAnalysis: `该窗口太阳方位约 ${
        Math.round(slot.solar.azimuth)
      }°，高度约 ${slot.solar.elevation.toFixed(1)}°；${
        slot.weather
          ? `天气 ${slot.weather.condition}，云量 ${
            slot.weather.cloud ?? "—"
          }%。`
          : "该窗口缺少逐小时天气，光线判断以现场为准。"
      }`,
      risks: slot.risks.length
        ? slot.risks
        : ["具体机位、遮挡与通行条件需现场确认"],
      solar: slot.solar,
      weather: slot.weather,
    }));
    if (!summary) {
      summary = aiStatus === "LIMIT_REACHED"
        ? "今日 AI 体验额度已用完，以下为结合真实天气与太阳窗口的规则建议。"
        : "AI 暂不可用，以下为结合真实天气与太阳窗口的规则建议。";
    }
  }

  const warnings: string[] = [];
  if (context.weather.status === "UNCONFIGURED") {
    warnings.push("天气服务尚未配置，自定义方案只依据太阳窗口生成。");
  }
  if (context.weather.status === "UNAVAILABLE") {
    warnings.push("真实天气暂不可用，自定义方案只依据太阳窗口生成。");
  }
  if (context.location.precision === "DISTRICT") {
    warnings.push("位置为区县行政中心近似坐标，具体机位需现场确认。");
  }
  if (aiStatus !== "SUCCESS") {
    warnings.push("AI 未生成自定义方案，已回退为规则建议。");
  }

  return {
    generatedAt: now.toISOString(),
    date: context.date,
    location: context.location,
    weatherSummary,
    summary,
    plans,
    aiStatus,
    warnings,
  };
}
