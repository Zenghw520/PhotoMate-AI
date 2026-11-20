import { errorResponse, HttpError } from "./errors.ts";
import {
  gcj02ToWgs84,
  getStaticMap,
  reverseGeocode,
  searchLocations,
  searchPlaces,
} from "./providers/amap.ts";
import { getTerrainTile } from "./providers/geovis.ts";
import { getTodayPhotography } from "./services/today.ts";
import { analyzePhoto } from "./services/photo.ts";
import { generateCustomPlanResponse } from "./services/custom_plan.ts";
import { recommendSpots } from "./services/spots.ts";
import { compareWindows } from "./services/compare.ts";
import type { DatabaseClient } from "./services/cache.ts";
import { secretValue } from "./shared/env.ts";
import {
  compareRequest,
  coordinates,
  customPlanRequest,
  photoAnalysisRequest,
  readJson,
  searchQuery,
  spotRequest,
  todayRequest,
} from "./validation.ts";

function routePath(url: URL): string | null {
  const match = url.pathname.match(
    /^\/(?:functions\/v1\/)?(?:app|app-d[0-9a-f]{32})(\/.*)?$/,
  );
  return match ? match[1] || "/" : null;
}

function requireMethod(request: Request, expected: "GET" | "POST") {
  if (request.method !== expected) {
    throw new HttpError(
      405,
      "METHOD_NOT_ALLOWED",
      `此接口仅支持 ${expected} 请求。`,
    );
  }
}

function unavailable(
  code: string,
  message: string | null,
  configured: boolean,
): never {
  throw new HttpError(
    503,
    code,
    message ?? (configured ? "位置服务暂不可用。" : "位置服务尚未配置。"),
    configured,
  );
}

