import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Aperture, CloudSun, Compass } from "lucide-react";
import type { LocationResult, ThemeId, TodayResponse } from "@/functions/shared/contracts";
import { getToday } from "@/src/lib/api";
import { describeFailure, type Failure } from "@/src/lib/errors";
import { shanghaiDate } from "@/src/lib/format";
import { ThemeToggle } from "@/src/components/ThemeToggle";
import { ErrorNotice } from "@/src/components/CapabilityNotice";
import { FeatureHub, type SectionId } from "@/src/components/FeatureHub";
import { LocationBar } from "@/src/components/LocationBar";
import { LocationSearch } from "@/src/components/LocationSearch";
import { ShootingPreview } from "@/src/components/ShootingPreview";

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
  const [error, setError] = useState<Failure | null>(null);
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
  const menuScrollRef = useRef(0);
  const previousSectionRef = useRef<SectionId | null>(section);

  // 进入功能页从顶部开始读；返回导航时回到离开前的位置。
  useEffect(() => {
    const previous = previousSectionRef.current;
    if (previous === section) return;
    previousSectionRef.current = section;
    if (section === null) {
      const top = menuScrollRef.current;
      window.requestAnimationFrame(() =>
        window.scrollTo({ top, behavior: "auto" })
      );
      return;
    }
    if (previous === null) menuScrollRef.current = window.scrollY;
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [section]);

  useEffect(() => {
    const syncSection = () => {
      const next = sectionFromHash(window.location.hash);
      if (next) {
        if (window.location.hash !== sectionHash(next)) {
          window.history.replaceState(
            window.history.state,
            "",
            sectionHash(next),
          );
        }
      } else if (window.location.hash) {
        window.history.replaceState(
          null,
          "",
          window.location.pathname + window.location.search,
        );
      }
      setNavDirection(next ? "forward" : "back");
      setSection(next);
    };
    syncSection();
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
    setError(null);
    getToday(location, theme, targetDate, controller.signal)
      .then((response) => {
        setData(response);
        const nextPlan = response.plans.items[0]?.slotId;
        const nextSlot = response.timeline.find((item) => !item.isPast)?.slotId;
        setSelectedSlotId(nextPlan ?? nextSlot ?? response.timeline[0]?.slotId ?? null);
      })
      .catch((reason) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(describeFailure(reason, "weather"));
        setData((previous) =>
          previous && previous.date === targetDate &&
            previous.location.latitude === location.latitude &&
            previous.location.longitude === location.longitude
            ? previous
            : null
        );
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [location, theme, refreshKey, targetDate]);

  const chooseLocation = useCallback((next: LocationResult) => {
    localStorage.setItem("photomate-location", JSON.stringify(next));
    setData(null);
    setSelectedSlotId(null);
    setDayOffset(0);
    setError(null);
    setLocation(next);
  }, []);

  const focusLocation = useCallback(() => {
    const input = document.getElementById("main-location-search");
    input?.scrollIntoView({ behavior: "smooth", block: "center" });
    (input as HTMLElement | null)?.focus({ preventScroll: true });
  }, []);

  const changeLocation = useCallback(() => {
    navigateToSection(null);
    window.setTimeout(focusLocation, 120);
  }, [focusLocation, navigateToSection]);

  return (
    <div className="app-shell flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 shrink-0 border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-[1440px] items-center justify-between gap-2 px-3 xs:h-16 xs:gap-4 xs:px-4 sm:px-6 lg:px-8 2xl:max-w-[1680px] 2xl:px-10">
          <div className="flex min-w-0 items-center gap-2 xs:gap-3">
            <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm xs:size-9"><Aperture className="size-5" /></span>
            <div className="min-w-0"><p className="whitespace-nowrap text-sm font-bold tracking-tight">PhotoMate <span className="text-primary">AI</span></p><p className="hidden text-xs tracking-[0.16em] text-muted-foreground xs:block">智能摄影规划助手</p></div>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 pb-[calc(5rem+env(safe-area-inset-bottom))] sm:px-6 sm:pb-16 lg:px-8 2xl:max-w-[1680px] 2xl:px-10">
        {section === null && (
          <section className="relative pb-4 pt-7 sm:pb-5 sm:pt-10 2xl:pb-6 2xl:pt-14">
            <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(340px,420px)] lg:items-stretch xl:gap-10">
              <div className="min-w-0 max-w-2xl lg:self-center 2xl:max-w-3xl">
                <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/[0.07] px-3 py-1 text-xs font-medium text-primary"><CloudSun className="size-3.5" />真实环境驱动 · 本地天文算法</div>
                <h1 className="max-w-2xl text-3xl font-semibold leading-tight tracking-[-0.035em] sm:text-4xl lg:text-[2.6rem] 2xl:text-[3.25rem]">把下一次快门，<br className="hidden sm:block" />留给最好的光。</h1>
                <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground 2xl:text-base 2xl:leading-7">分析天气、云层与太阳位置，告诉你何时拍、朝哪拍、怎么拍。搜索区县或使用定位即可开始。</p>
                <div className="mt-5 rounded-[var(--radius)] border border-border/80 bg-card/60 p-4 shadow-sm backdrop-blur 2xl:p-5">
                  <LocationSearch location={location} onSelect={chooseLocation} autoLocate />
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => location ? navigateToSection("WEATHER") : focusLocation()}
                    className="inline-flex min-h-12 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90"
                  >
                    {location ? <><CloudSun className="size-4" />查看今日拍摄条件</> : <><Compass className="size-4" />选择拍摄位置</>}
                  </button>
                  <span className="text-xs leading-5 text-muted-foreground">无需登录 · 真实天气与太阳方位</span>
                </div>
              </div>
              <ShootingPreview
                data={data}
                location={location}
                loading={loading}
                error={error}
                onRetry={() => setRefreshKey((value) => value + 1)}
                onOpen={() => navigateToSection("WEATHER")}
                onNeedLocation={focusLocation}
              />
            </div>
          </section>
        )}

        {section !== null && location && (
          <LocationBar
            location={location}
            loading={loading}
            onChange={changeLocation}
          />
        )}

        <div className="space-y-3" aria-live="polite">
          {error && (section !== null || data) && (
            <ErrorNotice
              failure={error}
              onRetry={() => setRefreshKey((value) => value + 1)}
              secondary={location ? { label: "更换位置", onClick: changeLocation } : undefined}
            />
          )}
          {error && data && (
            <p className="text-xs leading-5 text-muted-foreground">
              正在显示上一次成功获取的结果；重试成功后会自动更新。
            </p>
          )}
          {loading && (
            <div className="flex items-center gap-2 text-xs font-medium text-primary" role="status" aria-live="polite">
              <span className="size-2 animate-pulse rounded-full bg-primary" />正在获取真实环境并重新计算摄影计划…
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
          loading={loading}
          onDayChange={setDayOffset}
          onSectionChange={navigateToSection}
          onNeedLocation={focusLocation}
          onSelectSlot={setSelectedSlotId}
        />
      </main>

      <footer className="shrink-0 border-t border-border/60 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-6">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-2 px-4 text-xs leading-5 text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8 2xl:max-w-[1680px] 2xl:px-10 2xl:text-xs">
          <p>PhotoMate AI · 摄影指数用于比较天气与光线条件。</p>
          <details className="sm:hidden">
            <summary className="flex min-h-11 cursor-pointer list-none items-center font-medium text-foreground">
              数据与算法说明
            </summary>
            <p className="mt-1">
              天气数据来自和风天气、OpenWeather、Open-Meteo、MET Norway 等已标注来源；地图来自高德，太阳位置由本地算法计算。
            </p>
          </details>
          <p className="hidden items-center gap-1.5 sm:flex">
            <Compass className="size-3.5 shrink-0" />
            天气数据来自和风天气、OpenWeather、Open-Meteo、MET Norway 等已标注来源；地图来自高德，太阳位置由本地算法计算。
          </p>
        </div>
      </footer>
    </div>
  );
}
