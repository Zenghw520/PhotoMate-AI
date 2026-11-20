import { useEffect, useMemo, useState } from "react";
import {
  Cloud,
  Droplets,
  LoaderCircle,
  MapPin,
  Search,
  Sparkles,
  Wind,
} from "lucide-react";
import type {
  CompareResponse,
  SlotKind,
  ThemeId,
  TimelineItem,
} from "@/functions/shared/contracts";
import { compareWindows, searchPlaces, type PlaceResult } from "@/src/lib/api";
import { ErrorNotice } from "@/src/components/CapabilityNotice";
import { describeFailure, type Failure } from "@/src/lib/errors";
import {
  compass,
  formatRange,
  formatTime,
} from "@/src/lib/format";
import {
  DAY_LABELS,
  THEME_LABELS,
  spotDate,
  toLocationResult,
  windowGroupLabel,
  type ShootingSpot,
} from "@/src/lib/shooting";
import {
  favoriteToSpot,
  readFavorites,
  subscribeFavorites,
  type FavoriteSpot,
} from "@/src/lib/favorites";

type Mode = "dates" | "spots";

const CONFIDENCE_LABELS = { LOW: "较低", MEDIUM: "中等", HIGH: "较高" };

function percent(value: number | null) {
  return value === null ? "暂无数据" : `${Math.round(value)}%`;
}

function gust(value: number | null) {
  return value === null ? "暂无数据" : `${value.toFixed(1)} m/s`;
}

