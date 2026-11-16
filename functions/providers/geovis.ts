import { secretValue } from "../shared/env.ts";

const SITE_ORIGIN = "https://photomate-ai-49anbs7e1nr.qoder.zone";

const TILE_SOURCES = [
  {
    host: "https://api.open.geovisearth.com",
    path: "/map/v1/terrain-rgb",
  },
  {
    host: "https://tiles1.geovisearth.com",
    path: "/base/v1/terrain-rgb",
  },
  {
    host: "https://tiles2.geovisearth.com",
    path: "/base/v1/terrain-rgb",
  },
  {
    host: "https://tiles3.geovisearth.com",
    path: "/base/v1/terrain-rgb",
  },
] as const;

export interface TerrainTileResult {
  status: "OK" | "UNCONFIGURED" | "UNAVAILABLE" | "INVALID";
  data: Uint8Array | null;
  contentType: string;
  message: string | null;
}

function validTile(z: number, x: number, y: number) {
  if (!Number.isInteger(z) || !Number.isInteger(x) || !Number.isInteger(y)) {
    return false;
  }
  if (z < 8 || z > 14) return false;
  const limit = 2 ** z;
  return x >= 0 && y >= 0 && x < limit && y < limit;
}

export async function getTerrainTile(
  z: number,
  x: number,
  y: number,
): Promise<TerrainTileResult> {
  if (!validTile(z, x, y)) {
    return {
      status: "INVALID",
      data: null,
      contentType: "",
      message: "地形瓦片坐标无效。",
    };
  }
  const token = secretValue("GEOVIS_EARTH_TOKEN");
  if (!token) {
    return {
      status: "UNCONFIGURED",
      data: null,
      contentType: "",
      message: "星图地球地形 Token 尚未配置。",
    };
  }
  const attempts: string[] = [];
  for (const source of TILE_SOURCES) {
    const sourceName = source.host.includes("api.open")
      ? "open"
      : source.host.match(/tiles(\d)/)?.[0] ?? "tiles";
    try {
      const url = `${source.host}${source.path}/${z}/${x}/${y}` +
        `?format=png&tmsIds=w&token=${encodeURIComponent(token)}`;
      const response = await fetch(url, {
        headers: {
          accept: "image/png",
          referer: `${SITE_ORIGIN}/`,
          origin: SITE_ORIGIN,
        },
        signal: AbortSignal.timeout(4_500),
      });
      if (!response.ok) {
        let detail = "";
        try {
          const text = (await response.text()).slice(0, 300);
          const parsed = JSON.parse(text) as {
            msg?: unknown;
            message?: unknown;
          };
          const message = parsed.msg ?? parsed.message;
          if (typeof message === "string") detail = message.slice(0, 40);
        } catch {
          // Non-JSON error body; keep only the status.
        }
        attempts.push(
          `${sourceName}:${response.status}${detail ? `(${detail})` : ""}`,
        );
        console.error(
          "geovis_terrain_tile_http",
          source.host,
          response.status,
          detail,
        );
        continue;
      }
      const length = Number(response.headers.get("content-length") ?? "0");
      if (length > 768 * 1024) {
        attempts.push(`${sourceName}:响应过大`);
        continue;
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length < 1024) {
        const text = new TextDecoder().decode(bytes).trim();
        if (text.startsWith("{")) {
          try {
            const parsed = JSON.parse(text) as {
              msg?: unknown;
              message?: unknown;
            };
            const message = parsed.msg ?? parsed.message;
            attempts.push(
              `${sourceName}:${
                typeof message === "string" ? message.slice(0, 40) : "JSON 错误"
              }`,
            );
            continue;
          } catch {
            // Fall through to the generic length check.
          }
        }
      }
      if (bytes.length < 100 || bytes.length > 768 * 1024) {
        attempts.push(`${sourceName}:响应为空`);
        continue;
      }
      const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 &&
        bytes[2] === 0x4e && bytes[3] === 0x47;
      const contentType = response.headers.get("content-type") ?? "";
      if (!isPng && !contentType.includes("image")) {
        attempts.push(`${sourceName}:非图片响应`);
        continue;
      }
      return {
        status: "OK",
        data: bytes,
        contentType: "image/png",
        message: null,
      };
    } catch (error) {
      const reason = error instanceof Error ? error.name : "unknown";
      attempts.push(`${sourceName}:${reason}`);
      console.error(
        "geovis_terrain_tile_failed",
        source.host,
        reason,
      );
    }
  }
  return {
    status: "UNAVAILABLE",
    data: null,
    contentType: "",
    message: attempts.length
      ? `星图地球地形服务暂不可用（${attempts.join("；")}）。`
      : "星图地球地形服务暂不可用。",
  };
}
