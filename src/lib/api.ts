import { PHOTO_SUBJECTS } from "@/functions/shared/contracts";
import type {
  ApiErrorBody,
  CustomPlanRequest,
  CustomPlansResponse,
  LocationInput,
  LocationResult,
  PhotoAnalysisRequest,
  PhotoAnalysisResponse,
  PhotoScene,
  SearchResponse,
  SpotRecommendationsResponse,
  SpotRequest,
  ThemeId,
  TodayRequest,
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
    !!item.fireCloud && !!item.indices && Array.isArray(item.indices.entries) &&
    Array.isArray(item.indices.trend) &&
    Array.isArray(item.timeline) && Array.isArray(item.alerts) && !!item.plans &&
    Array.isArray(item.plans.items) && Array.isArray(item.warnings);
}

export function searchLocations(query: string, signal?: AbortSignal) {
  return request(`/locations/search?q=${encodeURIComponent(query)}&limit=8`, { signal }, isSearchResponse);
}

export interface PlaceResult {
  id: string;
  name: string;
  address: string;
  type: string;
  region: string;
  latitude: number;
  longitude: number;
  mapUrl: string;
}

function isPlaceResponse(value: unknown): value is { places: PlaceResult[] } {
  if (!value || typeof value !== "object") return false;
  const places = (value as { places?: unknown }).places;
  return Array.isArray(places) && places.every((item) =>
    !!item && typeof item === "object" &&
    typeof (item as PlaceResult).name === "string" &&
    typeof (item as PlaceResult).latitude === "number" &&
    typeof (item as PlaceResult).longitude === "number"
  );
}

/** 按地标 / POI 名称检索精确机位。 */
export function searchPlaces(query: string, signal?: AbortSignal) {
  return request(
    `/locations/place?q=${encodeURIComponent(query)}`,
    { signal },
    isPlaceResponse,
  );
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

function isPhotoScene(value: unknown): value is PhotoScene {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<PhotoScene>;
  return PHOTO_SUBJECTS.includes(item.subject as PhotoScene["subject"]) &&
    typeof item.label === "string" &&
    (item.confidence === "LOW" || item.confidence === "MEDIUM" ||
      item.confidence === "HIGH") &&
    Array.isArray(item.basis);
}

function isPhotoAnalysis(value: unknown): value is PhotoAnalysisResponse {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<PhotoAnalysisResponse>;
  return typeof item.generatedAt === "string" &&
    typeof item.summary === "string" && Array.isArray(item.strengths) &&
    Array.isArray(item.issues) && Array.isArray(item.suggestions) &&
    Array.isArray(item.exifSummary) && isPhotoScene(item.scene) &&
    (item.confidenceLevel === "LOW" || item.confidenceLevel === "MEDIUM" ||
      item.confidenceLevel === "HIGH") &&
    typeof item.aiStatus === "string" && typeof item.disclaimer === "string";
}

export function analyzePhoto(input: PhotoAnalysisRequest, signal?: AbortSignal) {
  return request("/photo/analyze", {
    method: "POST",
    body: JSON.stringify(input),
    signal,
  }, isPhotoAnalysis);
}

function isCustomPlansResponse(value: unknown): value is CustomPlansResponse {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<CustomPlansResponse>;
  return typeof item.generatedAt === "string" && typeof item.date === "string" &&
    !!item.location && typeof item.weatherSummary === "string" &&
    typeof item.summary === "string" && Array.isArray(item.plans) &&
    typeof item.aiStatus === "string" && Array.isArray(item.warnings);
}

function isSpotRecommendations(
  value: unknown,
): value is SpotRecommendationsResponse {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<SpotRecommendationsResponse>;
  return typeof item.generatedAt === "string" && Array.isArray(item.spots) &&
    item.spots.every((spot) =>
      !!spot && typeof spot.name === "string" &&
      typeof spot.mapUrl === "string" && typeof spot.distanceMeters === "number"
    ) &&
    Array.isArray(item.warnings);
}

export function recommendPhotoSpots(
  input: SpotRequest,
  signal?: AbortSignal,
) {
  return request("/locations/spots", {
    method: "POST",
    body: JSON.stringify(input),
    signal,
  }, isSpotRecommendations);
}

export function generateCustomPlans(
  input: CustomPlanRequest,
  signal?: AbortSignal,
) {
  return request("/plans/custom", {
    method: "POST",
    body: JSON.stringify(input),
    signal,
  }, isCustomPlansResponse);
}
