import type { LocationPrecision, LocationResult } from "../shared/contracts.ts";
import { secretValue } from "../shared/env.ts";
import { fetchTrustedJson } from "./http.ts";

const AMAP_BASE_URL = "https://restapi.amap.com";
const AMAP_HOSTS = ["restapi.amap.com"] as const;
const CHINA = new Set(["中国", "中华人民共和国", "CHINA", "P.R. CHINA"]);
const MAX_LOCATIONS = 40;

export interface Coordinate {
  latitude: number;
  longitude: number;
}

export interface AmapSearchResult {
  status: "OK" | "UNCONFIGURED" | "UNAVAILABLE";
  locations: LocationResult[];
  message: string | null;
}

export interface AmapReverseResult {
  status: "OK" | "UNCONFIGURED" | "UNAVAILABLE";
  location: LocationResult | null;
  message: string | null;
}

function transformLatitude(longitude: number, latitude: number): number {
  let value = -100 + 2 * longitude + 3 * latitude + 0.2 * latitude * latitude +
    0.1 * longitude * latitude + 0.2 * Math.sqrt(Math.abs(longitude));
  value += (20 * Math.sin(6 * longitude * Math.PI) +
    20 * Math.sin(2 * longitude * Math.PI)) * 2 / 3;
  value += (20 * Math.sin(latitude * Math.PI) +
    40 * Math.sin(latitude / 3 * Math.PI)) * 2 / 3;
  value += (160 * Math.sin(latitude / 12 * Math.PI) +
    320 * Math.sin(latitude * Math.PI / 30)) * 2 / 3;
  return value;
}

function transformLongitude(longitude: number, latitude: number): number {
  let value = 300 + longitude + 2 * latitude + 0.1 * longitude * longitude +
    0.1 * longitude * latitude + 0.1 * Math.sqrt(Math.abs(longitude));
  value += (20 * Math.sin(6 * longitude * Math.PI) +
    20 * Math.sin(2 * longitude * Math.PI)) * 2 / 3;
  value += (20 * Math.sin(longitude * Math.PI) +
    40 * Math.sin(longitude / 3 * Math.PI)) * 2 / 3;
  value += (150 * Math.sin(longitude / 12 * Math.PI) +
    300 * Math.sin(longitude / 30 * Math.PI)) * 2 / 3;
  return value;
}

/** The standard GCJ-02 coverage bounds, not a precise administrative border test. */
export function isOutsideChina(latitude: number, longitude: number): boolean {
  return longitude < 72.004 || longitude > 137.8347 || latitude < 0.8293 ||
    latitude > 55.8271;
}

export function wgs84ToGcj02(latitude: number, longitude: number): Coordinate {
  if (
    !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
    isOutsideChina(latitude, longitude)
  ) {
    return { latitude, longitude };
  }
  const a = 6378245.0;
  const eccentricity = 0.00669342162296594323;
  let deltaLatitude = transformLatitude(longitude - 105, latitude - 35);
  let deltaLongitude = transformLongitude(longitude - 105, latitude - 35);
  const radLatitude = latitude / 180 * Math.PI;
  let magic = Math.sin(radLatitude);
  magic = 1 - eccentricity * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  deltaLatitude = deltaLatitude * 180 /
    ((a * (1 - eccentricity)) / (magic * sqrtMagic) * Math.PI);
  deltaLongitude = deltaLongitude * 180 /
    (a / sqrtMagic * Math.cos(radLatitude) * Math.PI);
  return {
    latitude: latitude + deltaLatitude,
    longitude: longitude + deltaLongitude,
  };
}

