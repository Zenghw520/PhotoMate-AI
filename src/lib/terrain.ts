const ZOOM = 11;
const TILE_SIZE = 256;
const EARTH_RADIUS = 6_371_000;
const SAMPLE_DISTANCES = [
  150,
  300,
  600,
  1_000,
  1_500,
  2_500,
  4_000,
  6_000,
  9_000,
  12_000,
];
const AZIMUTH_STEP = 5;
const CACHE_MS = 10 * 60 * 1000;

export interface HorizonPoint {
  azimuth: number;
  elevation: number;
}

export interface TerrainHorizon {
  profile: HorizonPoint[];
  cameraElevation: number;
  coverageMeters: number;
  loadedTiles: number;
  totalTiles: number;
}

export class TerrainError extends Error {
  constructor(
    public code: "UNCONFIGURED" | "UNAVAILABLE" | "INVALID_DATA" | "NETWORK",
    message: string,
  ) {
    super(message);
  }
}

interface TilePixels {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
}

const tileCache = new Map<string, Promise<TilePixels | null>>();
const horizonCache = new Map<string, { at: number; value: TerrainHorizon }>();

function lonToTileX(longitude: number, zoom: number) {
  return (longitude + 180) / 360 * 2 ** zoom;
}

function latToTileY(latitude: number, zoom: number) {
  const rad = latitude * Math.PI / 180;
  return (1 -
      Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) /
    2 * 2 ** zoom;
}

function tileKey(z: number, x: number, y: number) {
  return `${z}/${x}/${y}`;
}

async function loadTile(
  z: number,
  x: number,
  y: number,
  signal?: AbortSignal,
): Promise<TilePixels | null> {
  const key = tileKey(z, x, y);
  const cached = tileCache.get(key);
  if (cached) return await cached;
  const promise = (async () => {
    let response: Response;
    try {
      response = await fetch(
        `/functions/v1/app/terrain/tile?z=${z}&x=${x}&y=${y}`,
        { signal },
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw error;
      }
      throw new TerrainError("NETWORK", "无法连接星图地形服务。");
    }
    if (!response.ok) {
      let code: "UNCONFIGURED" | "UNAVAILABLE" = response.status === 503
        ? "UNCONFIGURED"
        : "UNAVAILABLE";
      try {
        const body = await response.json() as {
          error?: { code?: string };
        };
        if (body.error?.code === "TERRAIN_UNCONFIGURED") {
          code = "UNCONFIGURED";
        }
      } catch {
        // Binary or empty error response; keep the status-based code.
      }
      throw new TerrainError(
        code,
        code === "UNCONFIGURED"
          ? "星图地球地形 Token 尚未配置。"
          : "星图地形服务暂不可用。",
      );
    }
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) {
        throw new TerrainError("INVALID_DATA", "浏览器无法解析地形瓦片。");
      }
      context.drawImage(bitmap, 0, 0);
      const image = context.getImageData(0, 0, canvas.width, canvas.height);
      return {
        width: canvas.width,
        height: canvas.height,
        pixels: image.data,
      };
    } finally {
      bitmap.close();
    }
  })();
  tileCache.set(key, promise);
  promise.catch(() => tileCache.delete(key));
  return await promise;
}

function decodeElevation(pixels: Uint8ClampedArray, offset: number) {
  const red = pixels[offset];
  const green = pixels[offset + 1];
  const blue = pixels[offset + 2];
  const value = -10000 + (red * 65536 + green * 256 + blue) * 0.1;
  return Number.isFinite(value) && value >= -500 && value <= 9000
    ? value
    : null;
}

function destination(
  latitude: number,
  longitude: number,
  bearingDegrees: number,
  distanceMeters: number,
) {
  const rad = Math.PI / 180;
  const angular = distanceMeters / EARTH_RADIUS;
  const bearing = bearingDegrees * rad;
  const latitude1 = latitude * rad;
  const longitude1 = longitude * rad;
  const latitude2 = Math.asin(
    Math.sin(latitude1) * Math.cos(angular) +
      Math.cos(latitude1) * Math.sin(angular) * Math.cos(bearing),
  );
  const longitude2 = longitude1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angular) * Math.cos(latitude1),
      Math.cos(angular) - Math.sin(latitude1) * Math.sin(latitude2),
    );
  return {
    latitude: latitude2 / rad,
    longitude: ((longitude2 / rad + 540) % 360) - 180,
  };
}

