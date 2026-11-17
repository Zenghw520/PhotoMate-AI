import { ChevronDown, Cloud, Sunrise, Sunset } from "lucide-react";
import type { FireCloudPrediction } from "@/functions/shared/contracts";
import {
  compass,
  fireCloudLabel,
  formatRange,
  formatTime,
  missingFieldLabel,
} from "@/src/lib/format";

const confidenceLabels = { LOW: "较低", MEDIUM: "中等", HIGH: "较高" };

function percent(value: number | null) {
  return value === null ? "—" : `${Math.round(value)}%`;
}

export function FireCloudCard({
  type,
  data,
  eventTime,
  azimuth,
  elevation,
}: {
  type: "dawn" | "dusk";
  data: FireCloudPrediction;
  eventTime: string | null;
  azimuth: number | null;
  elevation: number | null;
}) {
  const isDawn = type === "dawn";
  const Icon = isDawn ? Sunrise : Sunset;
  const score = data.score === null ? null : Math.round(data.score);
  const direction = azimuth === null
    ? isDawn ? "东方" : "西方"
    : `${compass(azimuth)} · ${Math.round(azimuth)}°`;
  const isPastWindow = data.forecastWindow
    ? Date.parse(data.forecastWindow.end) < Date.now()
    : false;
  const arrival = data.forecastWindow
    ? formatTime(
      new Date(Date.parse(data.forecastWindow.start) - 40 * 60_000)
        .toISOString(),
    )
    : null;
  return (
    <article className="pm-panel pm-corners p-5 transition-colors hover:border-[var(--ov-cold)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="mb-3 flex items-center gap-2">
            <span
              className={`grid size-10 place-items-center border border-border ${
                isDawn ? "text-[var(--ov-warning)]" : "text-primary"
              }`}
            >
              <Icon className="size-5" />
            </span>
            <span className="pm-mono border border-border px-2 py-1 text-primary">
              环境潜力
            </span>
          </div>
          <h3 className="pm-display text-2xl">
            {isDawn ? "日出火烧云" : "日落火烧云"}
          </h3>
          <p className="pm-mono mt-1.5 text-muted-foreground">
            {fireCloudLabel(data.score)} · 观测方向 {direction}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="pm-score">{score ?? "—"}</p>
          <p className="pm-mono mt-2 text-muted-foreground">/ 100</p>
        </div>
      </div>
      <p className="mt-4 min-h-10 text-sm leading-5 text-muted-foreground">
        {data.summary}
      </p>
      <div className="mt-4 grid grid-cols-2 gap-px bg-border text-xs">
        <div className="bg-card px-3 py-2">
          <p className="pm-mono text-muted-foreground">可能性</p>
          <p className="mt-1 font-semibold">{data.outlook.possibilityLabel}</p>
        </div>
        <div className="bg-card px-3 py-2">
          <p className="pm-mono text-muted-foreground">鲜艳度</p>
          <p className="mt-1 font-semibold">
            {data.outlook.vividnessLabel}
            {data.outlook.vividness !== null && (
              <span className="ml-1 text-[11px] font-normal text-muted-foreground">
                {data.outlook.vividness}/100
              </span>
            )}
          </p>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-px bg-border text-xs">
        <div className="bg-card px-3 py-2">
          <p className="pm-mono text-muted-foreground">太阳方位</p>
          <p className="mt-1 font-semibold">{direction}</p>
        </div>
        <div className="bg-card px-3 py-2">
          <p className="pm-mono text-muted-foreground">太阳高度角</p>
          <p className="mt-1 font-semibold">
            {elevation === null ? "—" : `${elevation.toFixed(1)}°`}
          </p>
        </div>
      </div>
      {data.forecastWindow && (
        <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
          推荐 {formatTime(data.forecastWindow.start)} 拍摄；建议 {arrival} 前到达，面向
          {azimuth === null ? direction : compass(azimuth)} 寻找可被低角度光照亮的云层。
        </p>
      )}
      <div className="mt-2 border border-border p-3">
        <p className="flex items-center gap-1.5 text-[11px] font-medium">
          <Cloud className="size-3.5 text-primary" />云量判断
        </p>
        <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
          {data.outlook.cloudCover !== null &&
            `总云量约 ${Math.round(data.outlook.cloudCover)}%。`}
          {data.outlook.cloudNote}
        </p>
        {(data.outlook.cloudHigh !== null ||
          data.outlook.cloudMid !== null ||
          data.outlook.cloudLow !== null) && (
          <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
            分层：高云 {percent(data.outlook.cloudHigh)} · 中云{" "}
            {percent(data.outlook.cloudMid)} · 低云{" "}
            {percent(data.outlook.cloudLow)}
          </p>
        )}
        {data.outlook.aerosolOpticalDepth !== null && (
          <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
            气溶胶光学厚度{" "}
            {data.outlook.aerosolOpticalDepth.toFixed(2)}（越低越通透）
          </p>
        )}
        <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
          可能性为环境条件分级，不是出现概率。
        </p>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-3 text-xs">
        <span className="text-muted-foreground">
          {data.forecastWindow
            ? formatRange(data.forecastWindow.start, data.forecastWindow.end)
            : "对应预报窗口不可用"}
          {isPastWindow && (data.score !== null ? " · 已过回算" : " · 已过")}
        </span>
        <span
          className="shrink-0 border border-border px-2 py-1 text-[10px] font-medium text-muted-foreground"
          title="置信度反映数据完整性与新鲜度，不是火烧云出现概率"
        >
          置信度 {confidenceLabels[data.confidenceLevel]}
        </span>
      </div>
      <details className="group/detail mt-3 border-t border-border pt-1">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-xs font-medium text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring">
          查看预测依据
          <ChevronDown className="size-3.5 transition group-open/detail:rotate-180" />
        </summary>
        <div className="mt-2 space-y-3 border border-border p-3">
          {data.basis.map((item) => (
            <div
              key={item.code}
              className="flex items-center justify-between gap-3 text-xs"
            >
              <span className="font-medium">{item.label}</span>
              <span className="text-muted-foreground">
                {item.value === null ? "缺失" : `${item.value}${item.unit}`}
                {item.contribution !== null &&
                  ` · ${Math.round(item.contribution)}分`}
              </span>
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
          {data.scoreMode !== "UNAVAILABLE" && data.missingFields.length > 0 && (
            <p className="flex items-start gap-1.5 border-t border-border/60 pt-2 text-[11px] leading-4 text-amber-700 dark:text-amber-400">
              <Cloud className="mt-0.5 size-3.5 shrink-0" />
              缺少：{data.missingFields.map(missingFieldLabel).join("、")}。评分已按可用数据降级。
            </p>
          )}
          <p className="text-[11px] leading-4 text-muted-foreground">
            火烧云需要中高云适量、低云不挡光且空气通透。分数是环境潜力，不是出现概率；缺少分层或气溶胶数据时评分会自动降级。
          </p>
        </div>
      </details>
    </article>
  );
}
