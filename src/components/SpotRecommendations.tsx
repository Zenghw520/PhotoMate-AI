import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  Compass,
  Info,
  LoaderCircle,
  Navigation,
  Sun,
  Sunrise,
  Sunset,
} from "lucide-react";
import type {
  LocationResult,
  SpotRecommendationsResponse,
  ThemeId,
} from "@/functions/shared/contracts";
import { recommendPhotoSpots } from "@/src/lib/api";
import { compass, formatDate, formatRange } from "@/src/lib/format";

const THEMES: Array<{ id: ThemeId; label: string }> = [
  { id: "LANDSCAPE", label: "风光" },
  { id: "PORTRAIT", label: "人像" },
  { id: "ARCHITECTURE", label: "建筑" },
  { id: "STREET", label: "街头" },
  { id: "FOOD", label: "美食" },
  { id: "NIGHT", label: "夜景" },
  { id: "TRAVEL", label: "旅行" },
];

const DAY_OPTIONS = [
  { offset: 0, label: "今天" },
  { offset: 1, label: "明天" },
  { offset: 2, label: "后天" },
];

function distanceText(meters: number) {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${meters} m`;
}

export function SpotRecommendations({
  location,
  date,
  dayOffset,
  onDayChange,
}: {
  location: LocationResult;
  date: string;
  dayOffset: number;
  onDayChange: (offset: number) => void;
}) {
  const [theme, setTheme] = useState<ThemeId>("LANDSCAPE");
  const [result, setResult] = useState<SpotRecommendationsResponse | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    recommendPhotoSpots({ location, theme, date }, controller.signal)
      .then(setResult)
      .catch((reason) => {
        if (reason instanceof DOMException && reason.name === "AbortError") {
          return;
        }
        setError(
          reason instanceof Error ? reason.message : "地点推荐暂不可用。",
        );
        setResult(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [location, theme, date]);

  return (
    <div className="space-y-4">
      <section className="pm-panel p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
          <div
            role="group"
            aria-label="查询日期"
            className="flex gap-2"
          >
            {DAY_OPTIONS.map((item) => (
              <button
                key={item.offset}
                type="button"
                aria-pressed={dayOffset === item.offset}
                onClick={() => onDayChange(item.offset)}
                className="pm-chip min-h-10 px-3.5"
              >
                {item.label}
              </button>
            ))}
          </div>
          <span className="pm-mono text-muted-foreground">
            {formatDate(date)}
          </span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {THEMES.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={theme === item.id}
              onClick={() => setTheme(item.id)}
              className="pm-chip min-h-9 px-3"
            >
              {item.label}
            </button>
          ))}
        </div>
        <p className="mt-3 text-[11px] leading-5 text-muted-foreground">
          依据「{location.name}」周边高德 POI 与当天太阳方位筛选；地图打开需要外部应用，
          页面不内嵌地图。
        </p>
      </section>

      {loading && (
        <div className="flex items-center gap-2 text-xs font-medium text-primary" role="status">
          <LoaderCircle className="size-4 animate-spin" />正在检索周边摄影点…
        </div>
      )}
      {error && (
        <div className="flex items-start gap-2 border border-destructive/30 bg-destructive/[0.05] p-4 text-sm" role="alert">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
          <span>{error}</span>
        </div>
      )}

      {result && (
        <>
          <section className="pm-panel border-l-2 border-l-primary p-5">
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <span className="inline-flex items-center gap-1 border border-border px-2.5 py-1 font-medium text-primary">
                <Sun className="size-3" />建议窗口{" "}
                {result.recommendedWindow
                  ? formatRange(
                    result.recommendedWindow.start,
                    result.recommendedWindow.end,
                  )
                  : "暂不可用"}
              </span>
              <span className="inline-flex items-center gap-1 border border-border px-2.5 py-1 text-muted-foreground">
                <Sunrise className="size-3" />日出方位{" "}
                {result.sunriseAzimuth === null
                  ? "—"
                  : `${compass(result.sunriseAzimuth)} ${
                    Math.round(result.sunriseAzimuth)
                  }°`}
              </span>
              <span className="inline-flex items-center gap-1 border border-border px-2.5 py-1 text-muted-foreground">
                <Sunset className="size-3" />日落方位{" "}
                {result.sunsetAzimuth === null
                  ? "—"
                  : `${compass(result.sunsetAzimuth)} ${
                    Math.round(result.sunsetAzimuth)
                  }°`}
              </span>
            </div>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              天气：{result.weatherSummary}
            </p>
            <ul className="mt-2 space-y-1 text-[11px] leading-4 text-muted-foreground">
              {result.warnings.map((warning) => <li key={warning}>· {warning}</li>)}
            </ul>
          </section>

          {result.spots.length === 0 && !loading && (
            <p className="border border-dashed border-border bg-card/60 p-5 text-sm text-muted-foreground">
              周边暂未找到匹配的摄影点，可换一个题材或更靠近城区的位置。
            </p>
          )}

          <div className="grid gap-3 lg:grid-cols-2">
            {result.spots.map((spot, index) => (
              <article key={spot.id} className="pm-panel p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="pm-mono font-medium text-primary">
                      #{index + 1} · {distanceText(spot.distanceMeters)} ·{" "}
                      {spot.direction}方向
                    </p>
                    <h3 className="pm-display mt-2 truncate text-xl">{spot.name}</h3>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {spot.address || spot.type || "地址未提供"}
                    </p>
                  </div>
                  <span className="grid size-9 shrink-0 place-items-center border border-border text-primary">
                    <Navigation className="size-4" />
                  </span>
                </div>
                <p className="mt-3 border border-border p-2.5 text-[11px] leading-4 text-muted-foreground">
                  {spot.sunNote}
                </p>
                <div className="mt-3 flex items-center justify-between gap-2 text-[11px]">
                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                    <Compass className="size-3.5" />{spot.latitude.toFixed(4)},{" "}
                    {spot.longitude.toFixed(4)}
                  </span>
                  <a
                    href={spot.mapUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-1 border border-border px-2.5 py-1 font-medium text-foreground transition hover:border-[var(--ov-cold)] hover:text-[var(--ov-cold)]"
                  >
                    在高德地图打开<ArrowUpRight className="size-3" />
                  </a>
                </div>
              </article>
            ))}
          </div>
        </>
      )}

      <p className="flex items-start gap-1.5 border border-border p-3 text-[11px] leading-5 text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        地点排序基于 POI 距离与题材关键词，不代表现场机位质量；未接入高德 JS API Key，
        因此不内嵌地图。出发前请核对开放时间、通行与地形遮挡。
      </p>
    </div>
  );
}
