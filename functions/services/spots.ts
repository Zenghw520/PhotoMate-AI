import type {
  SlotKind,
  SpotRecommendation,
  SpotRecommendationsResponse,
  SpotRequest,
  SpotScene,
  ThemeId,
  TimelineItem,
  TimeWindow,
} from "../shared/contracts.ts";
import { gcj02ToWgs84, searchPhotoSpots } from "../providers/amap.ts";
import type { DatabaseClient } from "./cache.ts";
import { getTodayPhotography } from "./today.ts";

const DIRECTIONS = ["北", "东北", "东", "东南", "南", "西南", "西", "西北"];

const SUNRISE_KINDS: SlotKind[] = ["DAWN", "SUNRISE", "MORNING_GOLDEN"];
const SUNSET_KINDS: SlotKind[] = ["EVENING_GOLDEN", "SUNSET", "DUSK"];

const THEME_HINTS: Record<ThemeId, string[]> = {
  LANDSCAPE: ["风景", "观景", "山", "湖", "湿地", "公园", "海岸", "景区", "塔"],
  PORTRAIT: ["公园", "花园", "街区", "创意园", "咖啡馆", "广场", "园林"],
  ARCHITECTURE: ["地标", "古建", "寺庙", "塔", "广场", "美术馆", "建筑", "楼"],
  STREET: ["步行街", "老街", "商圈", "夜市", "广场", "街区", "巷"],
  FOOD: ["美食", "茶楼", "咖啡", "街区", "夜市", "餐厅"],
  NIGHT: ["观景", "天桥", "滨江", "广场", "夜景", "塔", "江"],
  TRAVEL: ["景区", "古镇", "公园", "风景", "名胜", "湖", "山"],
};

function directionName(degrees: number) {
  return DIRECTIONS[Math.round((((degrees % 360) + 360) % 360) / 45) % 8];
}

