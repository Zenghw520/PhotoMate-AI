import type {
  ApiErrorBody,
  LocationInput,
  LocationResult,
  SearchResponse,
  ThemeId,
  TodayResponse,
} from "@/functions/shared/contracts";

const base = "/functions/v1/app";

export class ApiError extends Error {
  constructor(public code: string, message: string, public retryable = false) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit | undefined, validate: (value: unknown) => value is T): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${base}${path}`, {
      ...init,
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError("NETWORK_ERROR", "暂时无法连接摄影服务，请稍后重试。", true);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new ApiError("INVALID_RESPONSE", "摄影服务返回了无法识别的响应。", true);
  }
  const payload: unknown = await response.json();
  if (!response.ok) {
    const body = payload as Partial<ApiErrorBody>;
    throw new ApiError(
      body.error?.code ?? "REQUEST_FAILED",
      body.error?.message ?? "请求未能完成，请稍后重试。",
      body.error?.retryable ?? response.status >= 500,
    );
  }
  if (!validate(payload)) throw new ApiError("INVALID_RESPONSE", "摄影服务的数据格式不完整。", true);
  return payload;
}

function isLocation(value: unknown): value is LocationResult {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<LocationResult>;
  return typeof item.name === "string" && typeof item.latitude === "number" &&
    typeof item.longitude === "number" && item.timezone === "Asia/Shanghai";
}

function isSearchResponse(value: unknown): value is SearchResponse {
  return !!value && typeof value === "object" && Array.isArray((value as SearchResponse).locations) &&
    (value as SearchResponse).locations.every(isLocation);
}

function isTodayResponse(value: unknown): value is TodayResponse {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<TodayResponse>;
  return typeof item.generatedAt === "string" && typeof item.date === "string" &&
    isLocation(item.location) && !!item.weather && Array.isArray(item.weather.hourly) &&
    !!item.solar && Array.isArray(item.solar.goldenHours) && !!item.potential &&
    !!item.fireCloud && Array.isArray(item.timeline) && !!item.plans &&
    Array.isArray(item.plans.items) && Array.isArray(item.warnings);
}

export function searchLocations(query: string, signal?: AbortSignal) {
  return request(`/locations/search?q=${encodeURIComponent(query)}&limit=8`, { signal }, isSearchResponse);
}

export function reverseLocation(latitude: number, longitude: number, signal?: AbortSignal) {
  return request("/locations/reverse", {
    method: "POST",
    body: JSON.stringify({ latitude, longitude }),
    signal,
  }, isLocation);
}

export function getToday(location: LocationInput, theme: ThemeId, date?: string, signal?: AbortSignal) {
  return request("/photography/today", {
    method: "POST",
    body: JSON.stringify({ location, theme, ...(date ? { date } : {}) }),
    signal,
  }, isTodayResponse);
}
