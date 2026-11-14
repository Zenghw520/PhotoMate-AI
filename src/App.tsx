import { useCallback, useEffect, useMemo, useState } from "react";
import { Aperture, ArrowRight, CloudSun, Compass, Sparkles } from "lucide-react";
import type { LocationResult, ThemeId, TodayResponse } from "@/functions/shared/contracts";
import { getToday } from "@/src/lib/api";
import { formatDate, formatRange, shanghaiDate } from "@/src/lib/format";
import { ThemeToggle } from "@/src/components/ThemeToggle";
import { CapabilityNotice, ErrorNotice } from "@/src/components/CapabilityNotice";
import { FeatureHub, type SectionId } from "@/src/components/FeatureHub";

function readSavedLocation(): LocationResult | null {
  try {
    const value = JSON.parse(localStorage.getItem("photomate-location") ?? "null") as Partial<LocationResult> | null;
    return value && typeof value.name === "string" && typeof value.latitude === "number" && typeof value.longitude === "number" && (value.precision === "GPS" || value.precision === "MANUAL" || value.precision === "DISTRICT")
      ? { ...value, timezone: "Asia/Shanghai" } as LocationResult
      : null;
  } catch {
    return null;
  }
}

export default function App() {
  const [location, setLocation] = useState<LocationResult | null>(readSavedLocation);
  const [theme, setTheme] = useState<ThemeId>("LANDSCAPE");
  const [data, setData] = useState<TodayResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [section, setSection] = useState<SectionId | null>(null);
  const [dayOffset, setDayOffset] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const targetDate = useMemo(() => shanghaiDate(dayOffset), [dayOffset]);

  useEffect(() => {
    if (!location) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    getToday(location, theme, targetDate, controller.signal)
      .then((response) => {
        setData(response);
        const nextPlan = response.plans.items[0]?.slotId;
        const nextSlot = response.timeline.find((item) => !item.isPast)?.slotId;
        setSelectedSlotId(nextPlan ?? nextSlot ?? response.timeline[0]?.slotId ?? null);
      })
      .catch((reason) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(reason instanceof Error ? reason.message : "摄影计划暂时无法生成。");
        setData(null);
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [location, theme, refreshKey, targetDate]);

  const chooseLocation = useCallback((next: LocationResult) => {
    localStorage.setItem("photomate-location", JSON.stringify(next));
    setData(null);
    setSelectedSlotId(null);
    setDayOffset(0);
    setLocation(next);
  }, []);

  const featured = useMemo(() => {
    if (!data) return null;
    const plan = data.plans.items[0];
    if (plan) return { slotId: plan.slotId, title: plan.title, range: formatRange(plan.timeWindow.start, plan.timeWindow.end) };
    const slot = data.timeline.find((item) => !item.isPast);
    return slot ? { slotId: slot.slotId, title: slot.label, range: formatRange(slot.start, slot.end) } : null;
  }, [data]);

  return (
    <div className="app-shell min-h-dvh">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm"><Aperture className="size-5" /></span>
            <div><p className="text-sm font-bold tracking-tight">PhotoMate <span className="text-primary">AI</span></p><p className="text-[10px] tracking-[0.16em] text-muted-foreground">智能摄影规划助手</p></div>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto max-w-[1440px] px-4 pb-12 sm:px-6 lg:px-8">
        <section className="relative overflow-hidden py-7 sm:py-10">
          <div className="pointer-events-none absolute -right-24 -top-24 size-80 rounded-full bg-primary/[0.08] blur-3xl" />
          <div className="relative max-w-2xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/[0.07] px-3 py-1 text-xs font-medium text-primary"><CloudSun className="size-3.5" />真实环境驱动 · 本地天文算法</div>
            <h1 className="max-w-2xl text-3xl font-semibold leading-tight tracking-[-0.035em] sm:text-4xl lg:text-[2.75rem]">把下一次快门，<br className="hidden sm:block" />留给最好的光。</h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">分析天气、云层与太阳位置，告诉你何时拍、朝哪拍、怎么拍。首次使用请从下方「霞光与光线」选择拍摄位置。</p>
          </div>
        </section>

        <div className="space-y-4">
          {data && <CapabilityNotice warnings={data.warnings} />}
          {error && <ErrorNotice message={error} onRetry={() => setRefreshKey((value) => value + 1)} />}
          {loading && <div className="flex items-center gap-2 text-xs font-medium text-primary" role="status"><span className="size-2 animate-pulse rounded-full bg-primary" />正在获取真实环境并重新计算摄影计划…</div>}
        </div>

        {data && section === null && featured && (
          <button type="button" onClick={() => { setSelectedSlotId(featured.slotId); setSection("PLANS"); }} className="group relative mt-6 flex w-full items-center justify-between gap-4 overflow-hidden rounded-[var(--radius)] border border-primary/20 bg-gradient-to-r from-primary/[0.14] via-primary/[0.07] to-transparent p-5 text-left shadow-sm">
            <div><p className="flex items-center gap-1.5 text-xs font-semibold text-primary"><Sparkles className="size-3.5" />下一段推荐</p><h2 className="mt-2 text-xl font-semibold tracking-tight">{featured.title}</h2><p className="mt-1 text-sm text-muted-foreground">{featured.range} · {formatDate(data.date)}</p></div>
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition group-hover:translate-x-0.5"><ArrowRight className="size-5" /></span>
          </button>
        )}

        <FeatureHub
          data={data}
          location={location}
          section={section}
          theme={theme}
          selectedSlotId={selectedSlotId}
          dayOffset={dayOffset}
          targetDate={targetDate}
          onDayChange={setDayOffset}
          onSectionChange={setSection}
          onSelectLocation={chooseLocation}
          onThemeChange={setTheme}
          onSelectSlot={setSelectedSlotId}
        />
      </main>

      <footer className="border-t border-border/60 py-6">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-2 px-4 text-[11px] leading-5 text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p>PhotoMate AI · 摄影指数是辅助评估，并非官方气象预报。</p>
          <p className="flex items-center gap-1.5"><Compass className="size-3.5" />天气数据来自和风天气、OpenWeather 等已标注来源；地图来自高德，太阳位置由本地算法计算。</p>
        </div>
      </footer>
    </div>
  );
}
