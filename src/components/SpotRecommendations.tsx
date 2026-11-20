import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  CalendarClock,
  Compass,
  Info,
  LoaderCircle,
  MapPin,
  Navigation,
  Sun,
  Sunrise,
  Sunset,
} from "lucide-react";
import type {
  LocationResult,
  SlotKind,
  SpotRecommendationsResponse,
  SpotScene,
  ThemeId,
  TimelineItem,
} from "@/functions/shared/contracts";
import { recommendPhotoSpots } from "@/src/lib/api";
import { ErrorNotice } from "@/src/components/CapabilityNotice";
import { describeFailure, type Failure } from "@/src/lib/errors";
import {
  compass,
  formatDate,
  formatRange,
} from "@/src/lib/format";
import {
  THEME_OPTIONS,
  type ShootingSpot,
} from "@/src/lib/shooting";

const RADIUS_OPTIONS = [
  { value: 5000, label: "5 km" },
  { value: 10000, label: "10 km" },
  { value: 20000, label: "20 km" },
];

const SCENE_OPTIONS: Array<{ value: SpotScene | "ALL"; label: string }> = [
  { value: "ALL", label: "全天" },
  { value: "SUNRISE", label: "日出" },
  { value: "SUNSET", label: "日落" },
];

function distanceText(meters: number) {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${meters} m`;
}

function sceneLabel(scene: SpotScene) {
  if (scene === "SUNRISE") return "日出场景";
  if (scene === "SUNSET") return "日落场景";
  return "白天场景";
}

export function SpotRecommendations({
  location,
  date,
  theme,
  slot,
  onThemeChange,
  onPickSpot,
}: {
  location: LocationResult;
  date: string;
  theme: ThemeId;
  slot: TimelineItem | null;
  onThemeChange: (theme: ThemeId) => void;
  onPickSpot: (
    spot: ShootingSpot,
    target: "LIGHT" | "PLANS",
    slotKind?: SlotKind | null,
  ) => void;
}) {
  const [radius, setRadius] = useState(10000);
  const [scene, setScene] = useState<SpotScene | "ALL">("ALL");
  const [result, setResult] = useState<SpotRecommendationsResponse | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const slotKind = slot?.kind ?? null;

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setFailure(null);
    recommendPhotoSpots({
      location,
      theme,
      date,
      radiusMeters: radius,
      ...(scene === "ALL" ? {} : { scene }),
      ...(slotKind ? { slotKind } : {}),
    }, controller.signal)
      .then((response) => {
        if (!controller.signal.aborted) setResult(response);
      })
      .catch((reason) => {
        if (reason instanceof DOMException && reason.name === "AbortError") {
          return;
        }
        setFailure(describeFailure(reason, "spots"));
        setResult(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [location, theme, date, radius, scene, slotKind, retryToken]);

  const windowText = useMemo(() => {
    if (!result?.recommendedWindow) return "暂不可用";
    return formatRange(
      result.recommendedWindow.start,
      result.recommendedWindow.end,
    );
  }, [result]);

  return (
    <div className="space-y-4">
      <section className="rounded-[var(--radius)] border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">筛选机位</h3>
          <span className="text-xs text-muted-foreground">
            {formatDate(date)} · {location.name}
          </span>
        </div>

        <div className="mt-3 space-y-2.5">
          <FilterRow label="距离">
            {RADIUS_OPTIONS.map((item) => (
              <Chip
                key={item.value}
                active={radius === item.value}
                onClick={() => setRadius(item.value)}
              >
                {item.label}
              </Chip>
            ))}
          </FilterRow>
          <FilterRow label="题材">
            {THEME_OPTIONS.map((item) => (
              <Chip
                key={item.id}
                active={theme === item.id}
                onClick={() => onThemeChange(item.id)}
              >
                {item.label}
              </Chip>
            ))}
          </FilterRow>
          <FilterRow label="场景">
            {SCENE_OPTIONS.map((item) => (
              <Chip
                key={item.value}
                active={scene === item.value}
                onClick={() => setScene(item.value)}
              >
                {item.label}
              </Chip>
            ))}
          </FilterRow>
        </div>

        <p className="mt-3 text-xs leading-5 text-muted-foreground">
          按 POI 名称与类型匹配题材，再按距离排序；场景决定推荐窗口与机位朝向。筛选不会改变已选日期的预报范围。
        </p>
      </section>

      {loading && (
        <div
          className="flex items-center gap-2 text-xs font-medium text-primary"
          role="status"
          aria-live="polite"
        >
          <LoaderCircle className="size-4 animate-spin" />正在检索周边摄影点…
        </div>
      )}
      {failure && (
        <ErrorNotice
          failure={failure}
          onRetry={() => setRetryToken((value) => value + 1)}
        />
      )}

      {result && (
        <>
          <section className="rounded-[var(--radius)] border border-primary/20 bg-primary/[0.05] p-4 shadow-sm sm:p-5">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 font-medium text-primary">
                <Sun className="size-3" />
                {result.recommendedWindowLabel ?? "建议窗口"} · {windowText}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-muted-foreground">
                <Sunrise className="size-3" />日出{" "}
                {result.sunriseAzimuth === null
                  ? "待核实"
                  : `${compass(result.sunriseAzimuth)} ${
                    Math.round(result.sunriseAzimuth)
                  }°`}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-muted-foreground">
                <Sunset className="size-3" />日落{" "}
                {result.sunsetAzimuth === null
                  ? "待核实"
                  : `${compass(result.sunsetAzimuth)} ${
                    Math.round(result.sunsetAzimuth)
                  }°`}
              </span>
            </div>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              天气：{result.weatherSummary}
            </p>
            {result.warnings.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs leading-4 text-muted-foreground">
                {result.warnings.map((warning) => (
                  <li key={warning}>· {warning}</li>
                ))}
              </ul>
            )}
          </section>

          {result.spots.length === 0 && !loading && (
            <p className="rounded-2xl border border-dashed border-border bg-card/60 p-5 text-sm text-muted-foreground">
              当前距离与题材下没有匹配机位，可扩大半径或更换题材。
            </p>
          )}

          <div className="grid gap-3 lg:grid-cols-2">
            {result.spots.map((spot, index) => (
              <article
                key={spot.id}
                className="flex flex-col rounded-[var(--radius)] border border-border bg-card p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-1.5 text-xs font-medium text-primary">
                      <span>#{index + 1}</span>
                      <span className="text-muted-foreground">
                        {distanceText(spot.distanceMeters)}
                      </span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-foreground/80">
                        {sceneLabel(spot.scene)}
                      </span>
                    </p>
                    <h4 className="mt-1 truncate font-semibold" title={spot.name}>
                      {spot.name}
                    </h4>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {spot.address || spot.type || "地址未提供"}
                    </p>
                  </div>
                  <span
                    className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"
                    title={`题材匹配 ${spot.matchScore}`}
                  >
                    <span className="text-xs font-semibold tabular-nums">
                      {spot.matchScore}
                    </span>
                  </span>
                </div>

                <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                  <div className="rounded-xl bg-muted/45 px-2.5 py-2">
                    <p className="flex items-center gap-1 text-muted-foreground">
                      <Navigation className="size-3" />去程方向
                    </p>
                    <p className="mt-1 font-medium">
                      向{spot.direction} · {distanceText(spot.distanceMeters)}
                    </p>
                  </div>
                  <div className="rounded-xl bg-muted/45 px-2.5 py-2">
                    <p className="flex items-center gap-1 text-muted-foreground">
                      <Compass className="size-3" />到机位后相机朝向
                    </p>
                    <p className="mt-1 font-medium">{spot.cameraDirection}</p>
                  </div>
                </div>

                <p className="mt-2 flex items-start gap-1.5 rounded-xl bg-primary/[0.04] px-2.5 py-2 text-xs leading-5 text-muted-foreground">
                  <CalendarClock className="mt-0.5 size-3.5 shrink-0 text-primary" />
                  <span>
                    {spot.windowLabel
                      ? `${spot.windowLabel} · ${
                        spot.recommendedWindow
                          ? formatRange(
                            spot.recommendedWindow.start,
                            spot.recommendedWindow.end,
                          )
                          : "窗口暂不可用"
                      }`
                      : "窗口暂不可用"}
                    <span className="block text-xs">
                      题材匹配 {spot.matchScore} · {spot.matchReason}
                    </span>
                  </span>
                </p>

                <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                  <VerifyChip label="开放时间" value={spot.verification.opening} />
                  <VerifyChip label="通行" value={spot.verification.access} />
                  <VerifyChip label="遮挡" value={spot.verification.occlusion} />
                </div>

                <div className="mt-auto flex flex-wrap items-center gap-2 pt-3">
                  <button
                    type="button"
                    onClick={() =>
                      onPickSpot(toShootingSpot(spot), "LIGHT", spot.windowKind)}
                    className="inline-flex min-h-11 items-center gap-1 rounded-full bg-primary px-3.5 text-xs font-semibold text-primary-foreground transition hover:opacity-90"
                  >
                    用此机位看光线
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onPickSpot(toShootingSpot(spot), "PLANS", spot.windowKind)}
                    className="inline-flex min-h-11 items-center gap-1 rounded-full border border-border px-3 text-xs font-medium text-foreground transition hover:border-primary/40 hover:text-primary"
                  >
                    生成拍摄方案
                  </button>
                  <a
                    href={spot.mapUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex min-h-11 items-center gap-1 rounded-full px-2.5 text-xs font-medium text-primary transition hover:bg-primary/10"
                  >
                    高德导航<ArrowUpRight className="size-3" />
                  </a>
                  <span className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="size-3" />
                    {spot.latitude.toFixed(4)}, {spot.longitude.toFixed(4)}
                  </span>
                </div>
              </article>
            ))}
          </div>
        </>
      )}

      <p className="flex items-start gap-1.5 rounded-xl bg-muted/45 p-3 text-xs leading-5 text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        「去程方向」是从当前位置到机位的行进方向；「相机朝向」是到机位后的拍摄方向。开放时间、通行与遮挡没有可靠数据时统一标注「待核实」，出发前请电话或地图复核。
      </p>
    </div>
  );
}

function toShootingSpot(
  spot: SpotRecommendationsResponse["spots"][number],
): ShootingSpot {
  return {
    id: spot.id,
    name: spot.name,
    address: spot.address,
    latitude: spot.latitude,
    longitude: spot.longitude,
    precision: "MANUAL",
    source: "POI",
    mapUrl: spot.mapUrl,
  };
}

function FilterRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="w-8 shrink-0 text-xs text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`min-h-9 rounded-full px-3 text-xs font-medium transition ${
        active
          ? "bg-primary text-primary-foreground"
          : "bg-muted text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function VerifyChip({ label, value }: { label: string; value: string }) {
  const pending = value === "待核实";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${
        pending
          ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
          : "bg-muted text-muted-foreground"
      }`}
    >
      {label} {value}
    </span>
  );
}
