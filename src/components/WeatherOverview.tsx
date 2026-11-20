import {
  AlertTriangle,
  ChevronDown,
  Cloud,
  CloudSun,
  Droplets,
  Eye,
  Gauge,
  Thermometer,
  Umbrella,
  Wind,
} from "lucide-react";
import type {
  HourlyWeather,
  TimelineItem,
  WeatherAlert,
  WeatherData,
} from "@/functions/shared/contracts";
import {
  formatDate,
  formatObservedAt,
  formatRange,
  formatTime,
  metric,
  shanghaiDate,
  summarizeMissingFields,
} from "@/src/lib/format";
import { windowGroupLabel } from "@/src/lib/shooting";
import { WeatherTrend } from "@/src/components/WeatherTrend";

const statusLabels = {
  OK: "实况正常",
  STALE: "短时缓存",
  UNCONFIGURED: "未配置",
  UNAVAILABLE: "暂不可用",
};

const alertTones = {
  WARNING: "border-rose-500/25 bg-rose-500/[0.05]",
  WATCH: "border-amber-500/25 bg-amber-500/[0.05]",
  INFO: "border-sky-500/20 bg-sky-500/[0.04]",
};

function hoursForDate(hourly: HourlyWeather[], date: string) {
  return hourly.filter((entry) => entry.time.slice(0, 10) === date).slice(0, 24);
}

function rollingHours(hourly: HourlyWeather[], date: string) {
  const dateStart = Date.parse(`${date}T00:00:00+08:00`);
  const nowHour = Math.floor(Date.now() / 3_600_000) * 3_600_000;
  const start = date === shanghaiDate(0)
    ? Math.max(dateStart, nowHour)
    : dateStart;
  return hourly
    .filter((entry) => Date.parse(entry.time) >= start)
    .slice(0, 72);
}

function referenceHour(hourly: HourlyWeather[], date: string) {
  if (hourly.length === 0) return null;
  if (date !== shanghaiDate(0)) {
    return hourly.find((entry) => entry.time.includes("T12:00")) ?? hourly[0];
  }
  const now = Date.now();
  return hourly.reduce((nearest, entry) =>
    Math.abs(Date.parse(entry.time) - now) <
        Math.abs(Date.parse(nearest.time) - now)
      ? entry
      : nearest
  );
}

