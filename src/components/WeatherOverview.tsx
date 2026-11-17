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
  WeatherAlert,
  WeatherData,
} from "@/functions/shared/contracts";
import {
  formatObservedAt,
  formatTime,
  metric,
  shanghaiDate,
  summarizeMissingFields,
} from "@/src/lib/format";
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
}: {
  weather: WeatherData;
  targetDate: string;
  alerts: WeatherAlert[];
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
      <section className="overflow-hidden rounded-[var(--radius)] border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <CloudSun className="size-5 text-primary" />
            <div>
              <h2 className="font-semibold">此刻天气</h2>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                实况观测数据，与逐小时预报分开标注
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
              <div className="grid grid-cols-3 gap-x-3 gap-y-4 sm:justify-self-end sm:gap-x-6">
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
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/70 px-5 py-2.5 text-[11px] text-muted-foreground">
              <span>
                {current.airQuality
                  ? `空气质量 ${current.airQuality.aqi ?? "—"} ${
                    current.airQuality.category ?? ""
                  }`
                  : "空气质量数据未提供"}
              </span>
              {missing.length > 0 && (
                <span className="text-amber-700 dark:text-amber-400">
                  缺失：{missing.join("、")}；未补造数值
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
          <span className="text-[11px] text-muted-foreground">
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
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {alert.time ? formatTime(alert.time) : "全天"}
                  </span>
                </div>
                <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                  {alert.detail}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            所选日期暂无明显异常天气变化；仍请留意现场云量与光线。
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
          <p className="mt-3 text-[11px] leading-5 text-muted-foreground">
            高云与中云承接低角度光，低云过多会遮挡太阳；分层数据来自 Open-Meteo，总云量为多源合并后的逐小时值。
          </p>
        </section>
      )}

      <section className="rounded-[var(--radius)] border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">天气变化趋势</h3>
            <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
              预报数据，支持 24 / 48 / 72 小时与五项指标切换。
            </p>
          </div>
          <span className="text-[11px] text-muted-foreground">
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
            所选日期超出逐小时预报覆盖范围，未用其他日期数据代替。
          </p>
        )}
      </section>

      {hours.length > 0 && (
        <details className="group rounded-[var(--radius)] border border-border bg-card px-5 py-4 shadow-sm">
          <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between text-xs font-medium text-muted-foreground">
            逐小时明细（{hours.length} 小时）
            <ChevronDown className="size-4 transition group-open:rotate-180" />
          </summary>
          <div className="scrollbar-none mt-3 flex gap-2 overflow-x-auto pb-1">
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
                <p className="mt-1 truncate text-[11px] text-muted-foreground">
                  {hour.condition || "—"}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  云 {metric(hour.cloud, "%")}
                </p>
                <p className="mt-1 text-[11px] text-sky-600 dark:text-sky-400">
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
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">
        {value === null ? "—" : `${Math.round(value)}%`}
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
      <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </div>
      <p className="mt-1 truncate text-sm font-medium" title={value}>
        {value}
      </p>
    </div>
  );
}
