import { PHOTO_SUBJECT_LABELS, PHOTO_SUBJECTS } from "../shared/contracts.ts";
import type {
  CameraParameters,
  LocationResult,
  PhotoExif,
  PhotographyPlan,
  PhotoScene,
  PhotoSignals,
  PhotoStats,
  PhotoSubject,
  ThemeId,
  TimelineItem,
} from "../shared/contracts.ts";
import { secretValue } from "../shared/env.ts";
import { fetchTrustedJson, ProviderHttpError } from "./http.ts";
import { PHOTO_SCENE_SKILL } from "./photo_scene_skill.ts";

const BASE_URL = "https://api.deepseek.com";
const HOSTS = ["deepseek.com"] as const;
const TEXT_FIELDS = [
  "composition",
  "viewpoint",
  "cameraAngle",
  "lightAnalysis",
] as const;
const ENTRY_KEYS = new Set(["slotId", ...TEXT_FIELDS]);

type TextField = typeof TEXT_FIELDS[number];
type Enhancement = Record<TextField, string>;

export interface EnhancePlansInput {
  theme: ThemeId;
  location: LocationResult;
  plans: PhotographyPlan[];
  timeline: TimelineItem[];
}

export interface EnhancePlansResult {
  status: "SUCCESS" | "DISABLED" | "UNAVAILABLE" | "INVALID_RESPONSE";
  plans: PhotographyPlan[];
}

const SYSTEM_PROMPT =
  `你是摄影文案编辑。输入是包含真实地点、时间线、天气与规则方案的紧凑 JSON。
只优化每个方案的 composition、viewpoint、cameraAngle、lightAnalysis 中文文案，不得创造或修改时间、天气、太阳方位、评分、风险、cameraSettings、locationNote、direction 或其他事实。
严格只输出一个 JSON 对象，不要 Markdown 或解释，格式为：
{"plans":[{"slotId":"输入中已存在的 slotId","composition":"...","viewpoint":"...","cameraAngle":"...","lightAnalysis":"..."}]}
必须覆盖每个输入方案且仅一次，五个字段都必须存在，不得增加字段。文案具体、简洁：先给结论，再给动作，每段 1–2 句；避免重复、免责声明和“不是……而是……”式表达。`;

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function validText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 &&
    value.length <= 2_000;
}

function parseEnhancements(
  content: string,
  expectedSlotIds: ReadonlySet<string>,
): Map<string, Enhancement> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }
  const root = record(parsed);
  if (!root || Object.keys(root).length !== 1 || !Array.isArray(root.plans)) {
    return null;
  }
  if (root.plans.length !== expectedSlotIds.size) return null;

  const enhancements = new Map<string, Enhancement>();
  for (const value of root.plans) {
    const entry = record(value);
    if (
      !entry || typeof entry.slotId !== "string" ||
      !expectedSlotIds.has(entry.slotId)
    ) return null;
    if (enhancements.has(entry.slotId)) return null;
    const keys = Object.keys(entry);
    if (
      keys.length !== ENTRY_KEYS.size ||
      keys.some((key) => !ENTRY_KEYS.has(key))
    ) return null;
    const enhancement = {} as Enhancement;
    for (const field of TEXT_FIELDS) {
      if (!validText(entry[field])) return null;
      enhancement[field] = entry[field].trim();
    }
    enhancements.set(entry.slotId, enhancement);
  }
  return enhancements.size === expectedSlotIds.size ? enhancements : null;
}

function fallback(
  status: EnhancePlansResult["status"],
  plans: PhotographyPlan[],
): EnhancePlansResult {
  return { status, plans };
}

export async function enhancePlans(
  input: EnhancePlansInput,
): Promise<EnhancePlansResult> {
  const apiKey = secretValue("DEEPSEEK_API_KEY");
  if (!apiKey) return fallback("DISABLED", input.plans);
  if (input.plans.length === 0) return fallback("SUCCESS", input.plans);

  const slotIds = new Set(input.plans.map((plan) => plan.slotId));
  if (slotIds.size !== input.plans.length) {
    return fallback("INVALID_RESPONSE", input.plans);
  }

  const model = Deno.env.get("DEEPSEEK_MODEL")?.trim() || "deepseek-chat";
  const compactInput = JSON.stringify({
    theme: input.theme,
    location: input.location,
    plans: input.plans,
    timeline: input.timeline,
  });
  try {
    const payload = await fetchTrustedJson<unknown>({
      baseUrl: BASE_URL,
      path: "/chat/completions",
      allowedHosts: HOSTS,
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: compactInput },
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
        max_tokens: Math.min(4_000, Math.max(800, input.plans.length * 500)),
        stream: false,
      }),
      timeoutMs: 15_000,
      maxResponseBytes: 256 * 1024,
      retries: 0,
    });
    const root = record(payload);
    const choices = root?.choices;
    const message = record(
      Array.isArray(choices) ? record(choices[0])?.message : null,
    );
    const content = message?.content;
    if (typeof content !== "string") {
      return fallback("INVALID_RESPONSE", input.plans);
    }
    const enhancements = parseEnhancements(content, slotIds);
    if (!enhancements) return fallback("INVALID_RESPONSE", input.plans);

    return {
      status: "SUCCESS",
      plans: input.plans.map((plan) => ({
        ...plan,
        ...enhancements.get(plan.slotId)!,
        aiEnhanced: true,
      })),
    };
  } catch (error) {
    if (error instanceof ProviderHttpError) {
      console.error(
        "deepseek_request_failed",
        error.code,
        error.status ?? "-",
      );
    }
    if (error instanceof ProviderHttpError && error.code === "INVALID_JSON") {
      return fallback("INVALID_RESPONSE", input.plans);
    }
    return fallback("UNAVAILABLE", input.plans);
  }
}

