import type {
  LocationResult,
  PhotographyPlan,
  ThemeId,
  TimelineItem,
} from "../shared/contracts.ts";
import { secretValue } from "../shared/env.ts";
import { fetchTrustedJson, ProviderHttpError } from "./http.ts";

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
必须覆盖每个输入方案且仅一次，五个字段都必须存在，不得增加字段。文案应具体、简洁，并严格依据输入事实。`;

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
      timeoutMs: 12_000,
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
