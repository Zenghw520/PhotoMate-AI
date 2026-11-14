import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Crosshair, MapPin, Search, SlidersHorizontal, X } from "lucide-react";
import { reverseLocation, searchLocations } from "@/src/lib/api";
import { precisionLabel } from "@/src/lib/format";
import type { LocationResult } from "@/functions/shared/contracts";

export function LocationSearch({ location, onSelect }: { location: LocationResult | null; onSelect: (location: LocationResult) => void }) {
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

  function locate() {
    setError("");
    if (!navigator.geolocation) {
      setError("当前浏览器不支持定位，请搜索区县或手动输入坐标。");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          if (!isInChina(coords.latitude, coords.longitude)) {
            setError("当前版本仅支持中国境内拍摄位置。");
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
        setError(geoError.code === geoError.PERMISSION_DENIED ? "定位权限未开启，可搜索区县或手动输入坐标。" : "暂时无法获取位置，请稍后重试或搜索区县。");
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  }

  function submitManual(event: React.FormEvent) {
    event.preventDefault();
    const lat = Number(latitude);
    const lng = Number(longitude);
    if (!latitude.trim() || !longitude.trim() || !Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      setError("请输入有效的经纬度：纬度 -90～90，经度 -180～180。");
      return;
    }
    if (!isInChina(lat, lng)) {
      setError("当前版本仅支持中国境内坐标：纬度 18～54，经度 73～135。");
      return;
    }
    onSelect({ name: "手动位置", latitude: lat, longitude: lng, precision: "MANUAL", timezone: "Asia/Shanghai" });
    setManualOpen(false);
    setError("");
  }

  return (
    <div className="relative">
      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">搜索城市或区县</span>
          <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
            onFocus={() => results.length && setOpen(true)}
            placeholder="搜索城市或区县，例如惠州、惠城区…"
            autoComplete="off"
            className="h-12 w-full rounded-2xl border border-border bg-card/85 pl-11 pr-11 text-sm shadow-sm outline-none transition focus:border-primary/60 focus:ring-4 focus:ring-primary/10"
          />
          {searching ? <LoaderCircle className="absolute right-4 top-1/2 size-4 -translate-y-1/2 animate-spin text-primary" /> : query ? (
            <button type="button" aria-label="清空搜索" onClick={() => { setQuery(""); setResults([]); }} className="absolute right-0.5 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:bg-muted">
              <X className="size-4" />
            </button>
          ) : null}
        </label>
        <button type="button" onClick={locate} disabled={locating} className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-2xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90 disabled:opacity-60">
          {locating ? <LoaderCircle className="size-4 animate-spin" /> : <Crosshair className="size-4" />}
          {locating ? "定位中" : "使用当前位置"}
        </button>
      </div>

      <div className="mt-3 flex min-h-6 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {location && <span className="inline-flex flex-wrap items-center gap-1.5"><MapPin className="size-3.5 text-primary" />{location.name}<span className="text-border">·</span>{precisionLabel(location.precision)}</span>}
        <button type="button" onClick={() => setManualOpen((value) => !value)} className="inline-flex min-h-11 items-center gap-1 font-medium hover:text-foreground">
          <SlidersHorizontal className="size-3.5" />输入经纬度
        </button>
        {!location && <span>搜索结果精确到区县。</span>}
      </div>

      {error && <p className="mt-2 text-sm text-destructive" role="alert">{error}</p>}

      {open && results.length > 0 && (
        <div className="absolute left-0 right-0 top-14 z-30 overflow-hidden rounded-2xl border border-border bg-popover p-1.5 shadow-xl">
          {results.map((item) => (
            <button key={`${item.id}-${item.latitude}-${item.longitude}`} type="button" onClick={() => choose(item)} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-muted">
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
  return latitude >= 18 && latitude <= 54 && longitude >= 73 && longitude <= 135;
}
