import { errorResponse, HttpError } from "./errors.ts";
import { reverseGeocode, searchLocations } from "./providers/amap.ts";
import { getTodayPhotography } from "./services/today.ts";
import { analyzePhoto } from "./services/photo.ts";
import { generateCustomPlanResponse } from "./services/custom_plan.ts";
import type { DatabaseClient } from "./services/cache.ts";
import { secretValue } from "./shared/env.ts";
import {
  coordinates,
  customPlanRequest,
  photoAnalysisRequest,
  readJson,
  searchQuery,
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
            aiEnhancement: Boolean(secretValue("DEEPSEEK_API_KEY")),
            deepSeek: Boolean(secretValue("DEEPSEEK_API_KEY")),
            photoAnalysis: true,
            customPlans: true,
            database: Boolean(db),
          },
        }, { headers: { "Cache-Control": "no-store" } });
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
