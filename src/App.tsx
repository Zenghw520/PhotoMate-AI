import { useCallback, useEffect, useMemo, useState } from "react";
import { Aperture, Compass } from "lucide-react";
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
  if (
    key === "weather" || key === "light" || key === "plans" ||
    key === "spots" || key === "photo"
  ) {
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
    <div className="app-shell flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 shrink-0 border-b border-border/80 bg-background/95 backdrop-blur-sm">
        <div className="mx-auto grid h-16 max-w-[1440px] grid-cols-[1fr_auto] items-center gap-4 px-4 sm:px-6 lg:px-8 md:grid-cols-[1fr_auto_1fr] 2xl:max-w-[1680px] 2xl:px-10">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center border border-border text-primary">
              <Aperture className="size-5" />
            </span>
            <div>
              <p className="pm-display text-lg leading-none tracking-[-0.02em]">
                PhotoMate <span className="text-primary">AI</span>
              </p>
              <p className="pm-mono mt-1.5 text-muted-foreground">
                Photographic Field System
              </p>
            </div>
          </div>
          <p className="pm-mono hidden justify-self-center text-muted-foreground md:block">
            Real weather · Solar position · Field plan
          </p>
          <div className="justify-self-end">
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 pb-12 sm:px-6 lg:px-8 2xl:max-w-[1680px] 2xl:px-10">
        {section === null && (
          <section className="relative py-8 sm:py-12 2xl:py-16">
            <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-end 2xl:grid-cols-[minmax(0,1fr)_21rem]">
              <div className="max-w-3xl">
                <p className="pm-kicker">01 / Field Notes</p>
                <h1 className="pm-display mt-5 text-[2.65rem] leading-[0.94] sm:text-5xl lg:text-[4.15rem] 2xl:text-[5rem]">
                  把下一次快门，
                  <br />
                  留给最好的光。
                </h1>
                <p className="mt-5 max-w-xl text-sm leading-7 text-muted-foreground 2xl:text-base">
                  分析天气、云层与太阳位置，告诉你何时拍、朝哪拍、怎么拍。搜索区县或使用定位即可开始。
                </p>
                <div className="pm-corners mt-6 max-w-2xl border border-border bg-card/60 p-4 2xl:p-5">
                  <LocationSearch
                    location={location}
                    onSelect={chooseLocation}
                    autoLocate
                  />
                </div>
              </div>
              <aside className="hidden lg:flex lg:flex-col lg:items-end lg:justify-end lg:gap-6">
                <div className="pm-reticle size-48 2xl:size-56" aria-hidden="true">
                  <span className="pm-reticle__inner" />
                  <span className="pm-reticle__dot" />
                </div>
                <div className="text-right">
                  <p className="pm-mono text-muted-foreground">Frame 01</p>
                  <p className="pm-display mt-2 text-2xl leading-none">
                    Light,
                    <br />
                    timed.
                  </p>
                  <p className="pm-mono mt-4 leading-6 text-muted-foreground">
                    Real weather
                    <br />
                    NOAA solar
                    <br />
                    Local calculation
                  </p>
                </div>
              </aside>
            </div>
          </section>
        )}

        <div className="space-y-4">
          {error && (
            <div className="border-l-2 border-primary py-1 pl-3">
              <ErrorNotice
                message={error}
                onRetry={() => setRefreshKey((value) => value + 1)}
              />
            </div>
          )}
          {loading && (
            <div className="flex items-center gap-2 pm-mono text-primary" role="status">
              <span className="size-1.5 animate-pulse rounded-full bg-primary" />
              正在获取真实环境并重新计算摄影计划…
            </div>
          )}
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

      <footer className="shrink-0 border-t border-border py-8">
        <div className="mx-auto grid max-w-[1440px] gap-4 px-4 sm:grid-cols-[1fr_auto] sm:items-start sm:px-6 lg:px-8 2xl:max-w-[1680px] 2xl:px-10">
          <div>
            <p className="pm-mono text-muted-foreground">
              PhotoMate AI / Photographic Field System
            </p>
            <p className="mt-2 max-w-xl text-[11px] leading-5 text-muted-foreground">
              摄影指数是辅助评估，并非官方气象预报。天气、地图与太阳位置均来自真实数据与本地计算。
            </p>
          </div>
          <div className="text-left sm:text-right">
            <p className="flex items-center gap-1.5 text-[11px] leading-5 text-muted-foreground sm:justify-end">
              <Compass className="size-3.5" />
              和风天气 / OpenWeather / Open-Meteo / MET Norway / 高德
            </p>
            <p className="pm-mono mt-2 text-muted-foreground">
              Design language · Overture (MIT)
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
