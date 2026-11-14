import { Aperture, Camera, Compass, Frame, Lightbulb, MapPin, MoveUpRight, ShieldAlert, Sparkles } from "lucide-react";
import { THEMES } from "@/functions/shared/contracts";
import type { PhotographyPlan, ThemeId, TodayResponse } from "@/functions/shared/contracts";
import { compass, formatRange, themeLabels } from "@/src/lib/format";

export function PlanPanel({ data, theme, onThemeChange, selectedSlotId, onSelectSlot }: { data: TodayResponse; theme: ThemeId; onThemeChange: (theme: ThemeId) => void; selectedSlotId: string | null; onSelectSlot: (slotId: string) => void }) {
  const plan = data.plans.items.find((item) => item.slotId === selectedSlotId) ?? data.plans.items[0];
  const slot = data.timeline.find((item) => item.slotId === plan?.slotId);
  return (
    <section className="rounded-[var(--radius)] border border-border bg-card shadow-sm">
      <div className="flex items-start justify-between gap-4 px-5 pt-5">
        <div><div className="flex items-center gap-2"><Sparkles className="size-5 text-primary" /><h2 className="font-semibold">场景化拍摄方案</h2></div><p className="mt-1 text-xs text-muted-foreground">真实数据决定事实，AI 只优化表达</p></div>
        <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">{data.plans.mode === "AI_ENHANCED" ? "AI 增强" : "规则建议"}</span>
      </div>
      <div className="scrollbar-none mt-4 flex gap-2 overflow-x-auto px-5 pb-1" role="tablist" aria-label="摄影主题">
        {THEMES.map((item) => <button key={item} type="button" role="tab" aria-selected={theme === item} onClick={() => onThemeChange(item)} className={`min-h-11 shrink-0 rounded-full px-4 text-sm font-medium transition ${theme === item ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted text-muted-foreground hover:text-foreground"}`}>{themeLabels[item]}</button>)}
      </div>
      {data.plans.items.length > 1 && <div className="mt-4 flex flex-wrap gap-2 px-5">{data.plans.items.map((item) => <button key={item.slotId} type="button" onClick={() => onSelectSlot(item.slotId)} className={`rounded-xl border px-3 py-2 text-xs transition ${plan?.slotId === item.slotId ? "border-primary/40 bg-primary/[0.08] text-primary" : "border-border text-muted-foreground hover:bg-muted"}`}>{data.timeline.find((slotItem) => slotItem.slotId === item.slotId)?.label ?? "推荐时段"}</button>)}</div>}
      {plan ? <PlanDetails key={`${plan.slotId}-${plan.theme}`} plan={plan} solar={slot?.solar} /> : <div className="p-8 text-center text-sm text-muted-foreground">当前没有适合生成方案的未来时段。</div>}
      <div className="border-t border-border/70 px-5 py-3 text-[11px] leading-4 text-muted-foreground">参数为起始参考，请按现场测光调整。太阳方位不代表现场无遮挡，请实地确认建筑与地形。</div>
    </section>
  );
}

function PlanDetails({ plan, solar }: { plan: PhotographyPlan; solar?: { elevation: number; azimuth: number } }) {
  return (
    <div className="p-5">
      <div className="rounded-2xl bg-gradient-to-br from-primary/[0.12] via-primary/[0.05] to-transparent p-4">
        <p className="text-xs font-medium text-primary">{formatRange(plan.timeWindow.start, plan.timeWindow.end)}</p>
        <h3 className="mt-2 text-xl font-semibold tracking-tight">{plan.title}</h3>
        <p className="mt-2 flex items-start gap-1.5 text-xs leading-5 text-muted-foreground"><MapPin className="mt-0.5 size-3.5 shrink-0" />{plan.locationNote}</p>
      </div>
      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <Detail icon={Compass} title="拍摄方向" text={plan.direction} />
        <Detail icon={MoveUpRight} title="角度与视点" text={`${plan.viewpoint} ${plan.cameraAngle}`} />
        <Detail icon={Frame} title="构图建议" text={plan.composition} wide />
        <Detail icon={Camera} title="相机参数参考" text={plan.cameraSettings} wide />
        <Detail icon={Lightbulb} title="光线分析" text={`${plan.lightAnalysis}${solar ? ` 太阳位于${compass(solar.azimuth)}方向（${Math.round(solar.azimuth)}°），高度角 ${solar.elevation.toFixed(1)}°。` : ""}`} wide />
      </div>
      {plan.risks.length > 0 && <div className="mt-5 flex items-start gap-2 rounded-xl bg-amber-500/[0.08] p-3 text-xs leading-5 text-amber-800 dark:text-amber-300"><ShieldAlert className="mt-0.5 size-4 shrink-0" /><span>{plan.risks.join("；")}</span></div>}
      <p className="mt-4 flex items-center gap-1.5 text-[11px] text-muted-foreground"><Aperture className="size-3.5" />先拍一张测试照，再根据主体亮度和现场光线微调。</p>
    </div>
  );
}

function Detail({ icon: Icon, title, text, wide = false }: { icon: typeof Camera; title: string; text: string; wide?: boolean }) {
  return <div className={wide ? "sm:col-span-2" : ""}><div className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><Icon className="size-4 text-primary" />{title}</div><p className="mt-2 text-sm leading-6">{text}</p></div>;
}
