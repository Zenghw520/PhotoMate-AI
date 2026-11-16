import { useCallback, useEffect, useMemo, useState } from "react";
import { Aperture, CloudSun, Compass } from "lucide-react";
import type { LocationResult, ThemeId, TodayResponse } from "@/functions/shared/contracts";
import { getToday } from "@/src/lib/api";
import { shanghaiDate } from "@/src/lib/format";
import { ThemeToggle } from "@/src/components/ThemeToggle";
import { ErrorNotice } from "@/src/components/CapabilityNotice";
import { FeatureHub, type SectionId } from "@/src/components/FeatureHub";
import { LocationSearch } from "@/src/components/LocationSearch";

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

function sectionFromHash(hash: string): SectionId | null {
  const key = hash.replace(/^#/, "").toLowerCase();
  if (key === "weather" || key === "light" || key === "plans" || key === "photo") {
    return key.toUpperCase() as SectionId;
  }
  return null;
}

function sectionHash(section: SectionId) {
  return `#${section.toLowerCase()}`;
}

export default function App() {
  const [location, setLocation] = useState<LocationResult | null>(readSavedLocation);
  const theme: ThemeId = "LANDSCAPE";
  const [data, setData] = useState<TodayResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [section, setSection] = useState<SectionId | null>(
    () => sectionFromHash(window.location.hash),
  );
  const [navDirection, setNavDirection] = useState<"forward" | "back">(
    "forward",
  );
  const [dayOffset, setDayOffset] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const targetDate = useMemo(() => shanghaiDate(dayOffset), [dayOffset]);

  useEffect(() => {
    const syncSection = () => {
      const next = sectionFromHash(window.location.hash);
      setNavDirection(next ? "forward" : "back");
      setSection(next);
    };
    window.addEventListener("popstate", syncSection);
    window.addEventListener("hashchange", syncSection);
    return () => {
      window.removeEventListener("popstate", syncSection);
      window.removeEventListener("hashchange", syncSection);
    };
  }, []);

  const navigateToSection = useCallback((next: SectionId | null) => {
    if (next) {
      if (window.location.hash !== sectionHash(next)) {
        window.history.pushState(
          { photomateSection: true },
          "",
          sectionHash(next),
        );
      }
      setNavDirection("forward");
      setSection(next);
      return;
    }
    if (window.history.state?.photomateSection === true) {
      window.history.back();
      return;
    }
    window.history.replaceState(
      null,
      "",
      window.location.pathname + window.location.search,
    );
    setNavDirection("back");
    setSection(null);
  }, []);

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

  const focusLocation = useCallback(() => {
    const input = document.getElementById("main-location-search");
    input?.scrollIntoView({ behavior: "smooth", block: "center" });
    (input as HTMLElement | null)?.focus({ preventScroll: true });
  }, []);

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
        {section === null && (
          <section className="relative overflow-hidden py-7 sm:py-10">
            <div className="pointer-events-none absolute -right-24 -top-24 size-80 rounded-full bg-primary/[0.08] blur-3xl" />
            <div className="relative max-w-2xl">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/[0.07] px-3 py-1 text-xs font-medium text-primary"><CloudSun className="size-3.5" />真实环境驱动 · 本地天文算法</div>
              <h1 className="max-w-2xl text-3xl font-semibold leading-tight tracking-[-0.035em] sm:text-4xl lg:text-[2.75rem]">把下一次快门，<br className="hidden sm:block" />留给最好的光。</h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">分析天气、云层与太阳位置，告诉你何时拍、朝哪拍、怎么拍。搜索区县或使用定位即可开始。</p>
              <div className="mt-5 rounded-[var(--radius)] border border-border/80 bg-card/60 p-4 shadow-sm backdrop-blur">
                <LocationSearch location={location} onSelect={chooseLocation} autoLocate />
              </div>
            </div>
          </section>
        )}

        <div className="space-y-4">
          {error && <ErrorNotice message={error} onRetry={() => setRefreshKey((value) => value + 1)} />}
          {loading && <div className="flex items-center gap-2 text-xs font-medium text-primary" role="status"><span className="size-2 animate-pulse rounded-full bg-primary" />正在获取真实环境并重新计算摄影计划…</div>}
        </div>

        <FeatureHub
          data={data}
          location={location}
          section={section}
          direction={navDirection}
          theme={theme}
          selectedSlotId={selectedSlotId}
          dayOffset={dayOffset}
          targetDate={targetDate}
          onDayChange={setDayOffset}
          onSectionChange={navigateToSection}
          onNeedLocation={focusLocation}
          onSelectSlot={setSelectedSlotId}
        />
      </main>

      <footer className="border-t border-border/60 py-6">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-2 px-4 text-[11px] leading-5 text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p>PhotoMate AI · 摄影指数是辅助评估，并非官方气象预报。</p>
          <p className="flex items-center gap-1.5"><Compass className="size-3.5" />天气数据来自和风天气、OpenWeather、Open-Meteo 等已标注来源；地图来自高德，太阳位置由本地算法计算。</p>
        </div>
      </footer>
    </div>
  );
}
