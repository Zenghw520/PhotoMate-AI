import { useEffect, useRef, useState } from "react";
import {
  Crosshair,
  LoaderCircle,
  MapPin,
  Pencil,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { reverseLocation, searchLocations } from "@/src/lib/api";
import { describeFailure, geolocationFailure, type Failure } from "@/src/lib/errors";
import { precisionLabel } from "@/src/lib/format";
import type { LocationResult } from "@/functions/shared/contracts";
import { ErrorNotice } from "@/src/components/CapabilityNotice";

export function LocationSearch({ location, onSelect, autoLocate = false }: { location: LocationResult | null; onSelect: (location: LocationResult) => void; autoLocate?: boolean }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LocationResult[]>([]);
  const [resultsQuery, setResultsQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [open, setOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [retryToken, setRetryToken] = useState(0);
  const requestId = useRef(0);
  const autoAttempted = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const value = query.trim();
    const currentRequest = ++requestId.current;
    if (value.length < 2) {
      setResults([]);
      setResultsQuery("");
      setSearching(false);
      setFailure(null);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      setFailure(null);
      try {
        const response = await searchLocations(value, controller.signal);
        if (requestId.current !== currentRequest) return;
        setResults(response.locations);
        setResultsQuery(value);
        setOpen(true);
        if (!response.locations.length) {
          setFailure({
            kind: "not-found",
            title: "没有找到匹配地点",
            message: response.message ?? "请尝试更完整的区县名称，或改用手动坐标。",
            retryable: true,
          });
        }
      } catch (reason) {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        if (requestId.current === currentRequest) {
          setFailure(describeFailure(reason, "location"));
        }
      } finally {
        if (requestId.current === currentRequest) setSearching(false);
      }
    }, 450);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, retryToken]);

  function choose(item: LocationResult) {
    onSelect(item);
    setQuery("");
    setResults([]);
    setResultsQuery("");
    setOpen(false);
    setManualOpen(false);
    setFailure(null);
  }

  function locate(silent = false) {
    setFailure(null);
    if (!navigator.geolocation) {
      if (!silent) {
        setFailure({
          kind: "service",
          title: "浏览器不支持定位",
          message: "请搜索区县，或手动输入坐标。",
          retryable: false,
        });
      }
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          if (!isInChina(coords.latitude, coords.longitude)) {
            if (!silent) {
              setFailure({
                kind: "not-found",
                title: "当前位置暂不支持",
                message: "当前版本仅支持中国境内拍摄位置，请搜索区县或手动输入坐标。",
                retryable: false,
              });
            }
            return;
          }
          try {
            const result = await reverseLocation(coords.latitude, coords.longitude);
            onSelect({ ...result, precision: "GPS" });
          } catch {
            onSelect({ name: "当前位置", region: "地名未解析", latitude: coords.latitude, longitude: coords.longitude, precision: "GPS", timezone: "Asia/Shanghai" });
          }
          setManualOpen(false);
          setLatitude("");
          setLongitude("");
          setFailure(null);
        } finally {
          setLocating(false);
        }
      },
      (geoError) => {
        setLocating(false);
        if (silent) return;
        setFailure(geolocationFailure(geoError));
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  }

  useEffect(() => {
    if (!autoLocate || location) return;
    if (!navigator.geolocation || !navigator.permissions?.query) return;
    let disposed = false;
    navigator.permissions.query({ name: "geolocation" as PermissionName })
      .then((permission) => {
        if (
          !disposed && permission.state === "granted" &&
          !autoAttempted.current
        ) {
          autoAttempted.current = true;
          locate(true);
        }
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
    };
  }, [autoLocate, location]);

  function submitManual(event: React.FormEvent) {
    event.preventDefault();
    const lat = Number(latitude);
    const lng = Number(longitude);
    if (!latitude.trim() || !longitude.trim() || !Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      setFailure({
        kind: "input",
        title: "坐标格式不正确",
        message: "请输入有效的经纬度：纬度 -90～90，经度 -180～180。",
        retryable: false,
      });
      return;
    }
    if (!isInChina(lat, lng)) {
      setFailure({
        kind: "input",
        title: "坐标不在支持范围内",
        message: "当前版本仅支持中国境内坐标：纬度 3～54，经度 73～135。",
        retryable: false,
      });
      return;
    }
    onSelect({ name: "手动位置", latitude: lat, longitude: lng, precision: "MANUAL", timezone: "Asia/Shanghai" });
    setManualOpen(false);
    setFailure(null);
  }

  function openManual() {
    setManualOpen(true);
    setFailure(null);
    setOpen(false);
  }

  const showResults = open && results.length > 0 && resultsQuery === query.trim();
  const retry = () => {
    if (query.trim().length >= 2) setRetryToken((value) => value + 1);
    else inputRef.current?.focus();
  };

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">搜索城市或区县</span>
          <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={inputRef}
            id="main-location-search"
            value={query}
            onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
            onFocus={() => { if (results.length > 0 && resultsQuery === query.trim()) setOpen(true); }}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              if (results.length > 0 && resultsQuery === query.trim()) choose(results[0]);
              else retry();
            }}
            placeholder="搜索城市或区县，例如惠州、惠城区…"
            autoComplete="off"
            aria-expanded={showResults}
            aria-controls="location-search-results"
            className="h-12 w-full rounded-2xl border border-border bg-card/85 pl-11 pr-11 text-sm shadow-sm outline-none transition focus:border-primary/60 focus:ring-4 focus:ring-primary/10"
          />
          {searching ? <LoaderCircle className="absolute right-4 top-1/2 size-4 -translate-y-1/2 animate-spin text-primary" /> : query ? (
            <button type="button" aria-label="清空搜索" onClick={() => { setQuery(""); setResults([]); setFailure(null); }} className="absolute right-0.5 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:bg-muted">
              <X className="size-4" />
            </button>
          ) : null}
        </label>
        <button
          type="button"
          onClick={() => locate(false)}
          disabled={locating}
          aria-label="使用当前位置"
          title="使用当前位置"
          className="grid size-12 shrink-0 place-items-center rounded-2xl border border-border bg-card text-muted-foreground shadow-sm transition hover:text-foreground disabled:opacity-60"
        >
          {locating ? <LoaderCircle className="size-4 animate-spin text-primary" /> : <Crosshair className="size-4" />}
        </button>
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {locating
          ? "正在获取当前位置"
          : searching
          ? "正在搜索地点"
          : showResults
          ? `找到 ${results.length} 个地点`
          : ""}
      </p>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/80 bg-card/70 px-3 py-2 text-xs">
        <span className="flex min-w-0 items-center gap-1.5">
          <MapPin className="size-4 shrink-0 text-primary" />
          {location ? (
            <>
              <span className="shrink-0 text-muted-foreground">拍摄位置</span>
              <strong className="truncate font-medium">{location.name}</strong>
              <span className="shrink-0 text-muted-foreground">
                · {precisionLabel(location.precision)}
              </span>
            </>
          ) : (
            <span className="text-muted-foreground">
              {locating ? "正在使用当前位置…" : "尚未选择拍摄位置"}
            </span>
          )}
        </span>
        <span className="flex shrink-0 items-center gap-1">
          {location && (
            <button
              type="button"
              onClick={() => inputRef.current?.focus()}
              className="inline-flex min-h-9 items-center gap-1 rounded-full px-2.5 font-medium text-primary transition hover:bg-primary/10"
            >
              <Pencil className="size-3.5" />更改
            </button>
          )}
          <button
            type="button"
            onClick={() => manualOpen ? setManualOpen(false) : openManual()}
            aria-expanded={manualOpen}
            className="inline-flex min-h-9 items-center gap-1 rounded-full px-2.5 font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <SlidersHorizontal className="size-3.5" />手动坐标
          </button>
        </span>
      </div>

      {failure && (
        <div className="mt-2">
          <ErrorNotice
            compact
            failure={failure}
            onRetry={failure.retryable ? retry : undefined}
            secondary={failure.kind === "input" ? undefined : { label: "手动坐标", onClick: openManual }}
          />
        </div>
      )}

      {showResults && (
        <div
          id="location-search-results"
          role="listbox"
          aria-label="地点搜索结果"
          className="absolute left-0 right-0 top-14 z-30 overflow-hidden rounded-2xl border border-border bg-popover p-1.5 shadow-xl"
        >
          {results.map((item) => (
            <button
              key={`${item.id}-${item.latitude}-${item.longitude}`}
              type="button"
              role="option"
              aria-selected={false}
              onClick={() => choose(item)}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-muted"
            >
              <MapPin className="size-4 shrink-0 text-primary" />
              <span className="min-w-0"><span className="block truncate text-sm font-medium">{item.name}</span><span className="block truncate text-xs text-muted-foreground">{item.region ?? "中国区县"}</span></span>
            </button>
          ))}
        </div>
      )}

      {manualOpen && (
        <form onSubmit={submitManual} className="mt-3 grid gap-2 rounded-2xl border border-border bg-card/70 p-3 sm:grid-cols-[1fr_1fr_auto]">
          <label><span className="mb-1 block text-xs text-muted-foreground">纬度</span><input required inputMode="decimal" value={latitude} onChange={(event) => setLatitude(event.target.value)} placeholder="39.9042" className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30" /></label>
          <label><span className="mb-1 block text-xs text-muted-foreground">经度</span><input required inputMode="decimal" value={longitude} onChange={(event) => setLongitude(event.target.value)} placeholder="116.4074" className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30" /></label>
          <button type="submit" className="h-10 self-end rounded-xl bg-foreground px-4 text-sm font-medium text-background hover:opacity-85">应用坐标</button>
        </form>
      )}
    </div>
  );
}

function isInChina(latitude: number, longitude: number) {
  return latitude >= 3 && latitude <= 54 && longitude >= 73 && longitude <= 135;
}
