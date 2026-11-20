import {
  PHOTO_SUBJECT_LABELS,
  PHOTO_SUBJECTS,
  THEMES,
} from "./shared/contracts.ts";
import type {
  CompareRequest,
  CustomPlanRequest,
  LocationInput,
  PhotoAnalysisRequest,
  PhotoScene,
  PhotoSignals,
  PhotoSubject,
  SlotKind,
  SpotRequest,
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
    coords.latitude < 3 || coords.latitude > 54 || coords.longitude < 73 ||
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

function optionalText(value: unknown, maxLength: number): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    throw new HttpError(400, "INVALID_PHOTO", "照片元数据格式无效。");
  }
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function optionalNumber(
  value: unknown,
  minimum: number,
  maximum: number,
  allowZero = false,
): number | null {
  if (value === undefined || value === null) return null;
  if (
    typeof value !== "number" || !Number.isFinite(value) ||
    value < minimum || value > maximum || (!allowZero && value === 0)
  ) {
    throw new HttpError(400, "INVALID_PHOTO", "照片拍摄参数格式无效。");
  }
  return value;
}

function requiredNumber(
  value: unknown,
  minimum: number,
  maximum: number,
): number {
  if (
    typeof value !== "number" || !Number.isFinite(value) ||
    value < minimum || value > maximum
  ) {
    throw new HttpError(400, "INVALID_PHOTO", "照片统计指标格式无效。");
  }
  return value;
}

function photoScene(value: unknown): PhotoScene | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError(400, "INVALID_PHOTO", "照片题材格式无效。");
  }
  const source = value as Record<string, unknown>;
  const subject = source.subject;
  if (
    typeof subject !== "string" ||
    !PHOTO_SUBJECTS.includes(subject as PhotoSubject)
  ) {
    throw new HttpError(400, "INVALID_PHOTO", "照片题材类型无效。");
  }
  const confidence = source.confidence;
  if (
    confidence !== "LOW" && confidence !== "MEDIUM" && confidence !== "HIGH"
  ) {
    throw new HttpError(400, "INVALID_PHOTO", "照片题材置信度无效。");
  }
  const rawBasis = source.basis;
  if (!Array.isArray(rawBasis)) {
    throw new HttpError(400, "INVALID_PHOTO", "照片题材依据格式无效。");
  }
  const basis: string[] = [];
  for (const item of rawBasis.slice(0, 4)) {
    if (typeof item !== "string") {
      throw new HttpError(400, "INVALID_PHOTO", "照片题材依据格式无效。");
    }
    const trimmed = item.trim().slice(0, 80);
    if (trimmed) basis.push(trimmed);
  }
  return {
    subject: subject as PhotoSubject,
    label: PHOTO_SUBJECT_LABELS[subject as PhotoSubject],
    confidence,
    basis,
  };
}

function photoSignals(value: unknown): PhotoSignals | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError(400, "INVALID_PHOTO", "照片画面特征格式无效。");
  }
  const source = value as Record<string, unknown>;
  const optionalSignal = (input: unknown) =>
    input === undefined || input === null
      ? undefined
      : requiredNumber(input, 0, 100);
  return {
    skin: requiredNumber(source.skin, 0, 100),
    sky: requiredNumber(source.sky, 0, 100),
    green: requiredNumber(source.green, 0, 100),
    warm: requiredNumber(source.warm, 0, 100),
    dark: requiredNumber(source.dark, 0, 100),
    bright: requiredNumber(source.bright, 0, 100),
    edgeDensity: requiredNumber(source.edgeDensity, 0, 100),
    centerSharpness: requiredNumber(source.centerSharpness, 0, 100),
    borderSharpness: requiredNumber(source.borderSharpness, 0, 100),
    ...(optionalSignal(source.flatness) === undefined
      ? {}
      : { flatness: optionalSignal(source.flatness) }),
    ...(optionalSignal(source.dominantColor) === undefined
      ? {}
      : { dominantColor: optionalSignal(source.dominantColor) }),
    ...(optionalSignal(source.screenLike) === undefined
      ? {}
      : { screenLike: optionalSignal(source.screenLike) }),
  };
}