export interface PhotoSummaryInput {
  exifSummary: string[];
  issues: string[];
  suggestions: string[];
  stats: Record<string, number>;
  scene: { label: string; confidence: string; basis: string[] };
}

export interface PhotoSummaryResult {
  status: "SUCCESS" | "DISABLED" | "UNAVAILABLE" | "INVALID_RESPONSE";
  summary: string | null;
}

const PHOTO_SUMMARY_PROMPT =
  `你是摄影技术编辑。输入是浏览器从照片中提取的 EXIF、亮度/对比/饱和/清晰度统计、题材推断（含依据与置信度），以及规则引擎发现的问题与建议。
只输出 JSON：{"summary":"一到两句中文改进摘要，先给最重要的建议"}。
按推断的题材表述；只使用输入中的 EXIF、统计与规则结论，不新增数值。文案直接、自然，不写免责声明或对比句。`;

export async function summarizePhotoAnalysis(
  input: PhotoSummaryInput,
): Promise<PhotoSummaryResult> {
  const apiKey = secretValue("DEEPSEEK_API_KEY");
  if (!apiKey) return { status: "DISABLED", summary: null };
  const model = Deno.env.get("DEEPSEEK_MODEL")?.trim() || "deepseek-chat";
  try {
    const payload = await fetchTrustedJson<unknown>({
      baseUrl: BASE_URL,
      path: "/chat/completions",
      allowedHosts: HOSTS,
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: PHOTO_SUMMARY_PROMPT },
          { role: "user", content: JSON.stringify(input) },
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
        max_tokens: 400,
        stream: false,
      }),
      timeoutMs: 10_000,
      maxResponseBytes: 128 * 1024,
      retries: 0,
    });
    const root = record(payload);
    const choices = root?.choices;
    const message = record(
      Array.isArray(choices) ? record(choices[0])?.message : null,
    );
    const content = message?.content;
    if (typeof content !== "string") {
      return { status: "INVALID_RESPONSE", summary: null };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      return { status: "INVALID_RESPONSE", summary: null };
    }
    const result = record(parsed);
    const summary = result?.summary;
    if (
      !result || Object.keys(result).length !== 1 ||
      typeof summary !== "string" || summary.trim().length < 10 ||
      summary.length > 400
    ) {
      return { status: "INVALID_RESPONSE", summary: null };
    }
    return { status: "SUCCESS", summary: summary.trim() };
  } catch (error) {
    if (error instanceof ProviderHttpError) {
      console.error(
        "deepseek_photo_failed",
        error.code,
        error.status ?? "-",
      );
    }
    return {
      status: error instanceof ProviderHttpError &&
          error.code === "INVALID_JSON"
        ? "INVALID_RESPONSE"
        : "UNAVAILABLE",
      summary: null,
    };
  }
}

export interface CustomSlotInput {
  slotId: string;
  label: string;
  start: string;
  end: string;
  score: number | null;
  scoreMode: string;
  solar: { azimuth: number; elevation: number };
  weather: {
    condition: string;
    cloud: number | null;
    precipitationProbability: number | null;
    windSpeed: number | null;
    visibility: number | null;
  } | null;
}

export interface CustomPlansInput {
  subject: string;
  equipment?: string | null;
  preferences?: string | null;
  theme: ThemeId;
  location: { name: string; latitude: number; longitude: number };
  date: string;
  weather: {
    status: string;
    condition: string | null;
    temperature: number | null;
    cloud: number | null;
    humidity: number | null;
    windSpeed: number | null;
    visibility: number | null;
  } | null;
  slots: CustomSlotInput[];
}