export function WeatherOverview({
  weather,
  targetDate,
  alerts,
  slot,
}: {
  weather: WeatherData;
  targetDate: string;
  alerts: WeatherAlert[];
  slot: TimelineItem | null;
}) {
  const current = weather.current;
  const hours = hoursForDate(weather.hourly, targetDate);
  const forecastHours = rollingHours(weather.hourly, targetDate);
  const reference = referenceHour(hours, targetDate);
  const missing = summarizeMissingFields(weather.missingFields);
  const hasLayers = reference !== null &&
    (reference.cloudHigh !== undefined || reference.cloudMid !== undefined ||
      reference.cloudLow !== undefined);
  return (
    <div className="space-y-4">
      {slot && (
        <WindowDecision
          slot={slot}
          hourly={weather.hourly}
          targetDate={targetDate}
        />
      )}

      <section className="overflow-hidden rounded-[var(--radius)] border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <CloudSun className="size-5 text-primary" />
            <div>
              <h2 className="font-semibold">此刻天气</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {targetDate === shanghaiDate(0)
                  ? "实况观测与逐小时预报分开展示"
                  : `实况为当前观测；${formatDate(targetDate)}的预报见窗口指标与趋势`}
              </p>
            </div>
          </div>
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
              weather.status === "OK"
                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {statusLabels[weather.status]}
          </span>
        </div>
        {current ? (
          <>
            <div className="grid gap-5 p-5 sm:grid-cols-[auto_1fr] sm:items-center">
              <div className="flex items-end gap-3">
                <span className="text-5xl font-light tracking-[-0.06em]">
                  {current.temperature === null
                    ? "—"
                    : Math.round(current.temperature)}
                  <span className="ml-1 text-2xl">°</span>
                </span>
                <div className="pb-1">
                  <p className="font-medium">
                    {current.condition || "天气状况未知"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    体感 {metric(current.feelsLike, "°C")}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-3 sm:justify-self-end sm:gap-x-6">
                <Metric
                  icon={Droplets}
                  label="湿度"
                  value={metric(current.humidity, "%")}
                />
                <Metric
                  icon={Cloud}
                  label="云量"
                  value={metric(current.cloud, "%")}
                />
                <Metric
                  icon={Umbrella}
                  label="降水"
                  value={metric(current.precipitation, "mm", 1)}
                />
                <Metric
                  icon={Wind}
                  label="风"
                  value={current.windSpeed === null
                    ? "—"
                    : `${current.windDirection} ${metric(current.windSpeed, "km/h")}`}
                />
                <Metric
                  icon={Eye}
                  label="能见度"
                  value={metric(
                    current.visibility === null ? null : current.visibility / 1000,
                    "km",
                  )}
                />
                <Metric
                  icon={Gauge}
                  label="气压"
                  value={metric(current.pressure, "hPa")}
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/70 px-5 py-3 text-xs text-muted-foreground">
              <span>实况观测于 {formatObservedAt(current.observedAt)}</span>
              <span className="text-right">
                预报获取于{" "}
                {weather.forecastUpdatedAt
                  ? formatObservedAt(weather.forecastUpdatedAt)
                  : "未提供"}{" "}
                · {weather.sources.join(" / ") || "来源未知"}
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/70 px-5 py-2.5 text-xs text-muted-foreground">
              <span>
                {current.airQuality
                  ? `空气质量 ${current.airQuality.aqi ?? "—"} ${
                    current.airQuality.category ?? ""
                  }`
                  : "空气质量数据未提供"}
              </span>
              {missing.length > 0 && (
                <span className="text-amber-700 dark:text-amber-400">
                  缺失：{missing.join("、")}（按可用数据计算）
                </span>
              )}
            </div>
          </>
        ) : (
          <div className="grid min-h-44 place-items-center p-6 text-center">
            <div>
              <CloudSun className="mx-auto mb-3 size-8 text-muted-foreground/50" />
              <p className="text-sm font-medium">实时天气暂不可用</p>
              <p className="mt-1 max-w-md text-xs leading-5 text-muted-foreground">
                {weather.message ??
                  "天文时间与规则建议仍可正常使用，天气相关评分已暂停。"}
              </p>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-[var(--radius)] border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <AlertTriangle className="size-4 text-amber-500" />摄影天气提醒
          </h3>
          <span className="text-xs text-muted-foreground">
            根据所选日期真实逐小时变化生成
          </span>
        </div>
        {alerts.length ? (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {alerts.map((alert) => (
              <li
                key={alert.id}
                className={`rounded-xl border p-3 ${alertTones[alert.level]}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold">{alert.title}</p>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {alert.time ? formatTime(alert.time) : "全天"}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {alert.detail}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            天气变化平稳，按计划拍摄并留意现场光线。
          </p>
        )}
      </section>

      {hasLayers && reference && (
        <section className="rounded-[var(--radius)] border border-border bg-card p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Cloud className="size-4 text-primary" />云层结构
            </h3>
            <span className="text-xs font-normal text-muted-foreground">
              {formatTime(reference.time)} 附近 · 逐小时预报
            </span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
            <CloudLayer
              label="总云量"
              value={reference.cloud ?? null}
              tone="bg-primary/60"
            />
            <CloudLayer
              label="高云"
              value={reference.cloudHigh ?? null}
              tone="bg-slate-500/70"
            />
            <CloudLayer
              label="中云"
              value={reference.cloudMid ?? null}
              tone="bg-zinc-400/70"
            />
            <CloudLayer
              label="低云"
              value={reference.cloudLow ?? null}
              tone="bg-stone-400/70"
            />
          </div>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            高云和中云承接低角度光，低云过多会遮挡太阳。分层云量来自 MET Norway，总云量为多源合并后的逐小时值。
          </p>
        </section>
      )}

      <section className="rounded-[var(--radius)] border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">天气变化趋势</h3>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              预报数据，支持 24 / 48 / 72 小时与五项指标切换。
            </p>
          </div>
          <span className="text-xs text-muted-foreground">
            {forecastHours.length
              ? `覆盖未来 ${forecastHours.length} 小时`
              : "所选日期暂无逐时预报"}
          </span>
        </div>
        {forecastHours.length ? (
          <WeatherTrend
            hours={forecastHours}
            forecastUpdatedAt={weather.forecastUpdatedAt}
            sources={weather.sources}
          />
        ) : (
          <p className="mt-3 rounded-xl bg-muted/45 p-3 text-xs leading-5 text-muted-foreground">
            所选日期超出逐小时预报范围，按实际可用时段展示。
          </p>
        )}
      </section>

      {hours.length > 0 && (
        <details className="pm-details group rounded-[var(--radius)] border border-border bg-card px-5 py-4 shadow-sm">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-xs font-medium text-muted-foreground">
            逐小时明细（{hours.length} 小时）
            <ChevronDown className="size-4 transition group-open:rotate-180" />
          </summary>
          <div className="pm-details-body scrollbar-none mt-3 flex gap-2 overflow-x-auto pb-1">
            {hours.map((hour) => (
              <div
                key={hour.time}
                className="min-w-[78px] rounded-xl border border-border/60 bg-card px-2 py-3 text-center"
              >
                <p className="text-xs text-muted-foreground">
                  {formatTime(hour.time)}
                </p>
                <p className="mt-2 text-sm font-semibold">
                  {metric(hour.temperature, "°")}
                </p>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {hour.condition || "—"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  云 {metric(hour.cloud, "%")}
                </p>
                <p className="mt-1 text-xs text-sky-600 dark:text-sky-400">
                  {hour.precipitationProbability === null
                    ? "降水 —"
                    : `降水 ${Math.round(hour.precipitationProbability)}%`}
                </p>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function WindowDecision({
  slot,
  hourly,
  targetDate,
}: {
  slot: TimelineItem;
  hourly: HourlyWeather[];
  targetDate: string;
}) {
  const scoped = hoursInWindow(hourly, slot);
  const summary = summarizeWindow(scoped);
  const past = Date.parse(slot.end) < Date.now();
  return (
    <section className="overflow-hidden rounded-[var(--radius)] border border-primary/25 bg-primary/[0.04] shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-primary/15 px-5 py-4">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">所选拍摄窗口</p>
          <h2 className="mt-0.5 flex flex-wrap items-center gap-2 font-semibold">
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
              {windowGroupLabel(slot.kind)}
            </span>
            {slot.label}
            <span className="text-sm font-normal tabular-nums text-muted-foreground">
              {formatRange(slot.start, slot.end)}
            </span>
          </h2>
        </div>
        <span className="text-xs text-muted-foreground">
          {past ? "窗口已结束 · 按当日留存回算" : `${formatDate(targetDate)} 预报`}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4 sm:p-5">
        <DecisionMetric
          icon={Umbrella}
          label="降雨"
          value={summary.precipitationProbability === null
            ? "暂无数据"
            : `${Math.round(summary.precipitationProbability)}%`}
          hint={summary.precipitation === null
            ? "降水量暂无数据"
            : `约 ${summary.precipitation.toFixed(1)} mm`}
        />
        <DecisionMetric
          icon={Wind}
          label="阵风"
          value={summary.windGust === null
            ? "暂无数据"
            : `${summary.windGust.toFixed(1)} m/s`}
          hint={summary.windGust === null && summary.windSpeed !== null
            ? `风速 ${summary.windSpeed.toFixed(1)} m/s`
            : "取窗口内最大值"}
        />
        <DecisionMetric
          icon={Eye}
          label="能见度"
          value={summary.visibility === null
            ? "暂无数据"
            : `${(summary.visibility / 1000).toFixed(1)} km`}
          hint="取窗口内最低值"
        />
        <DecisionMetric
          icon={Cloud}
          label="总云量"
          value={summary.cloud === null
            ? "暂无数据"
            : `${Math.round(summary.cloud)}%`}
          hint="窗口内平均"
        />
      </div>

      <div className="grid grid-cols-3 gap-2 px-4 pb-4 sm:px-5 sm:pb-5">
        <CloudLayer label="高云" value={summary.cloudHigh} tone="bg-slate-500/70" />
        <CloudLayer label="中云" value={summary.cloudMid} tone="bg-zinc-400/70" />
        <CloudLayer label="低云" value={summary.cloudLow} tone="bg-stone-400/70" />
      </div>

      <p className="border-t border-primary/15 px-5 py-3 text-xs leading-5 text-muted-foreground">
        {scoped.length
          ? `指标来自窗口内 ${scoped.length} 个逐小时预报点；缺测字段显示「暂无数据」，不使用实况或相邻日期代替。`
          : "所选窗口没有逐小时预报覆盖，窗口指标暂不可用；请参考下方趋势或更换日期。"}
      </p>
    </section>
  );
}

function DecisionMetric({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Umbrella;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-xl bg-card/80 px-3 py-2.5">
      <p className="flex items-center gap-1 text-xs text-muted-foreground">
        <Icon className="size-3.5" />{label}
      </p>
      <p className="mt-1 text-sm font-semibold tabular-nums">{value}</p>
      <p className="mt-0.5 text-xs leading-4 text-muted-foreground">{hint}</p>
    </div>
  );
}

function hoursInWindow(hourly: HourlyWeather[], slot: TimelineItem) {
  const start = Date.parse(slot.start);
  const end = Date.parse(slot.end);
  const midpoint = (start + end) / 2;
  const scoped = hourly.filter((entry) => {
    const time = Date.parse(entry.time);
    return Number.isFinite(time) && time >= start - 15 * 60_000 &&
      time <= end + 15 * 60_000;
  });
  if (scoped.length) return scoped;
  const nearest = hourly.reduce<HourlyWeather | null>((best, entry) => {
    if (!best) return entry;
    return Math.abs(Date.parse(entry.time) - midpoint) <
        Math.abs(Date.parse(best.time) - midpoint)
      ? entry
      : best;
  }, null);
  return nearest ? [nearest] : [];
}

function summarizeWindow(hours: HourlyWeather[]) {
  const max = (key: "precipitationProbability" | "windGust" | "windSpeed") => {
    const values = hours
      .map((entry) => entry[key])
      .filter((value): value is number => value !== null && value !== undefined);
    return values.length ? Math.max(...values) : null;
  };
  const min = (key: "visibility") => {
    const values = hours
      .map((entry) => entry[key])
      .filter((value): value is number => value !== null);
    return values.length ? Math.min(...values) : null;
  };
  const avg = (key: "cloud" | "cloudHigh" | "cloudMid" | "cloudLow") => {
    const values = hours
      .map((entry) => entry[key])
      .filter((value): value is number => value !== null && value !== undefined);
    return values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : null;
  };
  const precipitation = hours
    .map((entry) => entry.precipitation)
    .filter((value): value is number => value !== null);
  return {
    precipitationProbability: max("precipitationProbability"),
    precipitation: precipitation.length
      ? precipitation.reduce((sum, value) => sum + value, 0)
      : null,
    windGust: max("windGust"),
    windSpeed: max("windSpeed"),
    visibility: min("visibility"),
    cloud: avg("cloud"),
    cloudHigh: avg("cloudHigh"),
    cloudMid: avg("cloudMid"),
    cloudLow: avg("cloudLow"),
  };
}

function CloudLayer({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | null;
  tone: string;
}) {
  return (
    <div className="rounded-xl bg-muted/45 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`mt-1 font-semibold tabular-nums ${
          value === null ? "text-xs text-muted-foreground" : "text-lg"
        }`}
      >
        {value === null ? "暂无数据" : `${Math.round(value)}%`}
      </p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full ${tone}`}
          style={{ width: `${value ?? 0}%` }}
        />
      </div>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Thermometer;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </div>
      <p className="mt-1 truncate text-sm font-medium" title={value}>
        {value}
      </p>
    </div>
  );
}
