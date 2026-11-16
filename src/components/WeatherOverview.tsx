import { AlertTriangle, Cloud, CloudSun, Droplets, Eye, Gauge, Thermometer, Umbrella, Wind } from "lucide-react";
import type { HourlyWeather, WeatherData } from "@/functions/shared/contracts";
import { formatObservedAt, formatTime, metric, shanghaiDate } from "@/src/lib/format";

const statusLabels = { OK: "实时", STALE: "缓存", UNCONFIGURED: "未配置", UNAVAILABLE: "暂不可用" };

function hoursForDate(hourly: HourlyWeather[], date: string) {
  return hourly.filter((entry) => entry.time.slice(0, 10) === date).slice(0, 24);
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

function weatherAlerts(hours: HourlyWeather[]) {
  const alerts: string[] = [];
  const rain = hours.find((entry) => (entry.precipitationProbability ?? 0) >= 70);
  if (rain) {
    alerts.push(`降水概率较高（${Math.round(rain.precipitationProbability ?? 0)}%，${formatTime(rain.time)}）`);
  }
  const heavy = hours.find((entry) => (entry.precipitation ?? 0) >= 5);
  if (heavy) {
    alerts.push(`小时降水较强（${heavy.precipitation?.toFixed(1)} mm，${formatTime(heavy.time)}）`);
  }
  const windy = hours.find((entry) => (entry.windSpeed ?? 0) >= 10);
  if (windy) {
    alerts.push(`风速较大（${metric(windy.windSpeed, "m/s", 1)}，${formatTime(windy.time)}）`);
  }
  const foggy = hours.find((entry) => entry.visibility !== null && entry.visibility < 2000);
  if (foggy) {
    alerts.push(`能见度低（${metric((foggy.visibility ?? 0) / 1000, "km", 1)}，${formatTime(foggy.time)}）`);
  }
  const cold = hours.find((entry) => entry.temperature !== null && entry.temperature <= -5);
  const hot = hours.find((entry) => entry.temperature !== null && entry.temperature >= 35);
  if (cold) alerts.push(`低温时段，注意电池续航与结露（${formatTime(cold.time)}）`);
  if (hot) alerts.push(`高温时段，注意设备散热与补水（${formatTime(hot.time)}）`);
  return alerts.slice(0, 4);
}

export function WeatherOverview({ weather, targetDate }: { weather: WeatherData; targetDate: string }) {
  const current = weather.current;
  const hours = hoursForDate(weather.hourly, targetDate);
  const reference = referenceHour(hours, targetDate);
  const alerts = weatherAlerts(hours);
  const hasLayers = reference !== null &&
    (reference.cloudHigh !== undefined || reference.cloudMid !== undefined || reference.cloudLow !== undefined);
  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-[var(--radius)] border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b border-border/70 px-5 py-4">
        <div className="flex items-center gap-2.5"><CloudSun className="size-5 text-primary" /><h2 className="font-semibold">此刻天气</h2></div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${weather.status === "OK" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-muted text-muted-foreground"}`}>{statusLabels[weather.status]}</span>
      </div>
      {current ? (
        <>
          <div className="grid gap-5 p-5 sm:grid-cols-[auto_1fr] sm:items-center">
            <div className="flex items-end gap-3">
              <span className="text-5xl font-light tracking-[-0.06em]">{current.temperature === null ? "—" : Math.round(current.temperature)}<span className="ml-1 text-2xl">°</span></span>
              <div className="pb-1"><p className="font-medium">{current.condition || "天气状况未知"}</p><p className="mt-1 text-xs text-muted-foreground">体感 {metric(current.feelsLike, "°C")}</p></div>
            </div>
            <div className="grid grid-cols-3 gap-x-3 gap-y-4 sm:justify-self-end sm:gap-x-6">
              <Metric icon={Droplets} label="湿度" value={metric(current.humidity, "%")} />
              <Metric icon={Cloud} label="云量" value={metric(current.cloud, "%")} />
              <Metric icon={Umbrella} label="降水" value={metric(current.precipitation, "mm", 1)} />
              <Metric icon={Wind} label="风" value={current.windSpeed === null ? "—" : `${current.windDirection} ${metric(current.windSpeed, "km/h")}`} />
              <Metric icon={Eye} label="能见度" value={metric(current.visibility === null ? null : current.visibility / 1000, "km")} />
              <Metric icon={Gauge} label="气压" value={metric(current.pressure, "hPa")} />
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/70 px-5 py-3 text-xs text-muted-foreground">
            <span>观测于 {formatObservedAt(current.observedAt)}</span>
            <span>{current.airQuality ? `空气质量 ${current.airQuality.aqi ?? "—"} ${current.airQuality.category ?? ""}` : "空气质量数据未提供"} · {weather.sources.join(" / ") || "来源未知"}</span>
          </div>
        </>
      ) : (
        <div className="grid min-h-44 place-items-center p-6 text-center"><div><CloudSun className="mx-auto mb-3 size-8 text-muted-foreground/50" /><p className="text-sm font-medium">实时天气暂不可用</p><p className="mt-1 max-w-md text-xs leading-5 text-muted-foreground">{weather.message ?? "天文时间与规则建议仍可正常使用，天气相关评分已暂停。"}</p></div></div>
      )}
      </section>

      {hasLayers && reference && (
        <section className="rounded-[var(--radius)] border border-border bg-card p-5 shadow-sm">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Cloud className="size-4 text-primary" />云层结构
            <span className="text-xs font-normal text-muted-foreground">{formatTime(reference.time)} 附近</span>
          </h3>
          <div className="mt-3 grid grid-cols-3 gap-3 text-center">
            <CloudLayer label="高云" value={reference.cloudHigh ?? null} tone="bg-slate-500/70" />
            <CloudLayer label="中云" value={reference.cloudMid ?? null} tone="bg-zinc-400/70" />
            <CloudLayer label="低云" value={reference.cloudLow ?? null} tone="bg-stone-400/70" />
          </div>
          <p className="mt-3 text-[11px] leading-5 text-muted-foreground">
            高云与中云承接低角度光，低云过多会遮挡太阳；分层数据来自 Open-Meteo，总云量仍以当前观测为准。
          </p>
        </section>
      )}

      <section className="rounded-[var(--radius)] border border-border bg-card p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold">天气变化</h3>
          <span className="text-[11px] text-muted-foreground">{hours.length ? `${hours.length} 小时逐时预报` : "所选日期暂无逐时数据"}</span>
        </div>
        {hours.length ? (
          <>
            <TemperatureChart hours={hours} />
            <CloudRainChart hours={hours} />
          </>
        ) : (
          <p className="mt-3 rounded-xl bg-muted/45 p-3 text-xs leading-5 text-muted-foreground">
            所选日期超出逐小时预报覆盖范围，未用其他日期数据代替。
          </p>
        )}
      </section>

      <section className="rounded-[var(--radius)] border border-border bg-card p-5 shadow-sm">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><AlertTriangle className="size-4 text-amber-500" />摄影天气提醒</h3>
        {alerts.length ? (
          <ul className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
            {alerts.map((alert) => <li key={alert}>· {alert}</li>)}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">所选日期暂无明显异常天气；仍请留意现场变化。</p>
        )}
      </section>

      {hours.length > 0 && (
        <section className="rounded-[var(--radius)] border border-border bg-card px-5 py-4 shadow-sm">
          <p className="mb-3 text-xs font-medium text-muted-foreground">逐小时明细（{hours.length} 小时）</p>
          <div className="scrollbar-none flex gap-2 overflow-x-auto pb-1">
            {hours.map((hour) => (
              <div key={hour.time} className="min-w-[78px] rounded-xl border border-border/60 bg-card px-2 py-3 text-center">
                <p className="text-xs text-muted-foreground">{formatTime(hour.time)}</p>
                <p className="mt-2 text-sm font-semibold">{metric(hour.temperature, "°")}</p>
                <p className="mt-1 truncate text-[11px] text-muted-foreground">{hour.condition || "—"}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">云 {metric(hour.cloud, "%")}</p>
                <p className="mt-1 text-[11px] text-sky-600 dark:text-sky-400">{hour.precipitationProbability === null ? "降水 —" : `降水 ${Math.round(hour.precipitationProbability)}%`}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function CloudLayer({ label, value, tone }: { label: string; value: number | null; tone: string }) {
  return (
    <div className="rounded-xl bg-muted/45 p-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value === null ? "—" : `${Math.round(value)}%`}</p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${value ?? 0}%` }} />
      </div>
    </div>
  );
}

function TemperatureChart({ hours }: { hours: HourlyWeather[] }) {
  const values = hours.map((entry) => entry.temperature).filter((value): value is number => value !== null);
  if (values.length < 2) {
    return <p className="mt-3 rounded-xl bg-muted/45 p-3 text-xs text-muted-foreground">所选日期温度数据不足，无法绘制变化曲线。</p>;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1, max - min);
  const width = 720;
  const height = 118;
  const x = (index: number) => 12 + (index / Math.max(1, hours.length - 1)) * (width - 24);
  const y = (value: number) => height - 16 - ((value - min) / span) * (height - 34);
  const points = hours.map((entry, index) =>
    entry.temperature === null ? null : `${x(index).toFixed(1)},${y(entry.temperature).toFixed(1)}`
  ).filter((point): point is string => point !== null).join(" ");
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>温度</span>
        <span className="tabular-nums">{min.toFixed(1)}° — {max.toFixed(1)}°</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="mt-1 h-auto w-full" role="img" aria-label="逐小时温度变化">
        <line x1="12" x2={width - 12} y1={y(min)} y2={y(min)} stroke="var(--border)" strokeDasharray="4 6" />
        <line x1="12" x2={width - 12} y1={y(max)} y2={y(max)} stroke="var(--border)" strokeDasharray="4 6" />
        <polyline points={points} fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {hours.map((entry, index) => index % 3 === 0 ? (
          <text key={entry.time} x={x(index)} y={height - 2} textAnchor="middle" fontSize="9" fill="var(--muted-foreground)">{formatTime(entry.time)}</text>
        ) : null)}
      </svg>
    </div>
  );
}

function CloudRainChart({ hours }: { hours: HourlyWeather[] }) {
  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span>云量与降水概率</span>
        <span className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1"><span className="size-2 rounded-sm bg-zinc-400/70" />云量</span>
          <span className="inline-flex items-center gap-1"><span className="size-2 rounded-sm bg-sky-500/60" />降水概率</span>
        </span>
      </div>
      <div className="mt-2 flex h-28 items-end gap-[3px]">
        {hours.map((entry) => (
          <div key={entry.time} className="flex h-full flex-1 items-end justify-center gap-[1px]" title={`${formatTime(entry.time)} 云量 ${entry.cloud ?? "—"}% 降水概率 ${entry.precipitationProbability ?? "—"}%`}>
            <div className="w-[45%] rounded-t-sm bg-zinc-400/60" style={{ height: `${Math.max(2, entry.cloud ?? 0)}%` }} />
            <div className="w-[45%] rounded-t-sm bg-sky-500/55" style={{ height: `${Math.max(2, entry.precipitationProbability ?? 0)}%` }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
        <span>{formatTime(hours[0].time)}</span>
        <span>{formatTime(hours[Math.floor(hours.length / 2)].time)}</span>
        <span>{formatTime(hours[hours.length - 1].time)}</span>
      </div>
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Thermometer; label: string; value: string }) {
  return <div className="min-w-0"><div className="flex items-center gap-1 text-[11px] text-muted-foreground"><Icon className="size-3.5" />{label}</div><p className="mt-1 truncate text-sm font-medium" title={value}>{value}</p></div>;
}