function bearing(
  fromLatitude: number,
  fromLongitude: number,
  toLatitude: number,
  toLongitude: number,
) {
  const rad = Math.PI / 180;
  const deltaLongitude = (toLongitude - fromLongitude) * rad;
  const first = fromLatitude * rad;
  const second = toLatitude * rad;
  const y = Math.sin(deltaLongitude) * Math.cos(second);
  const x = Math.cos(first) * Math.sin(second) -
    Math.sin(first) * Math.cos(second) * Math.cos(deltaLongitude);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function mapUrl(name: string, longitude: number, latitude: number) {
  return `https://uri.amap.com/marker?position=${longitude.toFixed(6)},${
    latitude.toFixed(6)
  }&name=${
    encodeURIComponent(name)
  }&src=zhuguang&coordinate=gaode&callnative=0`;
}

function sceneOfKind(kind: SlotKind | null | undefined): SpotScene | null {
  if (!kind) return null;
  if (SUNRISE_KINDS.includes(kind)) return "SUNRISE";
  if (SUNSET_KINDS.includes(kind)) return "SUNSET";
  return "DAY";
}

function pickWindow(
  timeline: TimelineItem[],
  slotKind: SlotKind | null | undefined,
): TimelineItem | null {
  if (slotKind) {
    const exact = timeline.find((slot) => slot.kind === slotKind);
    if (exact) return exact;
    const group = sceneOfKind(slotKind);
    if (group) {
      const sameScene = timeline.find((slot) =>
        sceneOfKind(slot.kind) === group
      );
      if (sameScene) return sameScene;
    }
  }
  return timeline.find((slot) => !slot.isPast) ?? timeline[0] ?? null;
}

function eventWindow(event: string | null): TimeWindow | null {
  if (!event) return null;
  const midpoint = Date.parse(event);
  if (!Number.isFinite(midpoint)) return null;
  return {
    start: new Date(midpoint - 45 * 60 * 1000).toISOString(),
    end: new Date(midpoint + 45 * 60 * 1000).toISOString(),
  };
}

function matchOf(spot: { name: string; type: string }, theme: ThemeId) {
  const text = `${spot.name} ${spot.type}`;
  const hits = THEME_HINTS[theme].filter((hint) => text.includes(hint));
  return {
    hits,
    reason: hits.length
      ? `类型命中「${hits.slice(0, 3).join("、")}」`
      : "按周边环境与距离推荐",
  };
}

export async function recommendSpots(
  input: SpotRequest,
  db?: DatabaseClient,
  now = new Date(),
): Promise<SpotRecommendationsResponse> {
  const radius = Math.min(
    50_000,
    Math.max(1_000, input.radiusMeters ?? 20_000),
  );
  const [context, amap] = await Promise.all([
    getTodayPhotography(
      input.location,
      input.theme,
      db,
      now,
      input.date,
      true,
    ),
    searchPhotoSpots(
      input.location.latitude,
      input.location.longitude,
      input.theme,
      { radiusMeters: radius, limit: 20 },
    ),
  ]);

  const slot = pickWindow(context.timeline, input.slotKind);
  const explicitScene = input.scene === "SUNRISE" || input.scene === "SUNSET"
    ? input.scene
    : null;
  const slotScene = sceneOfKind(slot?.kind);
  let scene: SpotScene;
  if (explicitScene) {
    scene = explicitScene;
  } else if (slotScene && slotScene !== "DAY") {
    scene = slotScene;
  } else {
    const sunrise = context.solar.sunrise
      ? Date.parse(context.solar.sunrise)
      : NaN;
    const sunset = context.solar.sunset
      ? Date.parse(context.solar.sunset)
      : NaN;
    const target = Number.isFinite(sunrise) && sunrise > now.getTime()
      ? sunrise
      : Number.isFinite(sunset)
      ? sunset
      : Number.MAX_SAFE_INTEGER;
    scene = Number.isFinite(sunrise) &&
        Math.abs(sunrise - target) <= Math.abs(sunset - target)
      ? "SUNRISE"
      : "SUNSET";
  }
  const isSunrise = scene === "SUNRISE";
  const cameraAzimuth = isSunrise
    ? context.solar.sunriseAzimuth
    : context.solar.sunsetAzimuth;
  const eventTime = isSunrise ? context.solar.sunrise : context.solar.sunset;
  // 显式切换日出/日落时，窗口跟随场景；否则沿用已选窗口。
  const useSlot = !explicitScene || slotScene === scene;
  const window = useSlot && slot
    ? { start: slot.start, end: slot.end }
    : eventWindow(eventTime);
  const sunName = isSunrise ? "日出" : "日落";
  const cameraDirection = cameraAzimuth === null
    ? "方向待核实"
    : `${directionName(cameraAzimuth)} ${Math.round(cameraAzimuth)}°`;

  const current = context.weather.current;
  const firstWeather = context.timeline[0]?.weather ?? null;
  const weatherSummary = current
    ? `${current.condition || "天气未知"} ${
      current.temperature === null ? "—" : Math.round(current.temperature)
    }°C · 云量 ${
      current.cloud === null ? "—" : `${Math.round(current.cloud)}%`
    } · 能见度 ${
      current.visibility === null
        ? "—"
        : `${(current.visibility / 1000).toFixed(1)}km`
    }`
    : firstWeather
    ? `${firstWeather.condition} · 云量 ${
      firstWeather.cloud === null ? "—" : `${Math.round(firstWeather.cloud)}%`
    }`
    : "所选日期暂无逐小时天气。";

  const spots: SpotRecommendation[] = amap.spots.map((spot) => {
    const wgs = gcj02ToWgs84(spot.gcj.latitude, spot.gcj.longitude);
    const relative = bearing(
      input.location.latitude,
      input.location.longitude,
      wgs.latitude,
      wgs.longitude,
    );
    const distanceMeters = Math.round(spot.distanceMeters);
    const match = matchOf(spot, input.theme);
    const distanceBonus = Math.max(
      0,
      12 - Math.min(12, (distanceMeters / 1000) * 0.6),
    );
    const matchScore = Math.min(
      100,
      Math.round(55 + Math.min(3, match.hits.length) * 11 + distanceBonus),
    );
    return {
      id: spot.id,
      name: spot.name,
      address: spot.address,
      type: spot.type,
      latitude: wgs.latitude,
      longitude: wgs.longitude,
      distanceMeters,
      direction: directionName(relative),
      cameraDirection,
      cameraAzimuth,
      scene,
      matchScore,
      matchReason: match.reason,
      verification: {
        opening: spot.openTime ?? "待核实",
        access: "待核实",
        occlusion: "待核实",
      },
      recommendedWindow: window,
      windowKind: useSlot && slot ? slot.kind : null,
      windowLabel: useSlot && slot ? slot.label : `${sunName}前后`,
      mapUrl: mapUrl(spot.name, spot.gcj.longitude, spot.gcj.latitude),
      sunNote: cameraAzimuth === null
        ? `拍摄时面朝${sunName}方向；太阳方位数据不足，按现场光线判断。`
        : `拍摄时面朝${sunName}方位 ${cameraDirection}；地形遮挡以现场为准。`,
    };
  }).sort((left, right) =>
    right.matchScore - left.matchScore ||
    left.distanceMeters - right.distanceMeters
  );

  const warnings: string[] = [
    "地点来自高德 POI 搜索，按距离与题材关键词排序；开放时间、通行与地形遮挡缺少可靠数据，均标注「待核实」。",
  ];
  if (amap.status === "UNCONFIGURED") {
    warnings.push("地点推荐服务尚未配置，暂时无法获取周边摄影点。");
  }
  if (amap.status === "UNAVAILABLE") {
    warnings.push(amap.message ?? "高德地点推荐暂不可用。");
  }
  if (amap.status === "OK" && spots.length === 0) {
    warnings.push(amap.message ?? "周边暂未找到匹配的摄影点。");
  }
  if (context.location.precision === "DISTRICT") {
    warnings.push("位置为区县行政中心近似坐标，推荐点可能偏离实际拍摄区。");
  }
  if (cameraAzimuth !== null) {
    warnings.push(
      `${sunName}方位约 ${directionName(cameraAzimuth)} ${
        Math.round(cameraAzimuth)
      }°，建议优先选择朝${
        directionName(cameraAzimuth)
      }视野开阔的位置；到达后请用现场罗盘复核。`,
    );
  }
  if (!window) {
    warnings.push("所选日期缺少可用光线窗口，窗口与方向仅供参考。");
  }

  return {
    generatedAt: now.toISOString(),
    date: context.date,
    location: context.location,
    theme: input.theme,
    weatherSummary,
    recommendedWindow: window,
    recommendedWindowKind: useSlot && slot ? slot.kind : null,
    recommendedWindowLabel: useSlot && slot ? slot.label : `${sunName}前后`,
    sunriseAzimuth: context.solar.sunriseAzimuth,
    sunsetAzimuth: context.solar.sunsetAzimuth,
    spots,
    warnings,
  };
}
