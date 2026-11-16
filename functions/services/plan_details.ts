import type {
  CameraParameters,
  PlanScheduleItem,
  TimelineItem,
} from "../shared/contracts.ts";

const DIRECTIONS = ["北", "东北", "东", "东南", "南", "西南", "西", "西北"];

function direction(degrees: number) {
  return DIRECTIONS[Math.round((((degrees % 360) + 360) % 360) / 45) % 8];
}

function offsetTime(iso: string, minutes: number) {
  return new Date(Date.parse(iso) + minutes * 60_000).toISOString();
}

type Scene =
  | "ASTRO"
  | "NIGHT"
  | "PORTRAIT"
  | "MACRO"
  | "STREET"
  | "URBAN"
  | "LANDSCAPE"
  | "GENERAL";

function detectScene(subject: string): Scene {
  const text = subject.toLowerCase();
  if (/银河|星空|星轨|星野|流星/.test(text)) return "ASTRO";
  if (/夜景|车轨|灯光|夜拍/.test(text)) return "NIGHT";
  if (/人像|人物|模特|肖像|cosplay/.test(text)) return "PORTRAIT";
  if (/花卉|微距|特写|美食|静物|昆虫/.test(text)) return "MACRO";
  if (/街头|街拍|人文|纪实/.test(text)) return "STREET";
  if (/建筑|城市|天际线|车流|地标/.test(text)) return "URBAN";
  if (/日落|日出|朝霞|晚霞|海|山|风光|云海|湖|草原|沙漠/.test(text)) {
    return "LANDSCAPE";
  }
  return "GENERAL";
}

export function buildCameraParameters(
  subject: string,
  slot: TimelineItem,
  equipment: string | undefined,
): CameraParameters {
  const scene = detectScene(subject);
  const gear = equipment ?? "";
  const tripod = /三脚架|脚架|tripod/i.test(gear);
  const phone = /手机|iphone|android|华为|小米|vivo|oppo/i.test(gear);
  const drone = /无人机|drone|mavic|air 3|mini/i.test(gear);
  const lowLight = slot.kind === "NIGHT" || slot.kind === "BLUE_HOUR" ||
    slot.solar.elevation < 5;

  if (phone) {
    return {
      iso: scene === "ASTRO" ? "1600–3200（手机长曝光）" : "自动，尽量 ≤800",
      aperture: "手机固定光圈（不可调）",
      shutter: scene === "ASTRO"
        ? "15–30s（需稳定支撑）"
        : lowLight
        ? "1/15–1/30s，优先稳定"
        : "1/60–1/250s",
      focalLength: scene === "PORTRAIT"
        ? "2× 或 3× 长焦（等效 50–80mm）"
        : "主摄等效 24–28mm",
      exposureBias: scene === "PORTRAIT" ? "+0.3 EV" : "-0.3 至 -0.7 EV",
      whiteBalance: lowLight ? "3800–4500K" : "自动",
      focusMode: "点击主体对焦并锁定",
    };
  }

  if (drone) {
    return {
      iso: lowLight ? "400–800" : "100–200",
      aperture: "f/2.8（固定）",
      shutter: lowLight ? "1/30–1/60s" : "1/120–1/320s",
      focalLength: "等效 24mm",
      exposureBias: "-0.3 EV",
      whiteBalance: "日光 / 自动",
      focusMode: "AF 连续对焦",
    };
  }

  if (scene === "ASTRO") {
    return {
      iso: "3200–6400",
      aperture: "f/1.8–f/2.8（尽量开大）",
      shutter: "15–25s（500 法则内）",
      focalLength: "14–24mm 超广角",
      exposureBias: "0 EV",
      whiteBalance: "3800–4200K",
      focusMode: tripod
        ? "手动对焦至无穷远（需三脚架）"
        : "手动对焦（必须使用三脚架）",
    };
  }
  if (scene === "NIGHT") {
    return {
      iso: tripod ? "200–800" : "1600–3200",
      aperture: "f/5.6–f/8",
      shutter: tripod ? "2–10s" : "1/30–1/60s",
      focalLength: "24–70mm",
      exposureBias: "-0.7 EV",
      whiteBalance: "3500–4500K",
      focusMode: tripod ? "手动对焦 + 快门线" : "单次对焦，注意高光",
    };
  }
  if (scene === "PORTRAIT") {
    return {
      iso: "100–400",
      aperture: "f/1.8–f/2.8",
      shutter: "1/200s 以上",
      focalLength: "50–85mm",
      exposureBias: "+0.3 EV",
      whiteBalance: "自动（保留肤色）",
      focusMode: "AF-C 眼部 / 人脸对焦",
    };
  }
  if (scene === "MACRO") {
    return {
      iso: "200–400",
      aperture: "f/5.6–f/8",
      shutter: "1/160s 以上",
      focalLength: "90–105mm 微距",
      exposureBias: "0 EV",
      whiteBalance: "自动",
      focusMode: "手动对焦 + 放大确认",
    };
  }
  if (scene === "STREET") {
    return {
      iso: "400–800",
      aperture: "f/5.6–f/8",
      shutter: "1/250s 以上",
      focalLength: "28–50mm",
      exposureBias: "0 EV",
      whiteBalance: "自动",
      focusMode: "AF-C 连续对焦",
    };
  }
  if (scene === "URBAN") {
    return {
      iso: "100–400",
      aperture: "f/8–f/11",
      shutter: lowLight ? "1/60–1/125s" : "1/125–1/250s",
      focalLength: "24–70mm",
      exposureBias: "-0.3 EV",
      whiteBalance: lowLight ? "3800–4500K" : "自动",
      focusMode: "AF-S 对焦主要立面",
    };
  }
  if (scene === "LANDSCAPE") {
    return {
      iso: "100",
      aperture: "f/8–f/11",
      shutter: tripod
        ? "1/15–1s（三脚架）"
        : lowLight
        ? "1/30–1/60s"
        : "1/60–1/125s",
      focalLength: "16–35mm",
      exposureBias: "-0.3 至 -0.7 EV",
      whiteBalance: lowLight ? "4000–5000K" : "日光 5500K",
      focusMode: "AF-S 对焦远景，必要时手动",
    };
  }
  return {
    iso: "100–400",
    aperture: "f/5.6–f/8",
    shutter: "1/125s 左右",
    focalLength: "24–70mm",
    exposureBias: "0 EV",
    whiteBalance: "自动",
    focusMode: "AF-S 单次对焦",
  };
}

