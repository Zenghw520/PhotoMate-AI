import {
  ArrowRight,
  Cloud,
  Eye,
  Flame,
  Info,
  LoaderCircle,
  MapPin,
  Sparkles,
  Sunrise,
  Sunset,
} from "lucide-react";
import type { LocationResult, TodayResponse } from "@/functions/shared/contracts";
import { ErrorNotice } from "@/src/components/CapabilityNotice";
import { Skeleton } from "@/components/ui/skeleton";
import type { Failure } from "@/src/lib/errors";
import {
  compactLocationName,
  formatDate,
  formatObservedAt,
  formatTime,
  scoreLabel,
  shanghaiDate,
} from "@/src/lib/format";

const SAMPLE = {
  sunrise: "06:12",
  sunset: "17:36",
  golden: "16:40 — 17:36",
  cloud: "35%",
  visibility: "18 km",
  duskScore: 68,
  fireCloud: "可以关注",
};

export function ShootingPreview({
  data,
  location,
  loading,
  error,
  onRetry,
  onOpen,
  onNeedLocation,
}: {
  data: TodayResponse | null;
  location: LocationResult | null;
  loading: boolean;
  error: Failure | null;
  onRetry: () => void;
  onOpen: () => void;
  onNeedLocation: () => void;
}) {
  const pending = Boolean(location) && loading && !data;
  const sample = !location;
  const current = data?.weather.current ?? null;
  const golden = pickGoldenHour(data);
  const duskScore = sample ? SAMPLE.duskScore : data?.potential.dusk.score ?? null;
  const overall = sample ? 72 : data?.indices.overall ?? null;
  const sunriseText = sample
    ? SAMPLE.sunrise
    : data
    ? formatTime(data.solar.sunrise)
    : "—";
  const sunsetText = sample
    ? SAMPLE.sunset
    : data
    ? formatTime(data.solar.sunset)
    : "—";
  const goldenText = sample
    ? SAMPLE.golden
    : golden
    ? `${formatTime(golden.start)} — ${formatTime(golden.end)}`
    : "—";
  const cloudText = sample
    ? SAMPLE.cloud
    : current?.cloud === null || current === null
    ? "—"
    : `${Math.round(current.cloud)}%`;
  const visibilityText = sample
    ? SAMPLE.visibility
    : current?.visibility === null || current === null
    ? "—"
    : `${Math.round(current.visibility / 1000)} km`;
  const fireCloudText = sample
    ? SAMPLE.fireCloud
    : data
    ? `${data.fireCloud.dusk.outlook.possibilityLabel} · ${
      data.fireCloud.dusk.direction === "WEST" ? "西侧" : "东侧"
    }`
    : "—";
  const badge = sample
    ? "示例预览"
    : error && !data
    ? "暂不可用"
    : pending
    ? "获取中"
    : error
    ? "上次结果"
    : "真实数据";
  const progress = daylightProgress(data);

  return (
    <section
      className="flex h-full min-w-0 flex-col overflow-hidden rounded-[var(--radius)] border border-border bg-card/90 p-4 shadow-sm sm:p-5"
      aria-label="今日拍摄条件预览"
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">今日拍摄条件</p>
          <h2 className="mt-1 flex min-w-0 items-center gap-1.5 text-lg font-semibold tracking-tight">
            <MapPin className="size-4 shrink-0 text-primary" />
            <span className="min-w-0 truncate" title={location?.name ?? undefined}>
              {location ? (
                <>
                  <span className="sm:hidden">
                    {compactLocationName(location)}
                  </span>
                  <span className="hidden sm:inline">{location.name}</span>
                </>
              ) : (
                "尚未选择位置"
              )}
            </span>
          </h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {sample
              ? "以下日出日落、云量、能见度与评分均为示例，选择位置后显示真实结果。"
              : data
              ? `${formatDate(data.date)} · 实况与太阳方位实时计算`
              : error
              ? "当前没有可显示的条件数据。"
              : "正在获取当前位置的真实环境…"}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
            badge === "真实数据"
              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
              : badge === "暂不可用"
              ? "bg-destructive/10 text-destructive"
              : "bg-primary/10 text-primary"
          }`}
        >
          {badge}
        </span>
      </div>

      {error && !data && (
        <div className="mt-3">
          <ErrorNotice
            compact
            failure={error}
            onRetry={error.retryable ? onRetry : undefined}
            secondary={location ? undefined : { label: "选择位置", onClick: onNeedLocation }}
          />
        </div>
      )}

      {!error && pending && (
        <div className="mt-4 space-y-3" role="status" aria-live="polite">
          <span className="sr-only">正在获取拍摄条件</span>
          <Skeleton className="h-20 w-full rounded-2xl" />
          <div className="grid grid-cols-2 gap-2">
            <Skeleton className="h-16 rounded-xl" />
            <Skeleton className="h-16 rounded-xl" />
            <Skeleton className="h-16 rounded-xl" />
            <Skeleton className="h-16 rounded-xl" />
          </div>
        </div>
      )}

      {(!pending || Boolean(data)) && (!error || Boolean(data)) && (
        <>
          <SunArc
            progress={progress}
            className="mt-3 hidden sm:block"
          />
          <div className="mt-3 hidden items-center justify-between gap-2 rounded-xl bg-muted/45 px-3 py-2 text-xs sm:flex">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              黄金时刻
              {sample && (
                <span className="rounded-full bg-background px-2 py-0.5 text-xs text-muted-foreground">
                  示例
                </span>
              )}
            </span>
            <strong className="tabular-nums">{goldenText}</strong>
          </div>

          <div className="mt-3 grid grid-cols-4 gap-1.5 sm:mt-2 sm:grid-cols-2 sm:gap-2">
            <PreviewMetric icon={Sunrise} label="日出" value={sunriseText} />
            <PreviewMetric icon={Sunset} label="日落" value={sunsetText} />
            <PreviewMetric icon={Cloud} label="云量" value={cloudText} />
            <PreviewMetric icon={Eye} label="能见度" value={visibilityText} />
          </div>

          <div className="mt-2 flex items-center justify-between gap-2 rounded-xl bg-primary/[0.05] px-3 py-2 text-xs sm:hidden">
            <span className="truncate text-muted-foreground">
              黄金时刻 {goldenText}
            </span>
            <span className="shrink-0 font-medium text-primary">
              晚霞 {duskScore === null ? "—" : Math.round(duskScore)} · {scoreLabel(duskScore)}
              {sample ? " · 示例" : ""}
            </span>
          </div>

          <div className="mt-2 hidden rounded-xl border border-primary/15 bg-primary/[0.05] p-3 sm:block">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-medium">
                <Flame className="size-3.5 text-primary" />晚霞趋势
              </span>
              <span className="flex items-center gap-2">
                {sample && (
                  <span className="rounded-full bg-background px-2 py-0.5 text-xs text-muted-foreground">
                    示例
                  </span>
                )}
                <span className="text-xs font-medium text-primary">
                  {scoreLabel(duskScore)}
                </span>
              </span>
            </div>
            <div className="mt-1 flex items-end justify-between gap-2">
              <span className="text-2xl font-semibold tabular-nums">
                {duskScore === null ? "—" : Math.round(duskScore)}
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  / 100
                </span>
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {fireCloudText}
              </span>
            </div>
          </div>

          <div className="mt-auto flex flex-col items-start gap-2 pt-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
              <Sparkles className="size-3.5 text-primary" />
              综合摄影指数 {overall === null ? "—" : Math.round(overall)}
              {sample && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  示例
                </span>
              )}
            </span>
            {sample ? (
              <button
                type="button"
                onClick={onNeedLocation}
                className="inline-flex min-h-11 items-center gap-1 rounded-full px-3 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
              >
                选择位置<ArrowRight className="size-3.5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={onOpen}
                disabled={!data}
                className="inline-flex min-h-11 items-center gap-1 rounded-full bg-primary px-3.5 text-xs font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
              >
                查看完整条件<ArrowRight className="size-3.5" />
              </button>
            )}
          </div>

          <details className="pm-details mt-1 border-t border-border/60">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Info className="size-3.5" />评分说明
            </summary>
            <div className="pm-details-body pb-1 text-xs leading-5 text-muted-foreground">
              <p>
                摄影指数用于比较云量、降水、能见度与太阳方位；晚霞评分还会参考分层层云与气溶胶。指数用于比较条件，不是精确预报。
              </p>
              {sample ? (
                <p className="mt-1">
                  当前为示例数据，不代表真实预报；选择位置后会显示所选地点的实时结果。
                </p>
              ) : (
                <p className="mt-1">
                  数据时区：北京时间（Asia/Shanghai）· 页面生成于{" "}
                  {data ? formatObservedAt(data.generatedAt) : "—"} · 预报获取于{" "}
                  {data?.weather.forecastUpdatedAt
                    ? formatObservedAt(data.weather.forecastUpdatedAt)
                    : "随响应返回"}
                </p>
              )}
            </div>
          </details>
        </>
      )}

      {pending && !error && (
        <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-primary">
          <LoaderCircle className="size-3.5 animate-spin" />正在计算日出日落与晚霞趋势
        </p>
      )}
    </section>
  );
}

function PreviewMetric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Sunrise;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl bg-muted/45 px-2 py-1.5 sm:px-3 sm:py-2">
      <p className="flex items-center gap-1 text-xs text-muted-foreground">
        <Icon className="size-3.5" />{label}
      </p>
      <p className="mt-0.5 text-xs font-semibold tabular-nums sm:mt-1 sm:text-sm">{value}</p>
    </div>
  );
}

function pickGoldenHour(data: TodayResponse | null) {
  if (!data || data.solar.goldenHours.length === 0) return null;
  if (data.date !== shanghaiDate(0)) return data.solar.goldenHours[0];
  const now = Date.now();
  return data.solar.goldenHours.find((window) => Date.parse(window.end) >= now) ??
    data.solar.goldenHours[0];
}

function daylightProgress(data: TodayResponse | null) {
  if (!data || data.date !== shanghaiDate(0)) return 0.62;
  const start = data.solar.sunrise ? Date.parse(data.solar.sunrise) : NaN;
  const end = data.solar.sunset ? Date.parse(data.solar.sunset) : NaN;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return 0.62;
  }
  const ratio = (Date.now() - start) / (end - start);
  return Math.min(0.94, Math.max(0.06, ratio));
}

function SunArc({
  progress,
  className = "",
}: {
  progress: number;
  className?: string;
}) {
  const x = (1 - progress) * (1 - progress) * 8 +
    2 * (1 - progress) * progress * 160 + progress * progress * 312;
  const y = (1 - progress) * (1 - progress) * 100 +
    2 * (1 - progress) * progress * -30 + progress * progress * 100;
  return (
    <svg
      viewBox="0 0 320 110"
      className={`h-24 w-full ${className}`}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="pm-sun-arc" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.15" />
          <stop offset="50%" stopColor="var(--color-primary)" stopOpacity="0.75" />
          <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0.15" />
        </linearGradient>
      </defs>
      <line
        x1="8"
        y1="100"
        x2="312"
        y2="100"
        className="text-border"
        stroke="currentColor"
        strokeWidth="1"
      />
      <path
        d="M8 100 Q160 -30 312 100"
        fill="none"
        stroke="url(#pm-sun-arc)"
        strokeWidth="2"
        strokeDasharray="4 6"
        strokeLinecap="round"
      />
      <circle cx={x} cy={y} r="14" className="fill-primary/15" />
      <circle cx={x} cy={y} r="6" className="fill-primary" />
    </svg>
  );
}
