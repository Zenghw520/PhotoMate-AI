import { Activity, ChevronDown, Info } from "lucide-react";
import type {
  PhotographyIndexEntry,
  PhotographyIndices,
} from "@/functions/shared/contracts";
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
  if (score >= 70) return "bg-[var(--ov-accent)]";
  if (score >= 45) return "bg-[var(--ov-warning)]";
  return "bg-[var(--ov-line)]";
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
      <section className="pm-panel pm-corners p-5 2xl:p-6">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-xl">
            <p className="pm-kicker">Composite / 07 Subjects</p>
            <h3 className="pm-display mt-2 text-3xl 2xl:text-4xl">
              今日综合摄影指数
            </h3>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              七个题材各自使用独立权重，全部由当天真实逐小时天气与太阳窗口计算。
            </p>
          </div>
          <div className="flex items-end gap-4 border-l border-border pl-5">
            <div>
              <p className="pm-display text-7xl tabular-nums 2xl:text-8xl">
                {overall === null ? "—" : Math.round(overall)}
              </p>
              <p className="pm-mono mt-2 text-muted-foreground">
                {overall === null ? "数据不足" : scoreLabel(overall)}
              </p>
            </div>
            <p className="pm-mono pb-1 text-muted-foreground">/ 100</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 pm-mono text-muted-foreground">
          <span className="border border-border px-2.5 py-1">
            置信度 {confidenceLabels[indices.confidence]}
          </span>
          <span className="border border-border px-2.5 py-1">
            {indices.entries.filter((entry) => entry.score !== null).length} /{" "}
            {indices.entries.length} 项有可用评分
          </span>
          <span className="border border-border px-2.5 py-1">
            可展开核对每个因子的数值与贡献
          </span>
        </div>
        <p className="mt-3 text-[10px] tracking-[0.04em] text-muted-foreground">
          天气预报获取于{" "}
          {forecastUpdatedAt
            ? formatObservedAt(forecastUpdatedAt)
            : "未提供"}{" "}
          · 来源 {sources.join(" / ") || "未提供"}
        </p>
      </section>

      <section className="pm-panel p-5">
        <div className="flex flex-wrap items-end justify-between gap-2 border-b border-border pb-3">
          <div>
            <p className="pm-kicker">Subject Scores</p>
            <h3 className="pm-display mt-2 text-2xl">分题材指数</h3>
            <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
              每个题材的光线窗口、云层、能见度、降水、风速、湿度与气溶胶权重不同。
            </p>
          </div>
          <span className="pm-mono text-muted-foreground">
            点击“评分依据”展开
          </span>
        </div>
        <div className="mt-4 grid gap-px bg-border md:grid-cols-2">
          {indices.entries.map((entry) => (
            <IndexCard key={entry.id} entry={entry} />
          ))}
          <div className="hidden flex-col justify-between bg-card p-4 md:flex">
            <div>
              <p className="pm-kicker">Method / 07 Subjects</p>
              <p className="pm-display mt-5 text-2xl leading-[1.05]">
                每一个分数，
                <br />
                都能回到数据。
              </p>
              <p className="mt-3 text-[11px] leading-5 text-muted-foreground">
                展开任一题材，可核对因子数值、权重归一化与缺失字段；没有真实逐小时天气的题材不评分。
              </p>
            </div>
            <div className="mt-6 flex items-end justify-between gap-3">
              <p className="pm-mono leading-5 text-muted-foreground">
                Real weather
                <br />
                Solar window
                <br />
                Explainable
              </p>
              <div className="pm-reticle size-14 shrink-0" aria-hidden="true">
                <span className="pm-reticle__inner" />
                <span className="pm-reticle__dot" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {trend.length > 0 && (
        <section className="pm-panel p-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Activity className="size-4 text-primary" />全天光线窗口评分
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            风光题材各光线时段的评分变化，用于比较清晨、白天与傍晚；空白表示该时段缺少可用天气。
          </p>
          <div className="mt-4 overflow-x-auto border border-border bg-card p-3">
            <div className="mx-auto flex min-w-[32rem] max-w-4xl items-end gap-2">
              {trend.map((entry) => (
                <div key={`${entry.time}-${entry.label}`} className="flex-1">
                  <p className="pm-mono mb-1.5 text-center text-muted-foreground">
                    {Math.round(entry.score ?? 0)}
                  </p>
                  <div className="flex h-32 items-end border-b border-border">
                    <div
                      className={`w-full ${
                        entry.score === null ? "bg-muted" : barColor(entry.score)
                      }`}
                      style={{ height: `${Math.max(4, entry.score ?? 0)}%` }}
                      title={`${entry.label} ${Math.round(entry.score ?? 0)} 分`}
                    />
                  </div>
                  <p className="mt-1.5 text-center text-[10px] tabular-nums text-muted-foreground">
                    {formatTime(entry.time)}
                  </p>
                  <p className="truncate text-center text-[10px] text-muted-foreground">
                    {entry.label}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="pm-panel p-5">
        <h3 className="text-sm font-semibold">评分依据</h3>
        <ul className="mt-3 space-y-2 text-xs leading-5 text-muted-foreground">
          {indices.basis.map((item) => <li key={item}>· {item}</li>)}
        </ul>
        <p className="mt-3 flex items-start gap-1.5 border border-border p-3 text-[11px] leading-5 text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          指数是辅助决策，不是气象部门预报；缺少真实天气的题材不评分，部分缺失的题材按剩余权重归一化并标注。
        </p>
      </section>
    </div>
  );
}

function IndexCard({ entry }: { entry: PhotographyIndexEntry }) {
  return (
    <article className="bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="pm-display text-xl">{entry.label}</p>
          <p className="pm-mono mt-1.5 text-muted-foreground">
            {entry.windowLabel}
          </p>
        </div>
        <div className="text-right">
          <span className="pm-display text-3xl tabular-nums">
            {entry.score === null ? "—" : Math.round(entry.score)}
          </span>
          <span className="ml-1 text-[10px] text-muted-foreground">/ 100</span>
        </div>
      </div>
      <div className="mt-3 h-px overflow-hidden bg-muted">
        <div
          className={`h-full ${
            entry.score === null ? "bg-muted" : barColor(entry.score)
          }`}
          style={{ width: `${entry.score ?? 0}%` }}
        />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 pm-mono text-muted-foreground">
        <span className="border border-border px-2 py-0.5">
          置信度 {confidenceLabels[entry.confidence]}
        </span>
        <span className="border border-border px-2 py-0.5">
          {statusLabels[entry.status]}
        </span>
      </div>
      <p className="mt-2 text-[11px] leading-4 text-muted-foreground">
        {entry.note}
      </p>
      <details className="group/detail mt-2 border-t border-border pt-1">
        <summary className="flex min-h-9 cursor-pointer list-none items-center justify-between text-[11px] font-medium text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring">
          评分依据
          <ChevronDown className="size-3.5 transition group-open/detail:rotate-180" />
        </summary>
        <div className="mt-2 space-y-2 border border-border p-3">
          {entry.basis.length ? (
            entry.basis.map((item) => (
              <div
                key={item.code}
                className="grid grid-cols-[1fr_auto] items-start gap-2 text-[11px]"
                title={item.explanation}
              >
                <span className="font-medium">{item.label}</span>
                <span className="text-right text-muted-foreground">
                  {item.value === null ? "缺失" : `${item.value}${item.unit}`}
                  {item.contribution !== null &&
                    ` · ${Math.round(item.contribution)} 分`}
                </span>
              </div>
            ))
          ) : (
            <p className="text-[11px] leading-4 text-muted-foreground">
              该题材没有可用的逐项天气数据。
            </p>
          )}
          {entry.missingFields.length > 0 && (
            <p className="border-t border-border/60 pt-2 text-[10px] leading-4 text-amber-700 dark:text-amber-400">
              缺少：{entry.missingFields.map(missingFieldLabel).join("、")}
              ，已按剩余权重归一化。
            </p>
          )}
        </div>
      </details>
    </article>
  );
}