/** Iterative inverse with sub-meter convergence for normal GCJ-02 inputs. */
export function gcj02ToWgs84(latitude: number, longitude: number): Coordinate {
  if (
    !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
    isOutsideChina(latitude, longitude)
  ) {
    return { latitude, longitude };
  }
  let wgsLatitude = latitude;
  let wgsLongitude = longitude;
  for (let index = 0; index < 6; index++) {
    const converted = wgs84ToGcj02(wgsLatitude, wgsLongitude);
    wgsLatitude -= converted.latitude - latitude;
    wgsLongitude -= converted.longitude - longitude;
  }
  return { latitude: wgsLatitude, longitude: wgsLongitude };
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function parseGcjLocation(value: unknown): Coordinate | null {
  if (typeof value !== "string") return null;
  const [longitudeText, latitudeText, extra] = value.split(",");
  if (extra !== undefined) return null;
  const longitude = Number(longitudeText);
  const latitude = Number(latitudeText);
  if (
    !Number.isFinite(longitude) || !Number.isFinite(latitude) ||
    Math.abs(longitude) > 180 || Math.abs(latitude) > 90
  ) return null;
  return { latitude, longitude };
}

function roundCoordinate(value: number): number {
  return Number(value.toFixed(6));
}

function region(...values: unknown[]): string | undefined {
  const parts = values.map(text).filter((value): value is string =>
    value !== null
  )
    .filter((value, index, all) => all.indexOf(value) === index);
  return parts.length > 0 ? parts.join(" ") : undefined;
}

function isChineseLocation(country: unknown, gcj: Coordinate): boolean {
  const countryName = text(country);
  if (
    countryName && !CHINA.has(countryName.toUpperCase()) &&
    !CHINA.has(countryName)
  ) return false;
  return !isOutsideChina(gcj.latitude, gcj.longitude);
}

function unavailable(
  message: string,
): { status: "UNAVAILABLE"; message: string } {
  return { status: "UNAVAILABLE", message };
}

interface DistrictAncestors {
  province: string | null;
  city: string | null;
}

function districtLabel(name: string, ancestors: DistrictAncestors): string {
  const prefix = ancestors.city && ancestors.city !== name
    ? ancestors.city
    : ancestors.province && ancestors.province !== name
    ? ancestors.province
    : null;
  return prefix ? `${prefix}${name}` : name;
}

function districtArea(ancestors: DistrictAncestors): string | undefined {
  return region(
    ancestors.province,
    ancestors.city && ancestors.city !== ancestors.province
      ? ancestors.city
      : null,
  );
}

function collectDistricts(
  nodes: unknown[],
  ancestors: DistrictAncestors,
  locations: LocationResult[],
  seen: Set<string>,
): void {
  for (const value of nodes) {
    if (locations.length >= MAX_LOCATIONS) return;
    const node = record(value);
    if (!node) continue;
    const level = text(node.level);
    const name = text(node.name);
    if (!level || !name) continue;

    const nextAncestors: DistrictAncestors = { ...ancestors };
    if (level === "province") nextAncestors.province = name;
    if (level === "city") nextAncestors.city = name;

    if (level === "district") {
      const gcj = parseGcjLocation(node.center);
      if (!gcj || isOutsideChina(gcj.latitude, gcj.longitude)) continue;
      const adcode = text(node.adcode);
      const key = adcode ?? `${name}@${gcj.latitude},${gcj.longitude}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const wgs = gcj02ToWgs84(gcj.latitude, gcj.longitude);
      const area = districtArea(nextAncestors);
      locations.push({
        ...(adcode ? { id: adcode } : {}),
        name: districtLabel(name, nextAncestors),
        ...(area ? { region: area } : {}),
        latitude: roundCoordinate(wgs.latitude),
        longitude: roundCoordinate(wgs.longitude),
        precision: "DISTRICT",
        timezone: "Asia/Shanghai",
      });
      continue;
    }

    if (Array.isArray(node.districts)) {
      collectDistricts(node.districts, nextAncestors, locations, seen);
    }
  }
}

export async function searchLocations(
  query: string,
): Promise<AmapSearchResult> {
  const apiKey = secretValue("AMAP_API_KEY");
  if (!apiKey) {
    return {
      status: "UNCONFIGURED",
      locations: [],
      message: "位置搜索服务尚未配置，请稍后重试。",
    };
  }
  const keywords = query.trim();
  if (!keywords || keywords.length > 120) {
    return {
      status: "OK",
      locations: [],
      message: "请输入有效的中国城市或区县。",
    };
  }

  try {
    const payload = await fetchTrustedJson<unknown>({
      baseUrl: AMAP_BASE_URL,
      path: "/v3/config/district",
      allowedHosts: AMAP_HOSTS,
      query: {
        key: apiKey,
        keywords,
        subdistrict: "2",
        extensions: "base",
      },
      timeoutMs: 4_500,
      maxResponseBytes: 256 * 1024,
      retries: 1,
    });
    const root = record(payload);
    if (!root || root.status !== "1") {
      console.error(
        "amap_district_status",
        root?.status ?? "invalid",
        root?.info ?? "",
        root?.infocode ?? "",
      );
      return { ...unavailable("高德区县搜索暂不可用。"), locations: [] };
    }

    const locations: LocationResult[] = [];
    collectDistricts(
      Array.isArray(root.districts) ? root.districts : [],
      { province: null, city: null },
      locations,
      new Set(),
    );
    return {
      status: "OK",
      locations,
      message: locations.length > 0 ? null : "未找到中国境内匹配的区县。",
    };
  } catch (error) {
    console.error(
      "amap_district_error",
      error instanceof Error ? error.name : "unknown",
    );
    return {
      status: "UNAVAILABLE",
      locations: [],
      message: "高德区县搜索暂不可用。",
    };
  }
}

export async function reverseGeocode(
  latitude: number,
  longitude: number,
  precision: LocationPrecision = "GPS",
): Promise<AmapReverseResult> {
  const apiKey = secretValue("AMAP_API_KEY");
  if (!apiKey) {
    return {
      status: "UNCONFIGURED",
      location: null,
      message: "位置搜索服务尚未配置，请稍后重试。",
    };
  }
  if (
    !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 || Math.abs(longitude) > 180
  ) {
    return { status: "OK", location: null, message: "坐标无效。" };
  }
  if (isOutsideChina(latitude, longitude)) {
    return { status: "OK", location: null, message: "仅支持中国境内位置。" };
  }

  try {
    const gcj = wgs84ToGcj02(latitude, longitude);
    const payload = await fetchTrustedJson<unknown>({
      baseUrl: AMAP_BASE_URL,
      path: "/v3/geocode/regeo",
      allowedHosts: AMAP_HOSTS,
      query: {
        key: apiKey,
        location: `${gcj.longitude.toFixed(7)},${gcj.latitude.toFixed(7)}`,
        extensions: "base",
      },
      timeoutMs: 4_500,
      maxResponseBytes: 256 * 1024,
      retries: 1,
    });
    const root = record(payload);
    if (!root || root.status !== "1") {
      console.error(
        "amap_reverse_status",
        root?.status ?? "invalid",
        root?.info ?? "",
        root?.infocode ?? "",
      );
      return { ...unavailable("高德逆地理编码暂不可用。"), location: null };
    }
    const regeocode = record(root.regeocode);
    const component = record(regeocode?.addressComponent);
    if (
      !regeocode || !component || !isChineseLocation(component.country, gcj)
    ) {
      return {
        status: "OK",
        location: null,
        message: "未找到中国境内匹配位置。",
      };
    }
    const name = text(regeocode.formatted_address) ?? text(component.city) ??
      text(component.district) ?? text(component.province);
    if (!name) {
      return {
        status: "OK",
        location: null,
        message: "逆地理编码结果不完整。",
      };
    }

    const id = text(component.adcode);
    const area = region(
      component.province,
      component.city,
      component.district,
      component.township,
    );
    return {
      status: "OK",
      location: {
        ...(id ? { id } : {}),
        name,
        ...(area ? { region: area } : {}),
        latitude: roundCoordinate(latitude),
        longitude: roundCoordinate(longitude),
        precision,
        timezone: "Asia/Shanghai",
      },
      message: null,
    };
  } catch (error) {
    console.error(
      "amap_reverse_error",
      error instanceof Error ? error.name : "unknown",
    );
    return {
      status: "UNAVAILABLE",
      location: null,
      message: "高德逆地理编码暂不可用。",
    };
  }
}
