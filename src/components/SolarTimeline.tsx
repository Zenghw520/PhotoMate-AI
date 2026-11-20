import { ArrowUpRight, Clock3, Compass, MoonStar, Sun, Sunrise, Sunset } from "lucide-react";
import type { SolarData, TimelineItem } from "@/functions/shared/contracts";
import { compass, formatRange, formatTime, metric } from "@/src/lib/format";

export function SolarTimeline({ solar, timeline, selectedSlotId, onSelectSlot }: { solar: SolarData; timeline: TimelineItem[]; selectedSlotId: string | null; onSelectSlot: (slotId: string) => void }) {
  const nextGolden = solar.goldenHours.find((window) => new Date(window.end).getTime() > Date.now()) ?? solar.goldenHours[0];
  const nextBlue = solar.blueHours.find((window) => new Date(window.end).getTime() > Date.now()) ?? solar.blueHours[0];
  return (
    <section className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SolarFact icon={Sunrise} label="日出" value={formatTime(solar.sunrise)} tone="amber" />
        <SolarFact icon={Sunset} label="日落" value={formatTime(solar.sunset)} tone="orange" />
        <SolarFact icon={Sun} label="黄金时刻" value={nextGolden ? formatRange(nextGolden.start, nextGolden.end) : "暂不可用"} tone="gold" wide />
        <SolarFact icon={MoonStar} label="蓝调时刻" value={nextBlue ? formatRange(nextBlue.start, nextBlue.end) : "暂不可用"} tone="blue" wide />
      </div>
      <div className="rounded-[var(--radius)] border border-border bg-card shadow-sm">
        <div className="flex items-center justify-between px-5 py-4">
          <div><h2 className="font-semibold">今日最佳摄影时间轴</h2><p className="mt-1 text-xs text-muted-foreground">按所选位置、日期和真实环境动态计算</p></div>
          <Clock3 className="size-5 text-primary" />
        </div>
        <div className="px-3 pb-3">
          {timeline.map((item) => {
            const selected = item.slotId === selectedSlotId;
            return (
              <div key={item.slotId} className="relative">
                <button type="button" onClick={() => onSelectSlot(item.slotId)} aria-expanded={selected} className={`group flex w-full items-center gap-3 rounded-2xl px-3 py-3.5 text-left transition sm:gap-4 ${selected ? "bg-primary/[0.08] ring-1 ring-inset ring-primary/15" : "hover:bg-muted/55"} ${item.isPast ? "opacity-55" : ""}`}>
                  <div className="w-[5.7rem] shrink-0 text-xs font-medium tabular-nums text-muted-foreground sm:w-24 sm:text-sm">{formatTime(item.start)}<span className="mx-1 text-border">—</span>{formatTime(item.end)}</div>
                  <span className={`size-2 shrink-0 rounded-full ring-4 ${selected ? "bg-primary ring-primary/10" : "bg-border ring-muted/40"}`} />
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{item.label}{item.isPast && <span className="ml-2 text-xs font-normal text-muted-foreground">已结束</span>}</p><p className="mt-1 truncate text-xs text-muted-foreground">{item.reasons[0] ?? "按天文光线评估"}</p></div>
                  <div className="shrink-0 text-right"><span className={`text-lg font-semibold tabular-nums ${item.score !== null && item.score >= 70 ? "text-primary" : ""}`}>{item.score === null ? "—" : Math.round(item.score)}</span><span className="block text-xs text-muted-foreground">{item.scoreMode === "ASTRO_ONLY" ? "仅天文" : "适合指数"}</span></div>
                  <ArrowUpRight className="size-4 shrink-0 text-muted-foreground transition group-hover:text-primary" />
                </button>
                {selected && (
                  <div className="pm-panel mx-3 mb-3 grid gap-3 rounded-2xl border border-primary/15 bg-muted/35 p-4 text-xs sm:grid-cols-2">
                    <div><p className="mb-1.5 font-medium text-foreground">时段分析</p><ul className="space-y-1 leading-5 text-muted-foreground">{item.reasons.map((reason) => <li key={reason}>· {reason}</li>)}</ul></div>
                    <div className="space-y-2 text-muted-foreground">
                      <p className="flex items-center gap-2"><Compass className="size-3.5 text-primary" />太阳 {compass(item.solar.azimuth)} · {Math.round(item.solar.azimuth)}°，高度 {metric(item.solar.elevation, "°", 1)}</p>
                      {item.weather ? <p>{item.weather.condition} · 云量 {metric(item.weather.cloud, "%")} · 降水概率 {metric(item.weather.precipitationProbability, "%")}</p> : <p>该时段缺少可用逐小时天气，未使用当前天气代替。</p>}
                      {item.risks.length > 0 && <p className="text-amber-700 dark:text-amber-400">{item.risks.join("；")}</p>}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function SolarFact({ icon: Icon, label, value, tone, wide = false }: { icon: typeof Sun; label: string; value: string; tone: "amber" | "orange" | "gold" | "blue"; wide?: boolean }) {
  const tones = { amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400", orange: "bg-orange-500/10 text-orange-600 dark:text-orange-400", gold: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400", blue: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400" };
  return <div className={`rounded-[var(--radius)] border border-border bg-card p-4 shadow-sm ${wide ? "col-span-2 lg:col-span-1" : ""}`}><div className="flex items-center gap-2"><span className={`grid size-7 place-items-center rounded-lg ${tones[tone]}`}><Icon className="size-4" /></span><span className="text-xs text-muted-foreground">{label}</span></div><p className={`mt-3 font-semibold tabular-nums ${wide ? "text-sm sm:text-base" : "text-xl"}`}>{value}</p></div>;
}
