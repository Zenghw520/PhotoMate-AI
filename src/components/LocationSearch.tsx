import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Crosshair, MapPin, Search, SlidersHorizontal, X } from "lucide-react";
import { reverseLocation, searchLocations } from "@/src/lib/api";
import { precisionLabel } from "@/src/lib/format";
import type { LocationResult } from "@/functions/shared/contracts";

export function LocationSearch({ location, onSelect, autoLocate = false }: { location: LocationResult | null; onSelect: (location: LocationResult) => void; autoLocate?: boolean }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LocationResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const requestId = useRef(0);
  const autoAttempted = useRef(false);

  useEffect(() => {
    const value = query.trim();
    const currentRequest = ++requestId.current;
    if (value.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      setError("");
      try {
        const response = await searchLocations(value, controller.signal);
        if (requestId.current !== currentRequest) return;
        setResults(response.locations);
        setOpen(true);
        if (!response.locations.length) setError("没有找到匹配区县，请尝试更完整的名称。");
      } catch (reason) {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        if (requestId.current === currentRequest) setError(reason instanceof Error ? reason.message : "区县搜索暂不可用。");
      } finally {
        if (requestId.current === currentRequest) setSearching(false);
      }
    }, 450);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  function choose(item: LocationResult) {
    onSelect(item);
    setQuery("");
    setResults([]);
    setOpen(false);
    setManualOpen(false);
    setError("");
  }

  function locate(silent = false) {
    setError("");
    if (!navigator.geolocation) {
      if (!silent) setError("当前浏览器不支持定位，请搜索区县或手动输入坐标。");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          if (!isInChina(coords.latitude, coords.longitude)) {
            if (!silent) setError("当前版本仅支持中国境内拍摄位置。");
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
          setError("");
        } finally {
          setLocating(false);
        }
      },
      (geoError) => {
        setLocating(false);
        if (silent) return;
        setError(geoError.code === geoError.PERMISSION_DENIED ? "定位权限未开启，可搜索区县或手动输入坐标。" : "暂时无法获取位置，请稍后重试或搜索区县。");
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
      setError("请输入有效的经纬度：纬度 -90～90，经度 -180～180。");
      return;
    }
    if (!isInChina(lat, lng)) {
      setError("当前版本仅支持中国境内坐标：纬度 3～54，经度 73～135。");
      return;
    }
    onSelect({ name: "手动位置", latitude: lat, longitude: lng, precision: "MANUAL", timezone: "Asia/Shanghai" });
    setManualOpen(false);
    setError("");
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">搜索城市或区县</span>
          <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            id="main-location-search"
            value={query}
            onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
            onFocus={() => results.length && setOpen(true)}
            placeholder="搜索城市或区县，例如惠州、惠城区…"
            autoComplete="off"
            className="pm-corners h-12 w-full border border-border bg-card pl-11 pr-11 text-sm outline-none transition focus:border-[var(--ov-cold)] focus:ring-0"
          />
          {searching ? <LoaderCircle className="absolute right-4 top-1/2 size-4 -translate-y-1/2 animate-spin text-primary" /> : query ? (
            <button type="button" aria-label="清空搜索" onClick={() => { setQuery(""); setResults([]); }} className="absolute right-0.5 top-1/2 grid size-11 -translate-y-1/2 place-items-center text-muted-foreground transition hover:text-[var(--ov-cold)]">
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
          className="grid size-12 shrink-0 place-items-center border border-border bg-card text-muted-foreground transition hover:border-[var(--ov-cold)] hover:text-[var(--ov-cold)] disabled:opacity-60"
        >
          {locating ? <LoaderCircle className="size-4 animate-spin text-primary" /> : <Crosshair className="size-4" />}
        </button>
      </div>

      <div className="mt-3 flex min-h-6 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {location
          ? <span className="inline-flex flex-wrap items-center gap-1.5"><MapPin className="size-3.5 text-primary" />{location.name}<span className="text-border">·</span>{precisionLabel(location.precision)}</span>
          : <span>{locating ? "正在使用当前位置…" : "搜索城市或区县，或点击右侧定位。"}</span>}
        <button type="button" onClick={() => setManualOpen((value) => !value)} className="inline-flex min-h-11 items-center gap-1 font-medium hover:text-[var(--ov-cold)]">
          <SlidersHorizontal className="size-3.5" />输入经纬度
        </button>
      </div>

      {error && <p className="mt-2 text-sm text-destructive" role="alert">{error}</p>}

      {open && results.length > 0 && (
        <div className="absolute left-0 right-0 top-14 z-30 overflow-hidden border border-border bg-popover p-1.5 shadow-xl">
          {results.map((item) => (
            <button key={`${item.id}-${item.latitude}-${item.longitude}`} type="button" onClick={() => choose(item)} className="flex w-full items-center gap-3 px-3 py-3 text-left transition hover:bg-muted hover:text-[var(--ov-cold)]">
              <MapPin className="size-4 shrink-0 text-primary" />
              <span className="min-w-0"><span className="block truncate text-sm font-medium">{item.name}</span><span className="block truncate text-xs text-muted-foreground">{item.region ?? "中国区县"}</span></span>
            </button>
          ))}
        </div>
      )}

      {manualOpen && (
        <form onSubmit={submitManual} className="mt-3 grid gap-2 border border-border bg-card/70 p-3 sm:grid-cols-[1fr_1fr_auto]">
          <label><span className="mb-1 block text-xs text-muted-foreground">纬度</span><input required inputMode="decimal" value={latitude} onChange={(event) => setLatitude(event.target.value)} placeholder="39.9042" className="h-10 w-full border border-border bg-background px-3 text-sm outline-none focus:border-[var(--ov-cold)] focus:ring-0" /></label>
          <label><span className="mb-1 block text-xs text-muted-foreground">经度</span><input required inputMode="decimal" value={longitude} onChange={(event) => setLongitude(event.target.value)} placeholder="116.4074" className="h-10 w-full border border-border bg-background px-3 text-sm outline-none focus:border-[var(--ov-cold)] focus:ring-0" /></label>
          <button type="submit" className="pm-action pm-action--solid h-10 self-end px-4">应用坐标</button>
        </form>
      )}
    </div>
  );
}

function isInChina(latitude: number, longitude: number) {
  return latitude >= 3 && latitude <= 54 && longitude >= 73 && longitude <= 135;
}