function tileForPoint(latitude: number, longitude: number) {
  const x = lonToTileX(longitude, ZOOM);
  const y = latToTileY(latitude, ZOOM);
  return {
    tileX: Math.floor(x),
    tileY: Math.floor(y),
    pixelX: Math.min(TILE_SIZE - 1, Math.floor((x % 1) * TILE_SIZE)),
    pixelY: Math.min(TILE_SIZE - 1, Math.floor((y % 1) * TILE_SIZE)),
  };
}

function sampleElevation(
  tiles: Map<string, TilePixels | null>,
  latitude: number,
  longitude: number,
) {
  const point = tileForPoint(latitude, longitude);
  const tile = tiles.get(tileKey(ZOOM, point.tileX, point.tileY));
  if (!tile) return null;
  let sum = 0;
  let count = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const x = Math.min(tile.width - 1, Math.max(0, point.pixelX + dx));
      const y = Math.min(tile.height - 1, Math.max(0, point.pixelY + dy));
      const value = decodeElevation(tile.pixels, (y * tile.width + x) * 4);
      if (value !== null) {
        sum += value;
        count++;
      }
    }
  }
  return count ? sum / count : null;
}

export function horizonAt(profile: HorizonPoint[], azimuth: number) {
  if (profile.length === 0) return null;
  const normalized = ((azimuth % 360) + 360) % 360;
  const index = normalized / AZIMUTH_STEP;
  const lower = Math.floor(index) % profile.length;
  const upper = (lower + 1) % profile.length;
  const ratio = index - Math.floor(index);
  return profile[lower].elevation * (1 - ratio) +
    profile[upper].elevation * ratio;
}

export async function loadTerrainHorizon(
  latitude: number,
  longitude: number,
  signal?: AbortSignal,
): Promise<TerrainHorizon> {
  const cacheKey = `${latitude.toFixed(2)},${longitude.toFixed(2)}`;
  const cached = horizonCache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;

  const centerX = Math.floor(lonToTileX(longitude, ZOOM));
  const centerY = Math.floor(latToTileY(latitude, ZOOM));
  const center = await loadTile(ZOOM, centerX, centerY, signal);
  if (!center) {
    throw new TerrainError("INVALID_DATA", "中心地形瓦片为空。");
  }
  let validPixels = 0;
  for (let index = 0; index < center.width * center.height; index++) {
    if (decodeElevation(center.pixels, index * 4) !== null) validPixels++;
  }
  if (validPixels < center.width * center.height * 0.05) {
    throw new TerrainError(
      "INVALID_DATA",
      "地形瓦片无法识别为有效高程编码。",
    );
  }

  const tiles = new Map<string, TilePixels | null>();
  tiles.set(tileKey(ZOOM, centerX, centerY), center);
  const neighbors: Array<Promise<void>> = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const x = centerX + dx;
      const y = centerY + dy;
      neighbors.push(
        loadTile(ZOOM, x, y, signal)
          .then((tile) => {
            tiles.set(tileKey(ZOOM, x, y), tile);
          })
          .catch(() => {
            tiles.set(tileKey(ZOOM, x, y), null);
          }),
      );
    }
  }
  await Promise.all(neighbors);

  const cameraElevation = sampleElevation(tiles, latitude, longitude);
  if (cameraElevation === null) {
    throw new TerrainError("INVALID_DATA", "无法读取拍摄位置的高程。");
  }
  const profile: HorizonPoint[] = [];
  for (let azimuth = 0; azimuth < 360; azimuth += AZIMUTH_STEP) {
    let maximum = -90;
    for (const distance of SAMPLE_DISTANCES) {
      const point = destination(latitude, longitude, azimuth, distance);
      const elevation = sampleElevation(
        tiles,
        point.latitude,
        point.longitude,
      );
      if (elevation === null) continue;
      const curvatureDrop = distance * distance / (2 * EARTH_RADIUS);
      const angle = Math.atan2(
        elevation - cameraElevation - curvatureDrop,
        distance,
      ) * 180 / Math.PI;
      if (angle > maximum) maximum = angle;
    }
    profile.push({
      azimuth,
      elevation: Math.round(maximum * 10) / 10,
    });
  }
  const value: TerrainHorizon = {
    profile,
    cameraElevation: Math.round(cameraElevation * 10) / 10,
    coverageMeters: 12_000,
    loadedTiles: [...tiles.values()].filter((tile) => tile !== null).length,
    totalTiles: 9,
  };
  horizonCache.set(cacheKey, { at: Date.now(), value });
  return value;
}
