import { ChevronDown, Clock3, CloudSun, Sunrise, Sunset } from "lucide-react";
import type { PotentialScore } from "@/functions/shared/contracts";
import {
  compass,
  formatRange,
  formatTime,
  missingFieldLabel,
  scoreLabel,
} from "@/src/lib/format";

const confidenceLabels = { LOW: "较低", MEDIUM: "中等", HIGH: "较高" };

export function PotentialCard({
  type,
  data,
  eventTime,
  azimuth,
  elevation,
}: {
  type: "dawn" | "dusk";
  data: PotentialScore;
  eventTime: string | null;
  azimuth: number | null;
  elevation: number | null;
}) {
  const isDawn = type === "dawn";
  const Icon = isDawn ? Sunrise : Sunset;
  const score = data.score === null ? null : Math.round(data.score);
  const isPastWindow = data.forecastWindow
    ? Date.parse(data.forecastWindow.end) < Date.now()
    : false;
  const direction = azimuth === null
    ? isDawn ? "东方" : "西方"
    : `${compass(azimuth)} · ${Math.round(azimuth)}°`;
  const arrival = data.forecastWindow
    ? formatTime(
      new Date(Date.parse(data.forecastWindow.start) - 40 * 60_000)
        .toISOString(),
    )
    : null;
  return (
    <article className="group rounded-[var(--radius)] border border-border bg-card p-5 shadow-sm transition hover:border-primary/30">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className={`mb-3 grid size-10 place-items-center rounded-2xl ${isDawn ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" : "bg-orange-500/10 text-orange-600 dark:text-orange-400"}`}><Icon className="size-5" /></div>
          <h3 className="font-semibold">{isDawn ? "朝霞潜力" : "晚霞潜力"}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{scoreLabel(data.score)}</p>
        </div>
        <div className="relative grid size-20 shrink-0 place-items-center rounded-full" style={{ background: score === null ? "var(--muted)" : `conic-gradient(var(--primary) ${score * 3.6}deg, var(--muted) 0deg)` }}>
          <div className="grid size-[4.25rem] place-items-center rounded-full bg-card"><span className="text-2xl font-semibold tracking-tight">{score ?? "—"}</span></div>
        </div>
      </div>
      <p className="mt-4 min-h-10 text-sm leading-5 text-muted-foreground">{data.summary}</p>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-xl bg-muted/45 px-3 py-2">
          <p className="text-[10px] text-muted-foreground">推荐拍摄方向</p>
          <p className="mt-0.5 font-semibold">{direction}</p>
        </div>
        <div className="rounded-xl bg-muted/45 px-3 py-2">
          <p className="text-[10px] text-muted-foreground">太阳高度角</p>
          <p className="mt-0.5 font-semibold">
            {elevation === null ? "—" : `${elevation.toFixed(1)}°`}
          </p>
        </div>
      </div>
      {data.forecastWindow && (
        <p className="mt-2 flex items-center gap-1.5 text-[11px] leading-5 text-muted-foreground">
          <Clock3 className="size-3.5 shrink-0 text-primary" />
          推荐 {formatTime(data.forecastWindow.start)} 拍摄；建议 {arrival} 前到达，面向
          {azimuth === null ? direction : compass(azimuth)} 寻找地景与构图。
        </p>
      )}
      <div className="mt-4 flex items-center justify-between gap-3 border-t border-border/70 pt-3 text-xs">
        <span className="flex flex-wrap items-center gap-2 text-muted-foreground">
          {data.forecastWindow ? formatRange(data.forecastWindow.start, data.forecastWindow.end) : "对应预报窗口不可用"}
          {isPastWindow && <span className="rounded-full bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary">窗口已过{score !== null ? " · 回算" : ""}</span>}
        </span>
        <span className="shrink-0 rounded-full bg-muted px-2 py-1 font-medium text-muted-foreground" title="置信度反映数据完整性与新鲜度，不是霞光出现概率">置信度 {confidenceLabels[data.confidenceLevel]}</span>
      </div>
      <details className="group/detail mt-3">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between rounded-lg text-xs font-medium text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring">查看预测依据<ChevronDown className="size-3.5 transition group-open/detail:rotate-180" /></summary>
        <div className="mt-2 space-y-3 rounded-xl bg-muted/45 p-3">
          {data.basis.map((item) => (
            <div key={item.code} className="flex items-center justify-between gap-3 text-xs">
              <span className="font-medium">{item.label}</span>
              <span className="text-muted-foreground">{item.value === null ? "缺失" : `${item.value}${item.unit}`}{item.contribution !== null && ` · ${Math.round(item.contribution)}分`}</span>
            </div>
          ))}
          <div className="grid grid-cols-2 gap-2 border-t border-border/60 pt-2 text-[11px] text-muted-foreground">
            <span>太阳事件 {eventTime ? formatTime(eventTime) : "—"}</span>
            <span>
              太阳方位{" "}
              {azimuth === null
                ? "—"
                : `${Math.round(azimuth)}° ${compass(azimuth)}`}
            </span>
            <span>
              太阳高度 {elevation === null ? "—" : `${elevation.toFixed(1)}°`}
            </span>
            <span>窗口锚定日出/日落时刻</span>
          </div>
          <p className="text-[11px] leading-4 text-muted-foreground">
            太阳高度角与方位角用于锁定拍摄窗口和推荐方向，不参与气象权重；地形遮挡仍需现场确认。
          </p>
          {data.scoreMode !== "UNAVAILABLE" && data.missingFields.length > 0 && <p className="flex items-start gap-1.5 border-t border-border/60 pt-2 text-[11px] leading-4 text-amber-700 dark:text-amber-400"><CloudSun className="mt-0.5 size-3.5 shrink-0" />缺少：{data.missingFields.map(missingFieldLabel).join("、")}。评分已按可用数据降级。</p>}
          <p className="text-[11px] leading-4 text-muted-foreground">这是摄影环境评估，不是气象部门官方预报；置信度不代表霞光出现概率。</p>
        </div>
      </details>
    </article>
  );
}