export interface AiCustomPlan {
  slotId: string;
  title: string;
  subjectApproach: string;
  composition: string;
  cameraSettings: string;
  cameraParameters?: CameraParameters;
  lightAnalysis: string;
  risks: string[];
}

export interface CustomPlansResult {
  status: "SUCCESS" | "DISABLED" | "UNAVAILABLE" | "INVALID_RESPONSE";
  summary: string | null;
  plans: AiCustomPlan[];
}

const CUSTOM_PLANS_PROMPT =
  `你是摄影策划编辑。用户给出一个拍摄题材；输入同时包含真实日期、位置、天气、太阳方位与可用光线窗口。
只能使用输入中的时间、天气、太阳位置与窗口事实，不得编造或修改这些数据；不得声称已经看到现场。
只输出 JSON：
{"summary":"两到三句总体拍摄思路","plans":[{"slotId":"输入中已存在的 slotId","title":"...","subjectApproach":"...","composition":"...","cameraSettings":"...","cameraParameters":{"iso":"...","aperture":"...","shutter":"...","focalLength":"...","exposureBias":"...","whiteBalance":"...","focusMode":"..."},"lightAnalysis":"...","risks":["..."]}]}
要求：plans 为 2 到 3 个，slotId 必须来自输入且不重复；可用窗口少于 2 个时只输出 1 个方案。summary 一到两句；每个字段先结论后动作，1–2 句；构图与参数具体、简洁，以现场测光为准。cameraParameters 的七个字段给出简短范围，并与 cameraSettings 保持一致；结合 equipment 与 preferences；risks 为 0 到 2 条，每条一句话。避免重复、免责声明和“不是……而是……”式表达。`;

function validShort(value: unknown, max = 1_000): value is string {
  return typeof value === "string" && value.trim().length > 0 &&
    value.length <= max;
}

const CAMERA_KEYS = [
  "iso",
  "aperture",
  "shutter",
  "focalLength",
  "exposureBias",
  "whiteBalance",
  "focusMode",
] as const;

function cameraParameters(value: unknown): CameraParameters | null {
  const entry = record(value);
  if (!entry) return null;
  for (const key of CAMERA_KEYS) {
    if (!validShort(entry[key], 80)) return null;
  }
  return {
    iso: (entry.iso as string).trim(),
    aperture: (entry.aperture as string).trim(),
    shutter: (entry.shutter as string).trim(),
    focalLength: (entry.focalLength as string).trim(),
    exposureBias: (entry.exposureBias as string).trim(),
    whiteBalance: (entry.whiteBalance as string).trim(),
    focusMode: (entry.focusMode as string).trim(),
  };
}

export async function generateCustomPlans(
  input: CustomPlansInput,
): Promise<CustomPlansResult> {
  const apiKey = secretValue("DEEPSEEK_API_KEY");
  if (!apiKey) return { status: "DISABLED", summary: null, plans: [] };
  const allowed = new Set(input.slots.map((slot) => slot.slotId));
  if (allowed.size === 0) {
    return { status: "DISABLED", summary: null, plans: [] };
  }
  const model = Deno.env.get("DEEPSEEK_MODEL")?.trim() || "deepseek-chat";
  try {
    const payload = await fetchTrustedJson<unknown>({
      baseUrl: BASE_URL,
      path: "/chat/completions",
      allowedHosts: HOSTS,
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: CUSTOM_PLANS_PROMPT },
          { role: "user", content: JSON.stringify(input) },
        ],
        response_format: { type: "json_object" },
        temperature: 0.4,
        max_tokens: 1_800,
        stream: false,
      }),
      timeoutMs: 15_000,
      maxResponseBytes: 256 * 1024,
      retries: 0,
    });
    const root = record(payload);
    const choices = root?.choices;
    const message = record(
      Array.isArray(choices) ? record(choices[0])?.message : null,
    );
    const content = message?.content;
    if (typeof content !== "string") {
      return { status: "INVALID_RESPONSE", summary: null, plans: [] };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      return { status: "INVALID_RESPONSE", summary: null, plans: [] };
    }
    const result = record(parsed);
    const minimum = Math.min(2, allowed.size);
    if (
      !result || !validShort(result.summary, 300) ||
      !Array.isArray(result.plans) ||
      result.plans.length < minimum || result.plans.length > 3
    ) {
      return { status: "INVALID_RESPONSE", summary: null, plans: [] };
    }
    const requiredKeys = [
      "slotId",
      "title",
      "subjectApproach",
      "composition",
      "cameraSettings",
      "lightAnalysis",
      "risks",
    ] as const;
    const seen = new Set<string>();
    const plans: AiCustomPlan[] = [];
    for (const value of result.plans) {
      const entry = record(value);
      if (
        !entry || requiredKeys.some((key) => !(key in entry))
      ) {
        return { status: "INVALID_RESPONSE", summary: null, plans: [] };
      }
      if (
        typeof entry.slotId !== "string" || !allowed.has(entry.slotId) ||
        seen.has(entry.slotId) || !validShort(entry.title, 120) ||
        !validShort(entry.subjectApproach) ||
        !validShort(entry.composition) ||
        !validShort(entry.cameraSettings, 500) ||
        !validShort(entry.lightAnalysis) || !Array.isArray(entry.risks) ||
        entry.risks.length > 3 ||
        entry.risks.some((risk) => !validShort(risk, 200))
      ) {
        return { status: "INVALID_RESPONSE", summary: null, plans: [] };
      }
      seen.add(entry.slotId);
      const camera = cameraParameters(entry.cameraParameters);
      plans.push({
        slotId: entry.slotId,
        title: entry.title.trim(),
        subjectApproach: entry.subjectApproach.trim(),
        composition: entry.composition.trim(),
        cameraSettings: entry.cameraSettings.trim(),
        ...(camera ? { cameraParameters: camera } : {}),
        lightAnalysis: entry.lightAnalysis.trim(),
        risks: entry.risks.map((risk: string) => risk.trim()),
      });
    }
    return {
      status: "SUCCESS",
      summary: result.summary.trim(),
      plans,
    };
  } catch (error) {
    if (error instanceof ProviderHttpError) {
      console.error(
        "deepseek_custom_plans_failed",
        error.code,
        error.status ?? "-",
      );
    }
    return {
      status: error instanceof ProviderHttpError &&
          error.code === "INVALID_JSON"
        ? "INVALID_RESPONSE"
        : "UNAVAILABLE",
      summary: null,
      plans: [],
    };
  }
}