export function createHandler(db?: DatabaseClient) {
  return async (request: Request): Promise<Response> => {
    try {
      const url = new URL(request.url);
      const path = routePath(url);
      if (path === null) {
        throw new HttpError(404, "NOT_FOUND", "请求的接口不存在。");
      }

      if (path === "/health") {
        requireMethod(request, "GET");
        return Response.json({
          status: "OK",
          capabilities: {
            locationSearch: Boolean(secretValue("AMAP_API_KEY")),
            weather: true,
            openWeather: Boolean(secretValue("OPENWEATHER_API_KEY")),
            openMeteo: true,
            metNorway: true,
            spotRecommendation: Boolean(secretValue("AMAP_API_KEY")),
            terrain: Boolean(secretValue("GEOVIS_EARTH_TOKEN")),
            aiEnhancement: Boolean(secretValue("DEEPSEEK_API_KEY")),
            deepSeek: Boolean(secretValue("DEEPSEEK_API_KEY")),
            photoAnalysis: true,
            customPlans: true,
            database: Boolean(db),
          },
        }, { headers: { "Cache-Control": "no-store" } });
      }

      if (path === "/map/static") {
        requireMethod(request, "GET");
        const latitude = Number(url.searchParams.get("lat"));
        const longitude = Number(url.searchParams.get("lng"));
        const zoom = Number(url.searchParams.get("zoom") ?? "15");
        const tile = await getStaticMap(latitude, longitude, zoom);
        if (tile.status === "UNCONFIGURED") {
          throw new HttpError(503, "MAP_UNCONFIGURED", tile.message!, false);
        }
        if (tile.status === "INVALID") {
          throw new HttpError(400, "INVALID_COORDINATES", tile.message!);
        }
        if (tile.status === "UNAVAILABLE" || !tile.data) {
          throw new HttpError(502, "MAP_UNAVAILABLE", tile.message!, true);
        }
        return new Response(tile.data.buffer as ArrayBuffer, {
          headers: {
            "Content-Type": tile.contentType,
            "Cache-Control": "public, max-age=3600",
          },
        });
      }

      if (path === "/locations/search") {
        requireMethod(request, "GET");
        const { query, limit } = searchQuery(url);
        const result = await searchLocations(query);
        if (result.status === "UNCONFIGURED") {
          unavailable("LOCATION_UNCONFIGURED", result.message, false);
        }
        if (result.status === "UNAVAILABLE") {
          unavailable("LOCATION_UNAVAILABLE", result.message, true);
        }
        return Response.json(
          {
            locations: result.locations.slice(0, limit),
            ...(result.message ? { message: result.message } : {}),
          },
          { headers: { "Cache-Control": "no-store" } },
        );
      }

      if (path === "/locations/reverse") {
        requireMethod(request, "POST");
        const coords = coordinates(await readJson(request));
        const result = await reverseGeocode(coords.latitude, coords.longitude);
        if (result.status === "UNCONFIGURED") {
          unavailable("LOCATION_UNCONFIGURED", result.message, false);
        }
        if (result.status === "UNAVAILABLE") {
          unavailable("LOCATION_UNAVAILABLE", result.message, true);
        }
        if (!result.location) {
          throw new HttpError(
            404,
            "LOCATION_NOT_FOUND",
            result.message ?? "未找到匹配位置。",
          );
        }
        return Response.json(result.location, {
          headers: { "Cache-Control": "no-store" },
        });
      }

      if (path === "/terrain/tile") {
        requireMethod(request, "GET");
        const z = Number(url.searchParams.get("z"));
        const x = Number(url.searchParams.get("x"));
        const y = Number(url.searchParams.get("y"));
        const tile = await getTerrainTile(z, x, y);
        if (tile.status === "UNCONFIGURED") {
          throw new HttpError(503, "TERRAIN_UNCONFIGURED", tile.message!);
        }
        if (tile.status === "UNAVAILABLE") {
          throw new HttpError(502, "TERRAIN_UNAVAILABLE", tile.message!, true);
        }
        if (tile.status === "INVALID" || !tile.data) {
          throw new HttpError(
            400,
            "INVALID_TERRAIN_TILE",
            "地形瓦片坐标无效。",
          );
        }
        return new Response(tile.data.buffer as ArrayBuffer, {
          headers: {
            "Content-Type": tile.contentType,
            "Cache-Control": "public, max-age=604800, immutable",
          },
        });
      }

      if (path === "/locations/place") {
        requireMethod(request, "GET");
        const query = url.searchParams.get("q")?.trim() ?? "";
        if (query.length < 2 || query.length > 40) {
          throw new HttpError(
            400,
            "INVALID_QUERY",
            "地标名称需为 2～40 个字符。",
          );
        }
        const result = await searchPlaces(query, 8);
        if (result.status === "UNCONFIGURED") {
          unavailable("LOCATION_UNCONFIGURED", result.message, false);
        }
        if (result.status === "UNAVAILABLE") {
          unavailable("LOCATION_UNAVAILABLE", result.message, true);
        }
        return Response.json({
          places: result.places.map((place) => {
            const wgs = gcj02ToWgs84(place.gcj.latitude, place.gcj.longitude);
            return {
              id: place.id,
              name: place.name,
              address: place.address,
              type: place.type,
              region: [place.city, place.district].filter(Boolean).join(" "),
              latitude: wgs.latitude,
              longitude: wgs.longitude,
              mapUrl: `https://uri.amap.com/marker?position=${
                place.gcj.longitude.toFixed(6)
              },${place.gcj.latitude.toFixed(6)}&name=${
                encodeURIComponent(place.name)
              }&src=photomate&coordinate=gaode&callnative=0`,
            };
          }),
          ...(result.message ? { message: result.message } : {}),
        }, { headers: { "Cache-Control": "no-store" } });
      }

      if (path === "/windows/compare") {
        requireMethod(request, "POST");
        const input = compareRequest(await readJson(request));
        const result = await compareWindows(input, db);
        return Response.json(result, {
          headers: { "Cache-Control": "no-store" },
        });
      }

      if (path === "/locations/spots") {
        requireMethod(request, "POST");
        const input = spotRequest(await readJson(request));
        const result = await recommendSpots(input, db);
        return Response.json(result, {
          headers: { "Cache-Control": "no-store" },
        });
      }

      if (path === "/plans/custom") {
        requireMethod(request, "POST");
        const input = customPlanRequest(await readJson(request));
        const result = await generateCustomPlanResponse(input, db);
        return Response.json(result, {
          headers: { "Cache-Control": "no-store" },
        });
      }

      if (path === "/photo/analyze") {
        requireMethod(request, "POST");
        const input = photoAnalysisRequest(await readJson(request));
        const result = await analyzePhoto(input, db);
        return Response.json(result, {
          headers: { "Cache-Control": "no-store" },
        });
      }

      if (path === "/photography/today") {
        requireMethod(request, "POST");
        const input = todayRequest(await readJson(request));
        const result = await getTodayPhotography(
          input.location,
          input.theme,
          db,
          undefined,
          input.date,
        );
        return Response.json(result, {
          headers: { "Cache-Control": "no-store" },
        });
      }

      throw new HttpError(404, "NOT_FOUND", "请求的接口不存在。");
    } catch (error) {
      return errorResponse(error);
    }
  };
}