export function buildPlanSchedule(
  subject: string,
  slot: TimelineItem,
  equipment: string | undefined,
): { arrivalTime: string; schedule: PlanScheduleItem[] } {
  const scene = detectScene(subject);
  const gear = equipment ?? "";
  const tripod = /三脚架|脚架|tripod/i.test(gear);
  const weather = slot.weather;
  const weatherNote = weather
    ? `${weather.condition}，云量 ${weather.cloud ?? "—"}%，降水概率 ${
      weather.precipitationProbability ?? "—"
    }%`
    : "该窗口缺少逐小时天气，以现场观察为准";
  const start = slot.start;
  const end = slot.end;
  const midpoint = new Date(
    (Date.parse(start) + Date.parse(end)) / 2,
  ).toISOString();
  const sunNote = `太阳方位 ${Math.round(slot.solar.azimuth)}°（${
    direction(slot.solar.azimuth)
  }），高度 ${slot.solar.elevation.toFixed(1)}°`;
  const rainRisk = (weather?.precipitationProbability ?? 0) >= 50;
  const shotTip = scene === "ASTRO"
    ? "先用高 ISO 试拍确认银河位置，再降低噪点"
    : scene === "PORTRAIT"
    ? "先锁定人物眼部，再调整背景与光线"
    : scene === "NIGHT"
    ? "优先保证高光不过曝，车轨与灯光分开测光"
    : scene === "MACRO"
    ? "先放大确认焦平面，再微调构图"
    : scene === "STREET"
    ? "先确定背景与光线，再等待人物进入画面"
    : scene === "URBAN"
    ? "先校正水平与透视，再等待天空和灯光"
    : "先完成测光，保留高光与天空层次";
  return {
    arrivalTime: offsetTime(start, -45),
    schedule: [
      {
        time: offsetTime(start, -45),
        label: "提前到达",
        action:
          `到达并确认「${subject}」所需前景、安全站位与通行条件；查看${sunNote}。`,
      },
      {
        time: offsetTime(start, -20),
        label: "机位与构图",
        action: `完成机位与构图，按方案检查主体和背景；${
          tripod ? "架设三脚架并关闭防抖。" : "确认手持稳定性与快门余量。"
        }`,
      },
      {
        time: start,
        label: "窗口开始",
        action: `开始拍摄：${shotTip}。${weatherNote}。`,
      },
      {
        time: midpoint,
        label: "光线峰值",
        action: `光线进入窗口核心阶段，优先保证高光细节；${
          scene === "LANDSCAPE" ? "尝试不同前景与焦距" : "补拍关键构图与细节"
        }。`,
      },
      {
        time: end,
        label: "窗口结束",
        action: `光线窗口结束；${
          rainRisk ? "留意降水并保护器材，" : ""
        }检查直方图与焦点，必要时补拍。`,
      },
      {
        time: offsetTime(end, 20),
        label: "收尾复拍",
        action: scene === "NIGHT" || scene === "ASTRO"
          ? "进入更暗环境，可继续尝试夜景或星空参数；整理素材后撤离。"
          : "天空色彩仍可能变化，补拍蓝调或环境光收尾后撤离。",
      },
    ],
  };
}