export interface ClassifyPhotoSceneInput {
  heuristic: PhotoScene;
  signals: PhotoSignals;
  stats: PhotoStats;
  exif: PhotoExif | null;
}

export interface ClassifyPhotoSceneResult {
  status: "SUCCESS" | "DISABLED" | "UNAVAILABLE" | "INVALID_RESPONSE";
  scene: PhotoScene | null;
}

function sceneBasis(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 3) {
    return null;
  }
  const basis: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") return null;
    const text = Array.from(item).filter((char) => {
      const code = char.charCodeAt(0);
      return code > 0x1f && code !== 0x7f;
    }).join("").trim();
    if (text.length < 2 || text.length > 80) return null;
    basis.push(text);
  }
  return basis;
}

export async function classifyPhotoScene(
  input: ClassifyPhotoSceneInput,
): Promise<ClassifyPhotoSceneResult> {
  const apiKey = secretValue("DEEPSEEK_API_KEY");
  if (!apiKey) return { status: "DISABLED", scene: null };
  const model = Deno.env.get("DEEPSEEK_MODEL")?.trim() || "deepseek-chat";
  try {
    const payload = await fetchTrustedJson<unknown>({
      baseUrl: BASE_URL,
      path: "/chat/completions",
      allowedHosts: HOSTS,
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: PHOTO_SCENE_SKILL },
          { role: "user", content: JSON.stringify(input) },
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
        max_tokens: 300,
        stream: false,
      }),
      timeoutMs: 10_000,
      maxResponseBytes: 64 * 1024,
      retries: 0,
    });
    const root = record(payload);
    const choices = root?.choices;
    const message = record(
      Array.isArray(choices) ? record(choices[0])?.message : null,
    );
    const content = message?.content;
    if (typeof content !== "string") {
      return { status: "INVALID_RESPONSE", scene: null };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      return { status: "INVALID_RESPONSE", scene: null };
    }
    const result = record(parsed);
    const subject = result?.subject;
    const confidence = result?.confidence;
    const basis = sceneBasis(result?.basis);
    if (
      typeof subject !== "string" ||
      !PHOTO_SUBJECTS.includes(subject as PhotoSubject) ||
      (confidence !== "HIGH" && confidence !== "MEDIUM" &&
        confidence !== "LOW") ||
      basis === null
    ) {
      return { status: "INVALID_RESPONSE", scene: null };
    }
    return {
      status: "SUCCESS",
      scene: {
        subject: subject as PhotoSubject,
        label: PHOTO_SUBJECT_LABELS[subject as PhotoSubject],
        confidence,
        basis,
        source: "DEEPSEEK",
      },
    };
  } catch (error) {
    if (error instanceof ProviderHttpError) {
      console.error(
        "deepseek_photo_scene_failed",
        error.code,
        error.status ?? "-",
      );
    }
    return {
      status: error instanceof ProviderHttpError &&
          error.code === "INVALID_JSON"
        ? "INVALID_RESPONSE"
        : "UNAVAILABLE",
      scene: null,
    };
  }
}