export function customPlanRequest(body: unknown): CustomPlanRequest {
  const base = todayRequest(body);
  const value = body as Record<string, unknown>;
  const raw = typeof value.subject === "string" ? value.subject : "";
  const subject = Array.from(raw).filter((char) => {
    const code = char.charCodeAt(0);
    return code > 0x1f && code !== 0x7f;
  }).join("").trim();
  if (subject.length < 2 || subject.length > 200) {
    throw new HttpError(
      400,
      "INVALID_SUBJECT",
      "拍摄题材需为 2～200 个字符。",
    );
  }
  const optional = (input: unknown, max: number, label: string) => {
    if (input === undefined || input === null) return undefined;
    if (typeof input !== "string") {
      throw new HttpError(400, "INVALID_SUBJECT", `${label}格式无效。`);
    }
    const cleaned = Array.from(input).filter((char) => {
      const code = char.charCodeAt(0);
      return code > 0x1f && code !== 0x7f;
    }).join("").trim().slice(0, max);
    return cleaned || undefined;
  };
  return {
    ...base,
    subject,
    equipment: optional(value.equipment, 80, "摄影设备"),
    preferences: optional(value.preferences, 200, "拍摄偏好"),
    phone: optional(value.phone, 40, "手机"),
    camera: optional(value.camera, 60, "相机"),
    lens: optional(value.lens, 60, "镜头"),
    ...(slotKindValue(value.slotKind)
      ? { slotKind: value.slotKind as SlotKind }
      : {}),
  };
}

export function photoAnalysisRequest(body: unknown): PhotoAnalysisRequest {
  if (!body || typeof body !== "object") {
    throw new HttpError(400, "INVALID_PHOTO", "照片分析请求格式无效。");
  }
  const value = body as Record<string, unknown>;
  const rawName = typeof value.fileName === "string" ? value.fileName : "";
  const fileName = rawName.split(/[\\/]/).pop()?.trim().slice(0, 200) ||
    "photo";
  const fileSize = value.fileSize;
  if (
    typeof fileSize !== "number" || !Number.isInteger(fileSize) ||
    fileSize < 1 || fileSize > 200 * 1024 * 1024
  ) {
    throw new HttpError(400, "INVALID_PHOTO", "照片大小需在 200MB 以内。");
  }
  const mimeType = value.mimeType;
  if (
    mimeType !== "image/jpeg" && mimeType !== "image/png" &&
    mimeType !== "image/webp" && mimeType !== "image/x-raw"
  ) {
    throw new HttpError(
      400,
      "INVALID_PHOTO",
      "仅支持 JPEG、PNG、WebP 或 RAW。",
    );
  }

  const rawExif = value.exif;
  let exif = null;
  if (rawExif !== undefined && rawExif !== null) {
    if (typeof rawExif !== "object" || Array.isArray(rawExif)) {
      throw new HttpError(400, "INVALID_PHOTO", "EXIF 格式无效。");
    }
    const source = rawExif as Record<string, unknown>;
    const flash = source.flash;
    if (flash !== undefined && flash !== null && typeof flash !== "boolean") {
      throw new HttpError(400, "INVALID_PHOTO", "闪光灯字段格式无效。");
    }
    exif = {
      make: optionalText(source.make, 80),
      model: optionalText(source.model, 80),
      lens: optionalText(source.lens, 80),
      dateTimeOriginal: optionalText(source.dateTimeOriginal, 40),
      exposureTime: optionalNumber(source.exposureTime, 0.00001, 60),
      fNumber: optionalNumber(source.fNumber, 0.5, 64),
      iso: optionalNumber(source.iso, 1, 409600),
      focalLength: optionalNumber(source.focalLength, 1, 2000),
      focalLength35: optionalNumber(source.focalLength35, 1, 2000),
      exposureBias: optionalNumber(source.exposureBias, -10, 10, true),
      flash: typeof flash === "boolean" ? flash : null,
      whiteBalance: optionalText(source.whiteBalance, 20),
      orientation: optionalNumber(source.orientation, 1, 8),
      hasGps: source.hasGps === true,
    };
  }

  const rawStats = value.stats;
  if (!rawStats || typeof rawStats !== "object" || Array.isArray(rawStats)) {
    throw new HttpError(400, "INVALID_PHOTO", "照片统计指标缺失。");
  }
  const stats = rawStats as Record<string, unknown>;
  const width = requiredNumber(stats.width, 1, 30000);
  const height = requiredNumber(stats.height, 1, 30000);
  if (!Number.isInteger(width) || !Number.isInteger(height)) {
    throw new HttpError(400, "INVALID_PHOTO", "照片尺寸格式无效。");
  }

  return {
    fileName,
    fileSize,
    mimeType,
    exif,
    stats: {
      width,
      height,
      aspectRatio: requiredNumber(stats.aspectRatio, 0.05, 20),
      brightness: requiredNumber(stats.brightness, 0, 100),
      contrast: requiredNumber(stats.contrast, 0, 100),
      shadowsClipped: requiredNumber(stats.shadowsClipped, 0, 100),
      highlightsClipped: requiredNumber(stats.highlightsClipped, 0, 100),
      saturation: requiredNumber(stats.saturation, 0, 100),
      sharpness: requiredNumber(stats.sharpness, 0, 100),
    },
    scene: photoScene(value.scene),
    signals: photoSignals(value.signals),
    manualScene: value.manualScene === true,
  };
}

