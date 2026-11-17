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
import { buildCameraParameters, buildPlanSchedule } from "./plan_details.ts";

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
    equipment: input.equipment ?? null,
    preferences: input.preferences ?? null,
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
    const details = buildPlanSchedule(input.subject, slot, input.equipment);
    return [{
      slotId: plan.slotId,
      title: plan.title,
      timeWindow: { start: slot.start, end: slot.end },
      arrivalTime: details.arrivalTime,
      schedule: details.schedule,
      cameraParameters: plan.cameraParameters ??
        buildCameraParameters(
          input.subject,
          slot,
          input.equipment,
        ),
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
    plans = fallbackSlots.map((slot) => {
      const details = buildPlanSchedule(input.subject, slot, input.equipment);
      return {
        slotId: slot.slotId,
        title: `围绕「${input.subject}」的${slot.label}`,
        timeWindow: { start: slot.start, end: slot.end },
        arrivalTime: details.arrivalTime,
        schedule: details.schedule,
        cameraParameters: buildCameraParameters(
          input.subject,
          slot,
          input.equipment,
        ),
        subjectApproach:
          `先确认「${input.subject}」在画面中的位置与可用前景，再结合现场环境调整主体与背景关系。`,
        composition:
          "利用现场可用的线条、前景或重复元素组织画面，保持主体与背景的层次。",
        cameraSettings:
          "先从 f/5.6、1/125s、自动白平衡开始，按现场测光与主体运动调整。",
        lightAnalysis: `该窗口太阳方位约 ${
          Math.round(slot.solar.azimuth)
        }°，高度约 ${slot.solar.elevation.toFixed(1)}°；${
          slot.weather
            ? `天气 ${slot.weather.condition}，云量 ${
              slot.weather.cloud ?? "—"
            }%。`
            : "该窗口缺少逐小时天气，按现场光线判断。"
        }`,
        risks: slot.risks.length ? slot.risks : ["现场确认机位与通行条件"],
        solar: slot.solar,
        weather: slot.weather,
      };
    });
    if (!summary) {
      summary = aiStatus === "LIMIT_REACHED"
        ? "今日体验额度已用完，以下为结合天气与太阳窗口的规则建议。"
        : "以下为结合天气与太阳窗口的规则建议。";
    }
  }

  const warnings: string[] = [];
  if (context.weather.status === "UNCONFIGURED") {
    warnings.push("天气服务尚未配置，方案依据太阳窗口生成。");
  }
  if (context.weather.status === "UNAVAILABLE") {
    warnings.push("天气暂不可用，方案依据太阳窗口生成。");
  }
  if (context.location.precision === "DISTRICT") {
    warnings.push("位置为区县中心，具体机位以现场为准。");
  }
  if (aiStatus !== "SUCCESS") {
    warnings.push("当前使用规则建议。");
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
