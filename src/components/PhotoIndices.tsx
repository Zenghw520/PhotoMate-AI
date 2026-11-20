import { useState } from "react";
import { Activity, Info, Sparkles } from "lucide-react";
import type {
  PhotographyIndexEntry,
  PhotographyIndices,
} from "@/functions/shared/contracts";
import { Disclosure } from "@/src/components/Disclosure";
import {
  formatObservedAt,
  formatTime,
  missingFieldLabel,
  scoreLabel,
} from "@/src/lib/format";

const confidenceLabels = { LOW: "较低", MEDIUM: "中等", HIGH: "较高" };

const statusLabels = {
  OK: "数据完整",
  PARTIAL: "部分字段缺失",
  UNAVAILABLE: "数据不足",
};

function barColor(score: number) {
  if (score >= 70) return "bg-emerald-500/75";
  if (score >= 45) return "bg-amber-500/75";
  return "bg-rose-500/60";
}

export function PhotoIndices({
  indices,
  forecastUpdatedAt,
  sources,
}: {
  indices: PhotographyIndices;
  forecastUpdatedAt?: string | null;
  sources: string[];
}) {
  const overall = indices.overall;
  const trend = indices.trend.filter((entry) => entry.score !== null);
  return (
    <div className="space-y-4">
      <section className="rounded-[var(--radius)] border border-border bg-card p-5 shadow-sm 2xl:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="flex items-center gap-2 font-semibold">
              <Sparkles className="size-4 text-primary" />今日综合摄影指数
            </h3>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              七个题材独立评分，基于当天逐小时天气与太阳窗口。
            </p>
          </div>
          <div
            className="relative grid size-24 shrink-0 place-items-center rounded-full"
            style={{
              background: overall === null
                ? "var(--muted)"
                : `conic-gradient(var(--primary) ${
                  overall * 3.6
                }deg, var(--muted) 0deg)`,
            }}
          >
            <div className="grid size-[5.25rem] place-items-center rounded-full bg-card text-center">
              <div>
                <p className="text-2xl font-semibold tracking-tight">
                  {overall === null ? "—" : Math.round(overall)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {overall === null ? "数据不足" : scoreLabel(overall)}
                </p>
              </div>
            </div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="rounded-full bg-muted px-2.5 py-1">
            置信度 {confidenceLabels[indices.confidence]}
          </span>
          <span className="rounded-full bg-muted px-2.5 py-1">
            {indices.entries.filter((entry) => entry.score !== null).length} /{" "}
            {indices.entries.length} 项有可用评分
          </span>
          <span className="rounded-full bg-muted px-2.5 py-1">
            可展开核对每个因子的数值与贡献
          </span>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          天气预报获取于{" "}
          {forecastUpdatedAt
            ? formatObservedAt(forecastUpdatedAt)
            : "未提供"}{" "}
          · 来源 {sources.join(" / ") || "未提供"}
        </p>
      </section>

      <section className="rounded-[var(--radius)] border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">分题材指数</h3>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              每个题材的光线窗口、云层、能见度、降水、风速、湿度与气溶胶权重不同。
            </p>
          </div>
          <span className="text-xs text-muted-foreground">
            点击“评分依据”展开
          </span>
        </div>
        <div className="mt-4 grid items-start gap-3 md:grid-cols-2">
          {indices.entries.map((entry) => (
            <IndexCard key={entry.id} entry={entry} />
          ))}
        </div>
      </section>

      {trend.length > 0 && (
        <section className="rounded-[var(--radius)] border border-border bg-card p-5 shadow-sm">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Activity className="size-4 text-primary" />全天光线窗口评分
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            风光题材各光线时段的评分变化，用于比较清晨、白天与傍晚；空白表示该时段缺少可用天气。
          </p>
          <div className="mt-4 overflow-x-auto">
            <div className="flex min-w-[32rem] items-end gap-2">
              {trend.map((entry) => (
                <div key={`${entry.time}-${entry.label}`} className="flex-1">
                  <div className="flex h-32 items-end">
                    <div
                      className={`w-full rounded-t-md ${
                        entry.score === null ? "bg-muted" : barColor(entry.score)
                      }`}
                      style={{ height: `${Math.max(4, entry.score ?? 0)}%` }}
                      title={`${entry.label} ${Math.round(entry.score ?? 0)} 分`}
                    />
                  </div>
                  <p className="mt-1 text-center text-xs tabular-nums text-muted-foreground">
                    {formatTime(entry.time)}
                  </p>
                  <p className="truncate text-center text-xs text-muted-foreground">
                    {entry.label}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="rounded-[var(--radius)] border border-border bg-card p-5 shadow-sm">
        <h3 className="text-sm font-semibold">评分依据</h3>
        <ul className="mt-3 space-y-2 text-xs leading-5 text-muted-foreground">
          {indices.basis.map((item) => <li key={item}>· {item}</li>)}
        </ul>
        <p className="mt-3 flex items-start gap-1.5 rounded-xl bg-muted/45 p-3 text-xs leading-5 text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          指数用于比较题材与时段；缺少真实天气的题材不评分，部分缺失的题材按剩余权重归一化并标注。
        </p>
      </section>
    </div>
  );
}

function IndexCard({ entry }: { entry: PhotographyIndexEntry }) {
  const [open, setOpen] = useState(false);
  return (
    <article
      className={`flex flex-col rounded-xl border p-3 transition duration-300 ${
        open
          ? "border-primary/30 bg-card shadow-sm"
          : "border-border/70 hover:border-primary/25"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium">{entry.label}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {entry.windowLabel}
          </p>
        </div>
        <div className="text-right">
          <span className="text-lg font-semibold tabular-nums">
            {entry.score === null ? "—" : Math.round(entry.score)}
          </span>
          <span className="ml-1 text-xs text-muted-foreground">/ 100</span>
        </div>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full ${
            entry.score === null ? "bg-muted" : barColor(entry.score)
          }`}
          style={{ width: `${entry.score ?? 0}%` }}
        />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <span className="rounded-full bg-muted px-2 py-0.5">
          置信度 {confidenceLabels[entry.confidence]}
        </span>
        <span className="rounded-full bg-muted px-2 py-0.5">
          {statusLabels[entry.status]}
        </span>
      </div>
      <p className="mt-2 text-xs leading-4 text-muted-foreground">
        {entry.note}
      </p>
      <Disclosure
        open={open}
        onOpenChange={setOpen}
        label="评分依据"
        openLabel="收起评分依据"
        context={entry.label}
        className="mt-2"
        panelClassName="mt-2 space-y-2 rounded-xl bg-muted/45 p-3"
      >
        {entry.basis.length ? (
          entry.basis.map((item) => (
            <div
              key={item.code}
              className="grid grid-cols-[1fr_auto] items-start gap-2 text-xs"
              title={item.explanation}
            >
              <span className="font-medium">{item.label}</span>
              <span className="text-right tabular-nums text-muted-foreground">
                {item.value === null ? "缺失" : `${item.value}${item.unit}`}
                {item.contribution !== null &&
                  ` · ${Math.round(item.contribution)} 分`}
              </span>
            </div>
          ))
        ) : (
          <p className="text-xs leading-4 text-muted-foreground">
            该题材没有可用的逐项天气数据。
          </p>
        )}
        {entry.missingFields.length > 0 && (
          <p className="border-t border-border/60 pt-2 text-xs leading-4 text-amber-700 dark:text-amber-400">
            缺少：{entry.missingFields.map(missingFieldLabel).join("、")}
            ，已按剩余权重归一化。
          </p>
        )}
      </Disclosure>
    </article>
  );
}
