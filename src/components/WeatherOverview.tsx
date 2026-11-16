import { Cloud, CloudSun, Droplets, Eye, Gauge, Thermometer, Umbrella, Wind } from "lucide-react";
import type { WeatherData } from "@/functions/shared/contracts";
import { formatObservedAt, formatTime, metric } from "@/src/lib/format";

const statusLabels = { OK: "实时", STALE: "缓存", UNCONFIGURED: "未配置", UNAVAILABLE: "暂不可用" };

export function WeatherOverview({ weather }: { weather: WeatherData }) {
  const current = weather.current;
  return (
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
      {weather.hourly.length > 0 && (
        <div className="border-t border-border/70 bg-muted/25 px-5 py-4">
          <p className="mb-3 text-xs font-medium text-muted-foreground">逐小时变化</p>
          <div className="scrollbar-none flex gap-2 overflow-x-auto pb-1">
            {weather.hourly.slice(0, 12).map((hour) => (
              <div key={hour.time} className="min-w-[70px] rounded-xl border border-border/60 bg-card px-2 py-3 text-center">
                <p className="text-xs text-muted-foreground">{formatTime(hour.time)}</p>
                <p className="mt-2 text-sm font-semibold">{metric(hour.temperature, "°")}</p>
                <p className="mt-1 truncate text-[11px] text-muted-foreground">{hour.condition || "—"}</p>
                <p className="mt-2 text-[11px] text-sky-600 dark:text-sky-400">{hour.precipitationProbability === null ? "降水 —" : `降水 ${hour.precipitationProbability}%`}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Thermometer; label: string; value: string }) {
  return <div className="min-w-0"><div className="flex items-center gap-1 text-[11px] text-muted-foreground"><Icon className="size-3.5" />{label}</div><p className="mt-1 truncate text-sm font-medium" title={value}>{value}</p></div>;
}
