import type {
  LocationPrecision,
  LocationResult,
  SlotKind,
  ThemeId,
  TimelineItem,
} from "@/functions/shared/contracts";

/**
 * 拍摄点来源。区县中心来自行政区搜索，POI 来自高德地点检索，
 * FAVORITE 来自本地收藏；三者都归一到后端支持的三档 precision。
 */
export type SpotSource = "DISTRICT" | "MANUAL" | "GPS" | "POI" | "FAVORITE";

export interface ShootingSpot {
  id: string;
  name: string;
  region?: string;
  address?: string;
  latitude: number;
  longitude: number;
  /** 发送给函数服务的位置精度，决定评分与提示语义。 */
  precision: LocationPrecision;
  source: SpotSource;
  /** 高德 URI，保留导航入口。 */
  mapUrl?: string;
  savedAt?: string;
}

export interface ShootingSession {
  spot: ShootingSpot | null;
  theme: ThemeId;
  /** 0=今天，1=明天，2=后天，以拍摄点当地（中国统一 UTC+8）日期为准。 */
  dayOffset: number;
  /** 语义窗口类型，换机位或日期后仍可自动选中同类窗口。 */
  slotKind: SlotKind | null;
  /** 当前数据里的具体窗口；仅用于本次响应，不持久化。 */
  slotId: string | null;
  equipment: string;
}

const SESSION_KEY = "photomate-session:v1";
const LEGACY_LOCATION_KEY = "photomate-location";

export const THEME_LABELS: Record<ThemeId, string> = {
  PORTRAIT: "人像",
  LANDSCAPE: "风光",
  ARCHITECTURE: "建筑",
  STREET: "街头",
  FOOD: "美食",
  NIGHT: "夜景",
  TRAVEL: "旅行",
};

export const THEME_OPTIONS = (
  Object.keys(THEME_LABELS) as ThemeId[]
).map((id) => ({ id, label: THEME_LABELS[id] }));

/** 当前版本仅支持中国境内机位，统一使用北京时间。 */
export const LOCATION_TIME_ZONE = "Asia/Shanghai";

export const DEFAULT_SESSION: ShootingSession = {
  spot: null,
  theme: "LANDSCAPE",
  dayOffset: 0,
  slotKind: null,
  slotId: null,
  equipment: "",
};

export function spotSourceLabel(source: SpotSource): string {
  if (source === "DISTRICT") return "区县中心";
  if (source === "GPS") return "设备定位";
  if (source === "POI") return "地图选点";
  if (source === "FAVORITE") return "收藏机位";
  return "手选坐标";
}

export function spotFromLocation(
  location: LocationResult,
  source?: SpotSource,
): ShootingSpot {
  return {
    id: location.id ?? `${location.latitude},${location.longitude}`,
    name: location.name,
    region: location.region,
    latitude: location.latitude,
    longitude: location.longitude,
    precision: location.precision,
    source: source ?? (location.precision === "GPS"
      ? "GPS"
      : location.precision === "MANUAL"
      ? "MANUAL"
      : "DISTRICT"),
  };
}

export function toLocationResult(spot: ShootingSpot): LocationResult {
  return {
    id: spot.id,
    name: spot.name,
    region: spot.region,
    latitude: spot.latitude,
    longitude: spot.longitude,
    precision: spot.precision,
    timezone: LOCATION_TIME_ZONE,
  };
}

/** 拍摄点当地的日历日期；与设备时区无关。 */
export function spotDate(dayOffset = 0, now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: LOCATION_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return new Date(
    Date.UTC(
      Number(value.year),
      Number(value.month) - 1,
      Number(value.day) + dayOffset,
    ),
  ).toISOString().slice(0, 10);
}

export const DAY_LABELS: Record<number, string> = {
  0: "今天",
  1: "明天",
  2: "后天",
};

export function dayLabel(offset: number): string {
  return DAY_LABELS[offset] ?? `${offset} 天后`;
}

/** 同一类光线窗口的稳定标识，用于跨机位/日期保持选择。 */
export type WindowGroup = "BLUE" | "GOLDEN" | "GLOW" | "DAY" | "NIGHT";

export function windowGroup(kind: SlotKind): WindowGroup {
  if (kind === "DAWN" || kind === "DUSK" || kind === "BLUE_HOUR") return "BLUE";
  if (kind === "MORNING_GOLDEN" || kind === "EVENING_GOLDEN") return "GOLDEN";
  if (kind === "SUNRISE" || kind === "SUNSET") return "GLOW";
  if (kind === "NIGHT") return "NIGHT";
  return "DAY";
}

export function windowGroupLabel(kind: SlotKind | null): string {
  if (!kind) return "未选窗口";
  const group = windowGroup(kind);
  if (group === "BLUE") return "蓝调";
  if (group === "GOLDEN") return "黄金时刻";
  if (group === "GLOW") return "霞光";
  if (group === "NIGHT") return "夜间";
  return "白天";
}

