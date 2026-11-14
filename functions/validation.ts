import { THEMES } from "./shared/contracts.ts";
import type {
  LocationInput,
  ThemeId,
  TodayRequest,
} from "./shared/contracts.ts";
import { HttpError } from "./errors.ts";

export async function readJson(request: Request): Promise<unknown> {
  if (
    !request.headers.get("content-type")?.toLowerCase().startsWith(
      "application/json",
    )
  ) {
    throw new HttpError(400, "INVALID_INPUT", "请求必须使用 JSON 格式。");
  }
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "INVALID_INPUT", "请求内容为空。");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 16384) {
        await reader.cancel();
        throw new HttpError(413, "PAYLOAD_TOO_LARGE", "请求内容过大。");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new HttpError(400, "INVALID_INPUT", "JSON 内容无法解析。");
  }
}

export function coordinates(body: unknown) {
  if (!body || typeof body !== "object") {
    throw new HttpError(400, "INVALID_INPUT", "经纬度格式无效。");
  }
  const value = body as Record<string, unknown>;
  if (
    typeof value.latitude !== "number" || typeof value.longitude !== "number" ||
    !Number.isFinite(value.latitude) || !Number.isFinite(value.longitude) ||
    value.latitude < -90 || value.latitude > 90 || value.longitude < -180 ||
    value.longitude > 180
  ) {
    throw new HttpError(400, "INVALID_COORDINATES", "请输入有效的经纬度。");
  }
  return { latitude: value.latitude, longitude: value.longitude };
}

export function todayRequest(body: unknown): TodayRequest {
  if (!body || typeof body !== "object") {
    throw new HttpError(400, "INVALID_INPUT", "摄影计划请求格式无效。");
  }
  const value = body as Record<string, unknown>;
  const location = value.location as Record<string, unknown> | undefined;
  if (!location) {
    throw new HttpError(400, "INVALID_LOCATION", "请先选择拍摄位置。");
  }
  const coords = coordinates(location);
  if (
    coords.latitude < 18 || coords.latitude > 54 || coords.longitude < 73 ||
    coords.longitude > 135
  ) {
    throw new HttpError(
      400,
      "UNSUPPORTED_REGION",
      "当前版本仅支持中国境内拍摄位置。",
    );
  }
  const precision = location.precision;
  if (
    precision !== "GPS" && precision !== "MANUAL" && precision !== "DISTRICT"
  ) {
    throw new HttpError(400, "INVALID_LOCATION", "位置精度标识无效。");
  }
  if (!THEMES.includes(value.theme as ThemeId)) {
    throw new HttpError(400, "INVALID_THEME", "摄影主题无效。");
  }
  const name = typeof location.name === "string" && location.name.trim()
    ? location.name.trim().slice(0, 120)
    : "所选区县";
  const normalizedLocation: LocationInput = { ...coords, name, precision };
  const date = value.date;
  if (date !== undefined) {
    const allowed = new Set(
      [0, 1, 2].map((offset) => shanghaiDay(offset)),
    );
    if (typeof date !== "string" || !allowed.has(date)) {
      throw new HttpError(
        400,
        "INVALID_DATE",
        "仅支持查询今天、明天和后天。",
      );
    }
  }
  return {
    location: normalizedLocation,
    theme: value.theme as ThemeId,
    ...(typeof date === "string" ? { date } : {}),
  };
}

function shanghaiDay(offset: number) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  const date = new Date(
    Date.UTC(
      Number(value.year),
      Number(value.month) - 1,
      Number(value.day) + offset,
    ),
  );
  return date.toISOString().slice(0, 10);
}

export function searchQuery(url: URL) {
  const query = url.searchParams.get("q")?.trim() ?? "";
  if (query.length < 2 || query.length > 40) {
    throw new HttpError(400, "INVALID_QUERY", "城市名称需为 2～40 个字符。");
  }
  const limit = Number(url.searchParams.get("limit") ?? "8");
  if (!Number.isInteger(limit) || limit < 1 || limit > 8) {
    throw new HttpError(400, "INVALID_QUERY", "搜索结果数量无效。");
  }
  return { query, limit };
}
