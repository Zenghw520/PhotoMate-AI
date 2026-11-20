import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Compass,
  Crosshair,
  LoaderCircle,
  MapPin,
  Minus,
  Navigation,
  Plus,
  Search,
  Star,
  Trash2,
} from "lucide-react";
import type {
  TimelineItem,
} from "@/functions/shared/contracts";
import { searchPlaces, type PlaceResult } from "@/src/lib/api";
import { formatCoordinate, metersPerPixel, offsetMeters } from "@/src/lib/geo";
import {
  addFavorite,
  favoriteToSpot,
  readFavorites,
  removeFavorite,
  subscribeFavorites,
  type FavoriteSpot,
} from "@/src/lib/favorites";
import {
  spotSourceLabel,
  type ShootingSpot,
} from "@/src/lib/shooting";
import { compass } from "@/src/lib/format";

const MAP_WIDTH = 640;
const MAP_HEIGHT = 360;
const MIN_ZOOM = 12;
const MAX_ZOOM = 18;

export function SpotPicker({
  spot,
  slot,
  onChooseSpot,
  onChangeLocation,
}: {
  spot: ShootingSpot;
  slot: TimelineItem | null;
  onChooseSpot: (
    spot: ShootingSpot,
    options?: { resetDate?: boolean; slotKind?: TimelineItem["kind"] | null },
  ) => void;
  onChangeLocation: () => void;
}) {
  const [query, setQuery] = useState("");
  const [places, setPlaces] = useState<PlaceResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [zoom, setZoom] = useState(16);
  const [mapFailed, setMapFailed] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [latitude, setLatitude] = useState(spot.latitude.toFixed(5));
  const [longitude, setLongitude] = useState(spot.longitude.toFixed(5));
  const [coordError, setCoordError] = useState("");
  const [favorites, setFavorites] = useState<FavoriteSpot[]>([]);
  const [favoriteName, setFavoriteName] = useState(spot.name);
  const [savedFavorite, setSavedFavorite] = useState(false);
  const requestRef = useRef(0);

  useEffect(() => {
    setLatitude(spot.latitude.toFixed(5));
    setLongitude(spot.longitude.toFixed(5));
    setCoordError("");
    setFavoriteName((previous) =>
      previous === spot.name ? previous : spot.name
    );
    setSavedFavorite(false);
  }, [spot.id, spot.latitude, spot.longitude]);

  useEffect(() => {
    setFavorites(readFavorites());
    return subscribeFavorites(() => setFavorites(readFavorites()));
  }, []);

  useEffect(() => {
    const value = query.trim();
    if (value.length < 2) {
      setPlaces([]);
      setSearching(false);
      setSearchError("");
      return;
    }
    const controller = new AbortController();
    const current = ++requestRef.current;
    const timer = window.setTimeout(async () => {
      setSearching(true);
      setSearchError("");
      try {
        const response = await searchPlaces(value, controller.signal);
        if (requestRef.current !== current) return;
        setPlaces(response.places);
        if (!response.places.length) setSearchError("没有找到匹配的地标，可换一个名称。");
      } catch (reason) {
        if (reason instanceof DOMException && reason.name === "AbortError") {
          return;
        }
        if (requestRef.current === current) {
          setSearchError("地标检索暂不可用，可直接微调经纬度。");
          setPlaces([]);
        }
      } finally {
        if (requestRef.current === current) setSearching(false);
      }
    }, 420);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const azimuth = slot?.solar.azimuth ?? null;
  const mapSrc = `/functions/v1/app/map/static?lat=${
    spot.latitude.toFixed(6)
  }&lng=${spot.longitude.toFixed(6)}&zoom=${zoom}`;

  function pick(coords: { latitude: number; longitude: number }, name?: string, source: ShootingSpot["source"] = "POI") {
    if (
      coords.latitude < 3 || coords.latitude > 54 || coords.longitude < 73 ||
      coords.longitude > 135
    ) {
      setCoordError("当前版本仅支持中国境内机位。");
      return;
    }
    setCoordError("");
    onChooseSpot({
      ...spot,
      name: name ?? spot.name,
      latitude: Number(coords.latitude.toFixed(6)),
      longitude: Number(coords.longitude.toFixed(6)),
      precision: "MANUAL",
      source,
    });
  }

  function handleMapClick(event: React.MouseEvent<HTMLImageElement>) {
    if (!mapReady) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width * MAP_WIDTH;
    const y = (event.clientY - rect.top) / rect.height * MAP_HEIGHT;
    const meters = metersPerPixel(spot.latitude, zoom);
    const next = offsetMeters(
      spot.latitude,
      spot.longitude,
      (x - MAP_WIDTH / 2) * meters,
      (MAP_HEIGHT / 2 - y) * meters,
    );
    pick(next, spot.name, "MANUAL");
  }

  function applyCoordinates(event: React.FormEvent) {
    event.preventDefault();
    const lat = Number(latitude);
    const lng = Number(longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      setCoordError("请输入有效数字。");
      return;
    }
    if (lat < 3 || lat > 54 || lng < 73 || lng > 135) {
      setCoordError("当前版本仅支持中国境内坐标：纬度 3～54，经度 73～135。");
      return;
    }
    pick({ latitude: lat, longitude: lng }, spot.name, "MANUAL");
  }

  function nudge(eastMeters: number, northMeters: number) {
    pick(
      offsetMeters(spot.latitude, spot.longitude, eastMeters, northMeters),
      spot.name,
      "MANUAL",
    );
  }

  function saveFavorite() {
    addFavorite(spot, favoriteName);
    setSavedFavorite(true);
  }

  return (
    <section className="space-y-4">
      <div className="rounded-[var(--radius)] border border-border bg-card p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Crosshair className="size-4 text-primary" />精确机位
            </h3>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              搜索地标、在地图上点选，或直接微调坐标；机位会同步到天气、光线与方案。
            </p>
          </div>
          <button
            type="button"
            onClick={onChangeLocation}
            className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full px-3 text-xs font-medium text-primary transition hover:bg-primary/10"
          >
            返回区县搜索
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-muted/40 px-3 py-2 text-xs">
          <MapPin className="size-3.5 shrink-0 text-primary" />
          <strong className="min-w-0 truncate">{spot.name}</strong>
          <span className="rounded-full bg-card px-2 py-0.5 text-muted-foreground">
            {spotSourceLabel(spot.source)}
          </span>
          <span className="tabular-nums text-muted-foreground">
            {formatCoordinate(spot.latitude, spot.longitude)}
          </span>
        </div>

        <label className="relative mt-3 block">
          <span className="sr-only">搜索地标或地点</span>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索地标或 POI，例如雷峰塔、断桥残雪…"
            className="h-11 w-full rounded-2xl border border-border bg-background pl-10 pr-10 text-sm outline-none transition focus:border-primary/60 focus:ring-4 focus:ring-primary/10"
            aria-expanded={places.length > 0}
          />
          {searching && (
            <LoaderCircle className="absolute right-3.5 top-1/2 size-4 -translate-y-1/2 animate-spin text-primary" />
          )}
        </label>
        {searchError && (
          <p className="mt-1.5 text-xs leading-5 text-amber-700 dark:text-amber-400">
            {searchError}
          </p>
        )}
        {places.length > 0 && (
          <ul className="mt-2 divide-y divide-border/60 overflow-hidden rounded-xl border border-border bg-background">
            {places.map((place) => (
              <li key={place.id}>
                <button
                  type="button"
                  onClick={() => {
                    pick({
                      latitude: place.latitude,
                      longitude: place.longitude,
                    }, place.name, "POI");
                    setPlaces([]);
                    setQuery("");
                  }}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-muted"
                >
                  <MapPin className="size-4 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {place.name}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {place.address || place.region || "地址未提供"}
                    </span>
                  </span>
                  <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-[var(--radius)] border border-border bg-card p-3 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 px-1 pb-2">
          <p className="text-xs font-medium">机位方位图</p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="缩小"
              onClick={() => setZoom((value) => Math.max(MIN_ZOOM, value - 1))}
              disabled={zoom <= MIN_ZOOM}
              className="grid size-9 place-items-center rounded-full bg-muted text-muted-foreground transition hover:text-foreground disabled:opacity-50"
            >
              <Minus className="size-3.5" />
            </button>
            <span className="w-10 text-center text-xs tabular-nums text-muted-foreground">
              {zoom} 级
            </span>
            <button
              type="button"
              aria-label="放大"
              onClick={() => setZoom((value) => Math.min(MAX_ZOOM, value + 1))}
              disabled={zoom >= MAX_ZOOM}
              className="grid size-9 place-items-center rounded-full bg-muted text-muted-foreground transition hover:text-foreground disabled:opacity-50"
            >
              <Plus className="size-3.5" />
            </button>
          </div>
        </div>

        {mapFailed ? (
          <div className="grid gap-3 rounded-xl border border-dashed border-border bg-muted/30 p-4 sm:grid-cols-[auto_1fr] sm:items-center">
            <CompassDial azimuth={azimuth} size={132} />
            <div>
              <p className="text-sm font-medium">地图暂不可用</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                仍可用下方经纬度微调，或用右侧罗盘确认相机朝向。地图恢复后会自动显示。
              </p>
              <button
                type="button"
                onClick={() => {
                  setMapFailed(false);
                  setMapReady(false);
                }}
                className="mt-2 inline-flex min-h-9 items-center rounded-full border border-border px-3 text-xs font-medium transition hover:text-primary"
              >
                重新加载地图
              </button>
            </div>
          </div>
        ) : (
          <div className="relative overflow-hidden rounded-xl bg-muted">
            <img
              key={mapSrc}
              src={mapSrc}
              alt={`${spot.name} 周边地图，正北朝上`}
              className="block aspect-[16/9] w-full cursor-crosshair object-cover"
              onClick={handleMapClick}
              onLoad={() => {
                setMapReady(true);
                setMapFailed(false);
              }}
              onError={() => {
                setMapReady(false);
                setMapFailed(true);
              }}
            />
            {mapReady && (
              <svg
                viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
                className="pointer-events-none absolute inset-0 h-full w-full"
                aria-hidden="true"
              >
                {azimuth !== null && (
                  <>
                    <line
                      x1={MAP_WIDTH / 2}
                      y1={MAP_HEIGHT / 2}
                      x2={MAP_WIDTH / 2 + Math.sin(azimuth * Math.PI / 180) * 160}
                      y2={MAP_HEIGHT / 2 - Math.cos(azimuth * Math.PI / 180) * 160}
                      stroke="var(--color-primary, #ed9b4b)"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeDasharray="6 5"
                    />
                    <circle
                      cx={MAP_WIDTH / 2 + Math.sin(azimuth * Math.PI / 180) * 160}
                      cy={MAP_HEIGHT / 2 - Math.cos(azimuth * Math.PI / 180) * 160}
                      r="9"
                      fill="var(--color-primary, #ed9b4b)"
                      opacity="0.9"
                    />
                  </>
                )}
                <circle
                  cx={MAP_WIDTH / 2}
                  cy={MAP_HEIGHT / 2}
                  r="10"
                  fill="none"
                  stroke="#fff"
                  strokeWidth="4"
                />
                <circle
                  cx={MAP_WIDTH / 2}
                  cy={MAP_HEIGHT / 2}
                  r="7"
                  fill="#c86b18"
                  stroke="#fff"
                  strokeWidth="2"
                />
              </svg>
            )}
            {mapReady && (
              <>
                <span className="pointer-events-none absolute left-1/2 top-1.5 -translate-x-1/2 rounded-full bg-black/45 px-1.5 text-[11px] font-medium leading-4 text-white">北</span>
                <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full bg-black/45 px-1.5 text-[11px] font-medium leading-4 text-white">东</span>
                <span className="pointer-events-none absolute bottom-1.5 left-1/2 -translate-x-1/2 rounded-full bg-black/45 px-1.5 text-[11px] font-medium leading-4 text-white">南</span>
                <span className="pointer-events-none absolute left-1.5 top-1/2 -translate-y-1/2 rounded-full bg-black/45 px-1.5 text-[11px] font-medium leading-4 text-white">西</span>
              </>
            )}
            <span className="pointer-events-none absolute left-2 top-2 rounded-full bg-black/45 px-2 py-0.5 text-xs text-white">
              正北朝上 · 点击地图落针
            </span>
            {azimuth !== null && (
              <span className="pointer-events-none absolute bottom-2 left-2 rounded-full bg-black/45 px-2 py-0.5 text-xs text-white">
                虚线：相机朝向 {compass(azimuth)} {Math.round(azimuth)}°
              </span>
            )}
          </div>
        )}

        {azimuth === null && (
          <p className="mt-2 px-1 text-xs leading-5 text-muted-foreground">
            选择光线窗口后，会在地图上画出该时段的相机朝向。
          </p>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
        <form
          onSubmit={applyCoordinates}
          className="rounded-[var(--radius)] border border-border bg-card p-4 shadow-sm"
        >
          <h4 className="text-sm font-semibold">经纬度微调</h4>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            地图不可用时也能继续；坐标为 WGS-84，精确到小数点后 5 位约 1 米。
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs text-muted-foreground">纬度</span>
              <input
                value={latitude}
                onChange={(event) => setLatitude(event.target.value)}
                inputMode="decimal"
                className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary/60"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-muted-foreground">经度</span>
              <input
                value={longitude}
                onChange={(event) => setLongitude(event.target.value)}
                inputMode="decimal"
                className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary/60"
              />
            </label>
          </div>
          {coordError && (
            <p className="mt-2 text-xs leading-5 text-destructive">{coordError}</p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <Nudge label="北 50m" onClick={() => nudge(0, 50)} />
            <Nudge label="南 50m" onClick={() => nudge(0, -50)} />
            <Nudge label="西 50m" onClick={() => nudge(-50, 0)} />
            <Nudge label="东 50m" onClick={() => nudge(50, 0)} />
            <button
              type="submit"
              className="ml-auto inline-flex min-h-10 items-center gap-1 rounded-full bg-primary px-3.5 text-xs font-semibold text-primary-foreground transition hover:opacity-90"
            >
              应用坐标
            </button>
          </div>
        </form>

        <div className="rounded-[var(--radius)] border border-border bg-card p-4 shadow-sm">
          <h4 className="flex items-center gap-1.5 text-sm font-semibold">
            <Compass className="size-4 text-primary" />方位罗盘
          </h4>
          <div className="mt-2 grid place-items-center">
            <CompassDial azimuth={azimuth} size={150} />
          </div>
          <p className="mt-2 text-center text-xs leading-5 text-muted-foreground">
            {azimuth === null
              ? "选择窗口后显示"
              : `面朝 ${compass(azimuth)} ${Math.round(azimuth)}°`}
          </p>
        </div>
      </div>

      <div className="rounded-[var(--radius)] border border-border bg-card p-4 shadow-sm sm:p-5">
        <h4 className="flex items-center gap-1.5 text-sm font-semibold">
          <Star className="size-4 text-primary" />收藏机位
        </h4>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          给当前机位起个名字，保存在本机；下次可直接调用并继续排光线。
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            value={favoriteName}
            onChange={(event) => {
              setFavoriteName(event.target.value.slice(0, 40));
              setSavedFavorite(false);
            }}
            placeholder="例如：曲院风荷·荷塘前景"
            className="h-10 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary/60"
          />
          <button
            type="button"
            onClick={saveFavorite}
            disabled={savedFavorite}
            className="inline-flex min-h-10 items-center gap-1 rounded-full border border-primary/40 px-3 text-xs font-semibold text-primary transition hover:bg-primary/10 disabled:opacity-60"
          >
            <Star className="size-3.5" />{savedFavorite ? "已收藏" : "收藏当前机位"}
          </button>
        </div>
        {favorites.length > 0 ? (
          <ul className="mt-3 divide-y divide-border/60">
            {favorites.slice(0, 8).map((favorite) => (
              <li
                key={favorite.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{favorite.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {spotSourceLabel(favorite.source)} ·{" "}
                    {formatCoordinate(favorite.latitude, favorite.longitude)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onChooseSpot(favoriteToSpot(favorite))}
                    className="inline-flex min-h-9 items-center gap-1 rounded-full px-2.5 text-xs font-medium text-primary transition hover:bg-primary/10"
                  >
                    <Navigation className="size-3" />使用
                  </button>
                  <button
                    type="button"
                    onClick={() => removeFavorite(favorite.id)}
                    aria-label={`删除收藏 ${favorite.name}`}
                    className="grid size-9 place-items-center rounded-full text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 rounded-xl bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            还没有收藏机位。
          </p>
        )}
      </div>
    </section>
  );
}

function Nudge({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-9 items-center rounded-full bg-muted px-2.5 text-xs text-muted-foreground transition hover:text-foreground"
    >
      {label}
    </button>
  );
}

function CompassDial({
  azimuth,
  size,
}: {
  azimuth: number | null;
  size: number;
}) {
  const radius = size / 2 - 10;
  const rad = (azimuth ?? 0) * Math.PI / 180;
  const x = size / 2 + Math.sin(rad) * radius * 0.86;
  const y = size / 2 - Math.cos(rad) * radius * 0.86;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={azimuth === null
        ? "相机朝向待选择"
        : `相机朝向 ${compass(azimuth)} ${Math.round(azimuth)} 度`}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        className="text-border"
        strokeWidth="1"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius * 0.55}
        fill="none"
        stroke="currentColor"
        className="text-border"
        strokeWidth="1"
        strokeDasharray="3 4"
      />
      {[
        ["北", size / 2, 14],
        ["东", size - 12, size / 2 + 4],
        ["南", size / 2, size - 6],
        ["西", 12, size / 2 + 4],
      ].map(([label, cx, cy]) => (
        <text
          key={label as string}
          x={cx as number}
          y={cy as number}
          textAnchor="middle"
          fontSize="11"
          className="fill-muted-foreground"
        >
          {label}
        </text>
      ))}
      {azimuth !== null && (
        <>
          <line
            x1={size / 2}
            y1={size / 2}
            x2={x}
            y2={y}
            stroke="currentColor"
            className="text-primary"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <circle cx={x} cy={y} r="4" className="fill-primary" />
        </>
      )}
      <circle cx={size / 2} cy={size / 2} r="4" className="fill-foreground" />
    </svg>
  );
}