export const SLOT_KINDS: SlotKind[] = [
  "DAWN",
  "SUNRISE",
  "MORNING_GOLDEN",
  "DAYTIME",
  "EVENING_GOLDEN",
  "SUNSET",
  "DUSK",
  "BLUE_HOUR",
  "NIGHT",
];

export function slotKindValue(value: unknown): SlotKind | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string" || !SLOT_KINDS.includes(value as SlotKind)) {
    throw new HttpError(400, "INVALID_SLOT", "光线窗口类型无效。");
  }
  return value as SlotKind;
}

export function spotRequest(body: unknown): SpotRequest {
  const base = todayRequest(body);
  const value = body as Record<string, unknown>;
  const scene = value.scene;
  if (
    scene !== undefined && scene !== "SUNRISE" && scene !== "SUNSET" &&
    scene !== "ALL"
  ) {
    throw new HttpError(400, "INVALID_SCENE", "场景筛选无效。");
  }
  const radius = value.radiusMeters;
  if (
    radius !== undefined &&
    (typeof radius !== "number" || !Number.isFinite(radius) || radius < 1000 ||
      radius > 50000)
  ) {
    throw new HttpError(400, "INVALID_RADIUS", "搜索半径需在 1～50 公里之间。");
  }
  return {
    ...base,
    ...(scene !== undefined ? { scene } : {}),
    ...(radius !== undefined ? { radiusMeters: radius } : {}),
    ...(slotKindValue(value.slotKind)
      ? { slotKind: value.slotKind as SlotKind }
      : {}),
  };
}

export function compareRequest(body: unknown): CompareRequest {
  if (!body || typeof body !== "object") {
    throw new HttpError(400, "INVALID_INPUT", "窗口对比请求格式无效。");
  }
  const value = body as Record<string, unknown>;
  const items = value.items;
  if (!Array.isArray(items) || items.length < 2 || items.length > 3) {
    throw new HttpError(
      400,
      "INVALID_COMPARE_SIZE",
      "窗口对比需要 2～3 项。",
    );
  }
  if (!THEMES.includes(value.theme as ThemeId)) {
    throw new HttpError(400, "INVALID_THEME", "摄影主题无效。");
  }
  const parsed = items.map((item) => {
    if (!item || typeof item !== "object") {
      throw new HttpError(400, "INVALID_INPUT", "对比项格式无效。");
    }
    const entry = item as Record<string, unknown>;
    const base = todayRequest({
      location: entry.location,
      theme: value.theme,
      ...(entry.date !== undefined ? { date: entry.date } : {}),
    });
    let label: string | undefined;
    if (entry.label !== undefined) {
      if (typeof entry.label !== "string") {
        throw new HttpError(400, "INVALID_INPUT", "对比项名称格式无效。");
      }
      label = entry.label.trim().slice(0, 40) || undefined;
    }
    return {
      location: base.location,
      ...(base.date ? { date: base.date } : {}),
      ...(label ? { label } : {}),
    };
  });
  return {
    items: parsed,
    theme: value.theme as ThemeId,
    ...(slotKindValue(value.slotKind)
      ? { slotKind: value.slotKind as SlotKind }
      : {}),
  };
}