/** 从当天时间轴里找出与已选类型一致的窗口；没有则取第一个未结束窗口。 */
export function pickSlot(
  timeline: TimelineItem[],
  slotKind: SlotKind | null,
  slotId: string | null,
): TimelineItem | null {
  if (slotId) {
    const exact = timeline.find((item) => item.slotId === slotId);
    if (exact) return exact;
  }
  if (slotKind) {
    const sameKind = timeline.find((item) =>
      item.kind === slotKind && !item.isPast
    ) ?? timeline.find((item) => item.kind === slotKind);
    if (sameKind) return sameKind;
    const sameGroup = timeline.find((item) =>
      windowGroup(item.kind) === windowGroup(slotKind) && !item.isPast
    ) ?? timeline.find((item) =>
      windowGroup(item.kind) === windowGroup(slotKind)
    );
    if (sameGroup) return sameGroup;
  }
  return timeline.find((item) => !item.isPast) ?? timeline[0] ?? null;
}

export function readSession(): ShootingSession {
  if (typeof localStorage === "undefined") return DEFAULT_SESSION;
  try {
    const raw = JSON.parse(localStorage.getItem(SESSION_KEY) ?? "null") as
      | Partial<ShootingSession>
      | null;
    if (raw && typeof raw === "object" && raw.spot !== undefined) {
      return normalizeSession(raw);
    }
  } catch {
    // fall through to legacy migration
  }
  const legacy = readLegacyLocation();
  return legacy ? { ...DEFAULT_SESSION, spot: legacy } : DEFAULT_SESSION;
}

function normalizeSession(raw: Partial<ShootingSession>): ShootingSession {
  const spot = raw.spot && typeof raw.spot === "object"
    ? normalizeSpot(raw.spot as Partial<ShootingSpot>)
    : null;
  const theme = raw.theme === "PORTRAIT" || raw.theme === "ARCHITECTURE" ||
      raw.theme === "STREET" || raw.theme === "FOOD" ||
      raw.theme === "NIGHT" || raw.theme === "TRAVEL"
    ? raw.theme
    : "LANDSCAPE";
  const dayOffset = raw.dayOffset === 1 || raw.dayOffset === 2
    ? raw.dayOffset
    : 0;
  const slotKind = typeof raw.slotKind === "string"
    ? raw.slotKind as SlotKind
    : null;
  return {
    spot,
    theme,
    dayOffset,
    slotKind,
    slotId: null,
    equipment: typeof raw.equipment === "string"
      ? raw.equipment.slice(0, 120)
      : "",
  };
}

function normalizeSpot(raw: Partial<ShootingSpot>): ShootingSpot | null {
  if (
    typeof raw.name !== "string" || typeof raw.latitude !== "number" ||
    typeof raw.longitude !== "number" || !Number.isFinite(raw.latitude) ||
    !Number.isFinite(raw.longitude) ||
    (raw.precision !== "GPS" && raw.precision !== "MANUAL" &&
      raw.precision !== "DISTRICT")
  ) return null;
  return {
    id: typeof raw.id === "string" ? raw.id : `${raw.latitude},${raw.longitude}`,
    name: raw.name,
    region: typeof raw.region === "string" ? raw.region : undefined,
    address: typeof raw.address === "string" ? raw.address : undefined,
    latitude: raw.latitude,
    longitude: raw.longitude,
    precision: raw.precision,
    source: raw.source === "GPS" || raw.source === "POI" ||
        raw.source === "FAVORITE" || raw.source === "MANUAL"
      ? raw.source
      : "DISTRICT",
    mapUrl: typeof raw.mapUrl === "string" ? raw.mapUrl : undefined,
    savedAt: typeof raw.savedAt === "string" ? raw.savedAt : undefined,
  };
}

function readLegacyLocation(): ShootingSpot | null {
  try {
    const value = JSON.parse(
      localStorage.getItem(LEGACY_LOCATION_KEY) ?? "null",
    ) as Partial<LocationResult> | null;
    if (
      !value || typeof value.name !== "string" ||
      typeof value.latitude !== "number" ||
      typeof value.longitude !== "number" ||
      (value.precision !== "GPS" && value.precision !== "MANUAL" &&
        value.precision !== "DISTRICT")
    ) return null;
    return spotFromLocation(value as LocationResult);
  } catch {
    return null;
  }
}

export function writeSession(session: ShootingSession) {
  try {
    localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({
        spot: session.spot,
        theme: session.theme,
        dayOffset: session.dayOffset,
        slotKind: session.slotKind,
        equipment: session.equipment,
      }),
    );
    if (session.spot) {
      localStorage.setItem(
        LEGACY_LOCATION_KEY,
        JSON.stringify(toLocationResult(session.spot)),
      );
    }
  } catch {
    // 本地存储不可用时仍保留当前会话内存状态。
  }
}
