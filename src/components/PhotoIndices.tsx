import { Activity, Info, Sparkles } from "lucide-react";
import type { PhotographyIndices } from "@/functions/shared/contracts";
import { formatTime, scoreLabel } from "@/src/lib/format";

const confidenceLabels = { LOW: "较低", MEDIUM: "中等", HIGH: "较高" };

function barColor(score: number) {
  if (score >= 70) return "bg-emerald-500/75";
  if (score >= 45) return "bg-amber-500/75";
  return "bg-rose-500/60";
}

export function PhotoIndices({ indices }: { indices: PhotographyIndices }) {
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
              按题材评分加权，每一项都来自当天真实天气与天文窗口。
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
                <p className="text-[10px] text-muted-foreground">
                  {overall === null ? "数据不足" : scoreLabel(overall)}
                </p>
              </div>
            </div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          <span className="rounded-full bg-muted px-2.5 py-1">
            置信度 {confidenceLabels[indices.confidence]}
          </span>
          <span className="rounded-full bg-muted px-2.5 py-1">
            {indices.entries.filter((entry) => entry.score !== null).length} /{" "}
            {indices.entries.length} 项有可用评分
          </span>
        </div>
      </section>

      <section className="rounded-[var(--radius)] border border-border bg-card p-5 shadow-sm">
        <h3 className="text-sm font-semibold">分题材指数</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {indices.entries.map((entry) => (
            <div
              key={entry.id}
              className="rounded-xl border border-border/70 p-3"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium">{entry.label}</span>
                <span className="text-lg font-semibold tabular-nums">
                  {entry.score === null ? "—" : Math.round(entry.score)}
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full ${
                    entry.score === null ? "bg-muted" : barColor(entry.score)
                  }`}
                  style={{ width: `${entry.score ?? 0}%` }}
                />
              </div>
              <p className="mt-2 text-[11px] leading-4 text-muted-foreground">
                {entry.note}
              </p>
            </div>
          ))}
        </div>
      </section>

      {trend.length > 0 && (
        <section className="rounded-[var(--radius)] border border-border bg-card p-5 shadow-sm">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Activity className="size-4 text-primary" />全天评分趋势
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            风光题材各光线时段的评分变化；空白表示该时段缺少可用天气。
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
                  <p className="mt-1 text-center text-[10px] tabular-nums text-muted-foreground">
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

      <section className="rounded-[var(--radius)] border border-border bg-card p-5 shadow-sm">
        <h3 className="text-sm font-semibold">评分依据</h3>
        <ul className="mt-3 space-y-2 text-xs leading-5 text-muted-foreground">
          {indices.basis.map((item) => <li key={item}>· {item}</li>)}
        </ul>
        <p className="mt-3 flex items-start gap-1.5 rounded-xl bg-muted/45 p-3 text-[11px] leading-5 text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          指数是辅助决策，不是气象部门预报；缺少数据的题材不参与综合加权。
        </p>
      </section>
    </div>
  );
}
