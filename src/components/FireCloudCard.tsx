import { useState } from "react";
import {
  Cloud,
  Compass,
  Flame,
  SunMedium,
  Sunrise,
  Sunset,
} from "lucide-react";
import type { FireCloudPrediction } from "@/functions/shared/contracts";
import { Disclosure } from "@/src/components/Disclosure";
import {
  compass,
  fireCloudLabel,
  formatMetricValue,
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
  const [open, setOpen] = useState(false);
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
  const hasLayers = data.outlook.cloudHigh !== null ||
    data.outlook.cloudMid !== null ||
    data.outlook.cloudLow !== null;
  const cloudHeadline = data.outlook.cloudCover === null
    ? null
    : `云量 ${Math.round(data.outlook.cloudCover)}%`;
  return (
    <article
      className={`group flex flex-col rounded-[var(--radius)] border bg-card p-5 shadow-sm transition duration-300 ${
        open
          ? "border-primary/30 shadow-md"
          : "border-border hover:border-primary/25 hover:shadow-md"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="mb-3 flex items-center gap-2">
            <span
              className={`grid size-10 place-items-center rounded-2xl transition-transform duration-300 group-hover:-translate-y-0.5 ${
                isDawn
                  ? "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                  : "bg-orange-500/10 text-orange-600 dark:text-orange-400"
              }`}
            >
              <Icon className="size-5" />
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
              <Flame className="size-3" />环境潜力
            </span>
          </div>
          <h3 className="font-semibold">
            {isDawn ? "日出火烧云" : "日落火烧云"}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {fireCloudLabel(data.score)} · {cloudHeadline
              ? `${cloudHeadline} · `
              : ""}观测方向 {direction}
          </p>
        </div>
        <div
          className="relative grid size-20 shrink-0 place-items-center rounded-full"
          style={{
            background: score === null
              ? "var(--muted)"
              : `conic-gradient(var(--primary) ${score * 3.6}deg, var(--muted) 0deg)`,
          }}
          role="img"
          aria-label={score === null ? "评分不可用" : `评分 ${score} 分`}
          title={score === null ? "评分不可用" : `评分 ${score} / 100`}
        >
          <div className="grid size-[4.25rem] place-items-center rounded-full bg-card ring-1 ring-inset ring-border/60">
            <span className="text-2xl font-semibold tabular-nums tracking-tight">
              {score ?? "—"}
            </span>
          </div>
        </div>
      </div>

      <p className="mt-4 min-h-10 text-sm leading-5 text-muted-foreground">
        {data.summary}
      </p>

      <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-xl bg-muted/45 px-3 py-2">
          <p className="text-xs text-muted-foreground">可能性</p>
          <p className="mt-1 text-xs font-semibold">
            {data.outlook.possibilityLabel}
          </p>
        </div>
        <div className="rounded-xl bg-muted/45 px-3 py-2">
          <p className="text-xs text-muted-foreground">鲜艳度</p>
          <p className="mt-1 text-xs font-semibold">
            {data.outlook.vividnessLabel}
            {data.outlook.vividness !== null && (
              <span className="ml-1 text-xs font-normal tabular-nums text-muted-foreground">
                {data.outlook.vividness}/100
              </span>
            )}
          </p>
        </div>
        <div className="rounded-xl bg-muted/45 px-3 py-2">
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Compass className="size-3" aria-hidden="true" />太阳方位
          </p>
          <p className="mt-1 text-xs font-semibold tabular-nums">{direction}</p>
        </div>
        <div className="rounded-xl bg-muted/45 px-3 py-2">
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <SunMedium className="size-3" aria-hidden="true" />太阳高度角
          </p>
          <p className="mt-1 text-xs font-semibold tabular-nums">
            {elevation === null ? "—" : `${elevation.toFixed(1)}°`}
          </p>
        </div>
      </div>

      {data.forecastWindow && (
        <p className="mt-2 rounded-xl bg-primary/[0.04] px-2.5 py-2 text-xs leading-5 text-muted-foreground">
          推荐 {formatTime(data.forecastWindow.start)} 拍摄；建议 {arrival} 前到达，面向
          {azimuth === null ? direction : compass(azimuth)} 寻找可被低角度光照亮的云层。
        </p>
      )}

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-border/70 pt-3 text-xs">
        <span className="flex flex-wrap items-center gap-1.5 text-muted-foreground">
          <span className="tabular-nums">
            {data.forecastWindow
              ? formatRange(data.forecastWindow.start, data.forecastWindow.end)
              : "对应预报窗口不可用"}
          </span>
          {isPastWindow && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              {data.score !== null ? "已过回算" : "已过"}
            </span>
          )}
        </span>
        <span
          className="shrink-0 rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground"
          title="置信度反映数据完整性与时效性"
        >
          置信度 {confidenceLabels[data.confidenceLevel]}
        </span>
      </div>

      <Disclosure
        open={open}
        onOpenChange={setOpen}
        label="查看预测依据"
        openLabel="收起预测依据"
        hint={`${data.basis.length} 项`}
        context={isDawn ? "日出火烧云" : "日落火烧云"}
        className="mt-3"
        panelClassName="mt-2 space-y-3 rounded-xl bg-muted/40 p-3 ring-1 ring-inset ring-border/40"
      >
        <div className="rounded-xl border border-border/60 bg-background/40 p-2.5">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-xs font-medium">
              <Cloud className="size-3.5 text-primary" />云量判断
            </p>
            {data.outlook.cloudCover !== null && (
              <span className="text-xs tabular-nums text-muted-foreground">
                总云量约 {Math.round(data.outlook.cloudCover)}%
              </span>
            )}
          </div>
          <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
            {data.outlook.cloudNote}
          </p>
          {hasLayers && (
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              {[
                {
                  label: "高云",
                  value: data.outlook.cloudHigh,
                  tone: "bg-slate-500/70",
                },
                {
                  label: "中云",
                  value: data.outlook.cloudMid,
                  tone: "bg-zinc-400/70",
                },
                {
                  label: "低云",
                  value: data.outlook.cloudLow,
                  tone: "bg-stone-400/70",
                },
              ].map((layer) => (
                <div
                  key={layer.label}
                  className="rounded-lg bg-background/60 px-2 py-1.5"
                >
                  <p className="text-xs text-muted-foreground">{layer.label}</p>
                  <p className="mt-0.5 text-xs font-semibold tabular-nums">
                    {percent(layer.value)}
                  </p>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full ${layer.tone}`}
                      style={{ width: `${layer.value ?? 0}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
          {data.outlook.aerosolOpticalDepth !== null && (
            <p className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span className="tabular-nums">
                气溶胶光学厚度 {data.outlook.aerosolOpticalDepth.toFixed(2)}
              </span>
              <span>越低越通透</span>
            </p>
          )}
          <p className="mt-1 text-xs leading-4 text-muted-foreground">
            可能性为环境条件分级。
          </p>
        </div>
        <dl className="grid gap-x-6 sm:grid-cols-2">
          {data.basis.map((item) => (
            <div
              key={item.code}
              className="flex items-center justify-between gap-3 py-1 text-xs"
            >
              <dt className="font-medium">{item.label}</dt>
              <dd className="shrink-0 text-right tabular-nums text-muted-foreground">
                {item.value === null
                  ? "缺失"
                  : formatMetricValue(item.value, item.unit)}
                {item.contribution !== null &&
                  ` · ${Math.round(item.contribution)}分`}
              </dd>
            </div>
          ))}
        </dl>
        <div className="grid grid-cols-2 gap-2 border-t border-border/60 pt-2 text-xs text-muted-foreground">
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
          <p className="flex items-start gap-1.5 border-t border-border/60 pt-2 text-xs leading-4 text-amber-700 dark:text-amber-400">
            <Flame className="mt-0.5 size-3.5 shrink-0" />
            缺少：{data.missingFields.map(missingFieldLabel).join("、")}。评分已按可用数据降级。
          </p>
        )}
        <p className="text-xs leading-4 text-muted-foreground">
          中高云适量、低云不挡光、空气通透时更有利于火烧云；缺少分层或气溶胶数据时评分会自动降级。
        </p>
      </Disclosure>
    </article>
  );
}
