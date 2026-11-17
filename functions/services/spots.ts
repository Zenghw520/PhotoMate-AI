import type {
  SpotRecommendation,
  SpotRecommendationsResponse,
  TodayRequest,
} from "../shared/contracts.ts";
import { gcj02ToWgs84, searchPhotoSpots } from "../providers/amap.ts";
import type { DatabaseClient } from "./cache.ts";
import { getTodayPhotography } from "./today.ts";

const DIRECTIONS = ["北", "东北", "东", "东南", "南", "西南", "西", "西北"];

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
  }&src=photomate&coordinate=gaode&callnative=0`;
}

function nextWindow(
  solar: Awaited<ReturnType<typeof getTodayPhotography>>["solar"],
  now: Date,
) {
  const windows = [
    ...solar.goldenHours.map((window) => ({ ...window, label: "黄金时刻" })),
    ...solar.blueHours.map((window) => ({ ...window, label: "蓝调时刻" })),
  ].sort((left, right) => Date.parse(left.start) - Date.parse(right.start));
  return windows.find((window) => Date.parse(window.end) > now.getTime()) ??
    windows[0] ?? null;
}

export async function recommendSpots(
  input: TodayRequest,
  db?: DatabaseClient,
  now = new Date(),
): Promise<SpotRecommendationsResponse> {
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
    ),
  ]);
  const window = nextWindow(context.solar, now);
  const usingSunset = window !== null &&
    (context.solar.sunset === null ||
      Date.parse(window.start) >=
        Date.parse(context.solar.sunset) - 90 * 60_000);
  const sunAzimuth = usingSunset
    ? context.solar.sunsetAzimuth
    : context.solar.sunriseAzimuth;
  const sunName = usingSunset ? "日落" : "日出";
  const sunNote = sunAzimuth === null
    ? "太阳方位数据不足，按现场光线判断。"
    : `拍摄时面朝${sunName}方位 ${directionName(sunAzimuth)}（${
      Math.round(sunAzimuth)
    }°）；具体遮挡以现场为准。`;
  const current = context.weather.current;
  const firstWeather = context.timeline[0]?.weather ?? null;
  const weatherSummary = current
    ? `${current.condition || "天气未知"} ${
      current.temperature ?? "—"
    }°C · 云量 ${current.cloud ?? "—"}% · 能见度 ${
      current.visibility === null
        ? "—"
        : `${(current.visibility / 1000).toFixed(1)}km`
    }`
    : firstWeather
    ? `${firstWeather.condition} · 云量 ${firstWeather.cloud ?? "—"}%`
    : "所选日期暂无逐小时天气。";

  const spots: SpotRecommendation[] = amap.spots.map((spot) => {
    const wgs = gcj02ToWgs84(spot.gcj.latitude, spot.gcj.longitude);
    const relative = bearing(
      input.location.latitude,
      input.location.longitude,
      wgs.latitude,
      wgs.longitude,
    );
    return {
      id: spot.id,
      name: spot.name,
      address: spot.address,
      type: spot.type,
      latitude: wgs.latitude,
      longitude: wgs.longitude,
      distanceMeters: Math.round(spot.distanceMeters),
      direction: directionName(relative),
      mapUrl: mapUrl(spot.name, spot.gcj.longitude, spot.gcj.latitude),
      sunNote,
    };
  });

  const warnings: string[] = [
    "地点来自高德 POI 搜索，按距离与题材关键词筛选；不包含地形遮挡、通行与开放状态。",
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
  if (usingSunset && context.solar.sunsetAzimuth !== null) {
    warnings.push(
      `日落方位约 ${directionName(context.solar.sunsetAzimuth)} ${
        Math.round(context.solar.sunsetAzimuth)
      }°，建议优先选择朝西视野开阔的位置。`,
    );
  }

  return {
    generatedAt: now.toISOString(),
    date: context.date,
    location: context.location,
    theme: input.theme,
    weatherSummary,
    recommendedWindow: window ? { start: window.start, end: window.end } : null,
    sunriseAzimuth: context.solar.sunriseAzimuth,
    sunsetAzimuth: context.solar.sunsetAzimuth,
    spots,
    warnings,
  };
}
