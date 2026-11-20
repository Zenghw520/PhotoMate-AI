import { useState } from "react";
import {
  Clock3,
  CloudSun,
  Compass,
  SunMedium,
  Sunrise,
  Sunset,
} from "lucide-react";
import type { PotentialScore } from "@/functions/shared/contracts";
import { Disclosure } from "@/src/components/Disclosure";
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
  const [open, setOpen] = useState(false);
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
    <article
      className={`group flex flex-col rounded-[var(--radius)] border bg-card p-5 shadow-sm transition duration-300 ${
        open
          ? "border-primary/30 shadow-md"
          : "border-border hover:border-primary/25 hover:shadow-md"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div
            className={`grid size-10 place-items-center rounded-2xl transition-transform duration-300 group-hover:-translate-y-0.5 ${
              isDawn
                ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                : "bg-orange-500/10 text-orange-600 dark:text-orange-400"
            }`}
          >
            <Icon className="size-5" />
          </div>
          <h3 className="mt-3 font-semibold">{isDawn ? "朝霞潜力" : "晚霞潜力"}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {scoreLabel(data.score)}
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

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-xl bg-muted/45 px-3 py-2">
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Compass className="size-3" aria-hidden="true" />推荐拍摄方向
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
        <p className="mt-2 flex items-start gap-1.5 rounded-xl bg-primary/[0.04] px-2.5 py-2 text-xs leading-5 text-muted-foreground">
          <Clock3 className="mt-0.5 size-3.5 shrink-0 text-primary" />
          <span>
            推荐 {formatTime(data.forecastWindow.start)} 拍摄；建议 {arrival} 前到达，面向
            {azimuth === null ? direction : compass(azimuth)} 寻找地景与构图。
          </span>
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
              窗口已过{score !== null ? " · 回算" : ""}
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
        context={isDawn ? "朝霞潜力" : "晚霞潜力"}
        className="mt-3"
        panelClassName="mt-2 space-y-3 rounded-xl bg-muted/40 p-3 ring-1 ring-inset ring-border/40"
      >
        <dl className="grid gap-x-6 sm:grid-cols-2">
          {data.basis.map((item) => (
            <div
              key={item.code}
              className="flex items-center justify-between gap-3 py-1 text-xs"
            >
              <dt className="font-medium">{item.label}</dt>
              <dd className="shrink-0 text-right tabular-nums text-muted-foreground">
                {item.value === null ? "缺失" : `${item.value}${item.unit}`}
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
        <p className="text-xs leading-4 text-muted-foreground">
          太阳角度用于锁定拍摄窗口和推荐方向；地形遮挡以现场为准。
        </p>
        {data.scoreMode !== "UNAVAILABLE" && data.missingFields.length > 0 && (
          <p className="flex items-start gap-1.5 border-t border-border/60 pt-2 text-xs leading-4 text-amber-700 dark:text-amber-400">
            <CloudSun className="mt-0.5 size-3.5 shrink-0" />
            缺少：{data.missingFields.map(missingFieldLabel).join("、")}。评分已按可用数据降级。
          </p>
        )}
        <p className="text-xs leading-4 text-muted-foreground">
          环境评分用于安排拍摄；置信度反映数据完整性与时效性。
        </p>
      </Disclosure>
    </article>
  );
}