export function WindowCompare({
  spot,
  dayOffset,
  targetDate,
  theme,
  slot,
}: {
  spot: ShootingSpot;
  dayOffset: number;
  targetDate: string;
  theme: ThemeId;
  slot: TimelineItem | null;
}) {
  const [mode, setMode] = useState<Mode>("dates");
  const [offsets, setOffsets] = useState<number[]>(() =>
    [...new Set([dayOffset, (dayOffset + 1) % 3])]
  );
  const [extraSpots, setExtraSpots] = useState<ShootingSpot[]>([]);
  const [favorites, setFavorites] = useState<FavoriteSpot[]>([]);
  const [query, setQuery] = useState("");
  const [places, setPlaces] = useState<PlaceResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<CompareResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    setFavorites(readFavorites());
    return subscribeFavorites(() => setFavorites(readFavorites()));
  }, []);

  useEffect(() => {
    setOffsets((previous) =>
      [...new Set([dayOffset, ...previous])].slice(0, 3)
    );
  }, [dayOffset]);

  useEffect(() => {
    const value = query.trim();
    if (value.length < 2) {
      setPlaces([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSearching(true);
      searchPlaces(value, controller.signal)
        .then((response) => setPlaces(response.places.slice(0, 4)))
        .catch(() => setPlaces([]))
        .finally(() => setSearching(false));
    }, 420);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const spotItems = useMemo(() => {
    const all = [spot, ...extraSpots];
    const seen = new Set<string>();
    return all.filter((item) => {
      const key = `${item.latitude.toFixed(4)},${item.longitude.toFixed(4)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 3);
  }, [spot, extraSpots]);

  const items = useMemo(() => {
    if (mode === "dates") {
      return offsets.slice(0, 3).map((offset) => ({
        location: toLocationResult(spot),
        date: spotDate(offset),
        label: `${DAY_LABELS[offset]} ${spotDate(offset).slice(5)}`,
      }));
    }
    return spotItems.map((item) => ({
      location: toLocationResult(item),
      date: targetDate,
      label: item.name,
    }));
  }, [mode, offsets, spot, spotItems, targetDate]);

  const signature = useMemo(
    () => JSON.stringify({ items, theme, slotKind: slot?.kind ?? null }),
    [items, theme, slot?.kind],
  );

  useEffect(() => {
    if (items.length < 2) {
      setResult(null);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setFailure(null);
    compareWindows({
      items,
      theme,
      ...(slot?.kind ? { slotKind: slot.kind } : {}),
    }, controller.signal)
      .then((response) => {
        if (!controller.signal.aborted) setResult(response);
      })
      .catch((reason) => {
        if (reason instanceof DOMException && reason.name === "AbortError") {
          return;
        }
        setFailure(describeFailure(reason, "data"));
        setResult(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, retryToken]);

  function toggleOffset(offset: number) {
    setOffsets((previous) => {
      if (previous.includes(offset)) {
        return previous.length > 2
          ? previous.filter((item) => item !== offset)
          : previous;
      }
      return [...previous, offset].sort().slice(0, 3);
    });
  }

  function addSpot(next: ShootingSpot) {
    setExtraSpots((previous) => {
      if (previous.length >= 2) return previous;
      if (
        previous.some((item) =>
          item.latitude.toFixed(4) === next.latitude.toFixed(4) &&
          item.longitude.toFixed(4) === next.longitude.toFixed(4)
        )
      ) return previous;
      return [...previous, next];
    });
  }

  return (
    <div className="space-y-4">
      <section className="rounded-[var(--radius)] border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">拍摄窗口对比</h3>
          <span className="text-xs text-muted-foreground">
            {THEME_LABELS[theme]} ·{" "}
            {windowGroupLabel(slot?.kind ?? null)} · 最多 3 项
          </span>
        </div>

        <div className="mt-3 flex gap-1 rounded-full bg-muted p-1">
          {[
            { id: "dates" as const, label: "同一机位 · 不同日期" },
            { id: "spots" as const, label: "同一天 · 不同机位" },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={mode === item.id}
              onClick={() => setMode(item.id)}
              className={`min-h-10 flex-1 rounded-full px-3 text-xs font-medium transition ${
                mode === item.id
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {mode === "dates" ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">日期</span>
            {[0, 1, 2].map((offset) => {
              const active = offsets.includes(offset);
              return (
                <button
                  key={offset}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleOffset(offset)}
                  className={`min-h-9 rounded-full px-3 text-xs font-medium transition ${
                    active
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {DAY_LABELS[offset]} {spotDate(offset).slice(5)}
                </button>
              );
            })}
            <span className="text-xs text-muted-foreground">
              至少选 2 个日期
            </span>
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-muted-foreground">已选</span>
              {spotItems.map((item) => (
                <span
                  key={`${item.id}-${item.latitude}`}
                  className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-primary"
                >
                  <MapPin className="size-3" />{item.name}
                </span>
              ))}
              <span className="text-muted-foreground">
                {spotItems.length}/3 · {targetDate}
              </span>
            </div>
            {spotItems.length < 3 && (
              <div className="flex flex-wrap items-center gap-1.5">
                {favorites
                  .map(favoriteToSpot)
                  .filter((item) =>
                    !spotItems.some((selected) =>
                      selected.latitude.toFixed(4) ===
                        item.latitude.toFixed(4) &&
                      selected.longitude.toFixed(4) ===
                        item.longitude.toFixed(4)
                    )
                  )
                  .slice(0, 4)
                  .map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => addSpot(item)}
                      className="min-h-9 rounded-full border border-border px-2.5 text-xs font-medium text-muted-foreground transition hover:border-primary/40 hover:text-primary"
                    >
                      + {item.name}
                    </button>
                  ))}
              </div>
            )}
            {spotItems.length < 3 && (
              <label className="relative block">
                <span className="sr-only">搜索要对比的机位</span>
                <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="搜索地标加入对比，例如雷峰塔…"
                  className="h-10 w-full rounded-xl border border-border bg-background pl-9 pr-9 text-sm outline-none focus:border-primary/60"
                />
                {searching && (
                  <LoaderCircle className="absolute right-3 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-primary" />
                )}
              </label>
            )}
            {places.length > 0 && (
              <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border bg-background">
                {places.map((place) => (
                  <li key={place.id}>
                    <button
                      type="button"
                      onClick={() => {
                        addSpot({
                          id: place.id,
                          name: place.name,
                          address: place.address,
                          latitude: place.latitude,
                          longitude: place.longitude,
                          precision: "MANUAL",
                          source: "POI",
                        });
                        setPlaces([]);
                        setQuery("");
                      }}
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs transition hover:bg-muted"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium">
                          {place.name}
                        </span>
                        <span className="block truncate text-muted-foreground">
                          {place.address || place.region}
                        </span>
                      </span>
                      <span className="shrink-0 text-primary">加入</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <p className="mt-3 text-xs leading-5 text-muted-foreground">
          对比沿用当前题材与窗口类型；只比较预报实际覆盖的时段，没有覆盖的窗口会标注并排除推荐。
        </p>
      </section>

      {items.length < 2 && (
        <p className="rounded-2xl border border-dashed border-border bg-card/60 p-5 text-sm text-muted-foreground">
          还需要至少 2 项才能对比。切到日期对比，或从收藏 / 搜索里加入另一个机位。
        </p>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-xs font-medium text-primary" role="status">
          <LoaderCircle className="size-4 animate-spin" />正在汇总各窗口…
        </div>
      )}
      {failure && (
        <ErrorNotice
          failure={failure}
          onRetry={() => setRetryToken((value) => value + 1)}
        />
      )}

      {result && (
        <>
          <section className="rounded-[var(--radius)] border border-primary/25 bg-primary/[0.05] p-4 shadow-sm sm:p-5">
            <p className="flex items-start gap-2 text-sm leading-6">
              <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
              <span>{result.reason}</span>
            </p>
            <ul className="mt-2 space-y-1 text-xs leading-5 text-muted-foreground">
              {result.warnings.map((warning) => <li key={warning}>· {warning}</li>)}
            </ul>
          </section>

          <div className="grid gap-3 lg:grid-cols-3">
            {result.items.map((item, index) => {
              const window = item.window;
              const best = result.bestIndex === index;
              return (
                <article
                  key={`${item.label}-${index}`}
                  className={`rounded-[var(--radius)] border bg-card p-4 shadow-sm ${
                    best ? "border-primary/50 ring-1 ring-primary/20" : "border-border"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-primary">
                        {best ? "更适合当前题材" : item.date}
                      </p>
                      <h4 className="mt-0.5 truncate font-semibold" title={item.label}>
                        {item.label}
                      </h4>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {item.date} · {item.location.name}
                      </p>
                    </div>
                    <span className="grid size-11 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-semibold tabular-nums text-primary">
                      {window?.score === null || window?.score === undefined
                        ? "—"
                        : Math.round(window.score)}
                    </span>
                  </div>

                  {window ? (
                    <>
                      <p className="mt-3 rounded-xl bg-muted/45 px-2.5 py-2 text-xs leading-5">
                        <span className="font-medium">{window.label}</span>
                        <span className="ml-1 tabular-nums text-muted-foreground">
                          {formatRange(window.start, window.end)}
                        </span>
                        <span className="mt-0.5 block text-muted-foreground">
                          建议 {formatTime(window.arrivalTime)} 到达 ·{" "}
                          {window.cameraDirection}
                        </span>
                      </p>
                      <dl className="mt-2 grid grid-cols-2 gap-1.5 text-xs">
                        <Row icon={Droplets} label="降雨" value={percent(window.precipitationProbability)} />
                        <Row icon={Wind} label="阵风" value={gust(window.windGust)} />
                        <Row icon={Cloud} label="总云量" value={percent(window.cloud)} />
                        <Row
                          icon={Cloud}
                          label="分层云"
                          value={
                            window.cloudHigh === null && window.cloudMid === null &&
                              window.cloudLow === null
                              ? "暂无数据"
                              : `高 ${percent(window.cloudHigh)} · 中 ${
                                percent(window.cloudMid)
                              } · 低 ${percent(window.cloudLow)}`
                          }
                        />
                      </dl>
                      <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        <span className="rounded-full bg-muted px-2 py-0.5">
                          置信度 {CONFIDENCE_LABELS[window.confidence]}
                        </span>
                        <span className="rounded-full bg-muted px-2 py-0.5">
                          预报覆盖 {window.coveredHours}/{window.totalHours} 小时
                        </span>
                        {window.partial && (
                          <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-amber-700 dark:text-amber-400">
                            部分覆盖
                          </span>
                        )}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        窗口方位 {window.cameraAzimuth === null
                          ? "待核实"
                          : `${compass(window.cameraAzimuth)} ${
                            Math.round(window.cameraAzimuth)
                          }°`}
                      </p>
                    </>
                  ) : (
                    <p className="mt-3 rounded-xl bg-muted/45 p-3 text-xs text-muted-foreground">
                      该日期没有可用窗口。
                    </p>
                  )}

                  {item.warnings.length > 0 && (
                    <ul className="mt-2 space-y-1 text-xs leading-4 text-amber-700 dark:text-amber-400">
                      {item.warnings.map((warning) => <li key={warning}>· {warning}</li>)}
                    </ul>
                  )}
                </article>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function Row({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Cloud;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg bg-muted/35 px-2 py-1.5">
      <dt className="flex items-center gap-1 text-xs text-muted-foreground">
        <Icon className="size-3" />{label}
      </dt>
      <dd className="mt-0.5 font-medium">{value}</dd>
    </div>
  );
}
