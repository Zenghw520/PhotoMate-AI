import { useEffect, useMemo, useState } from "react";
import {
  Compass,
  Info,
  LoaderCircle,
  MoonStar,
  Sun,
  Sunrise,
  Sunset,
} from "lucide-react";
import type {
  LocationResult,
  SolarData,
  TimeWindow,
} from "@/functions/shared/contracts";
import { compass, formatRange, formatTime } from "@/src/lib/format";
import {
  horizonAt,
  loadTerrainHorizon,
  TerrainError,
  type TerrainHorizon,
} from "@/src/lib/terrain";

const WIDTH = 760;
const HEIGHT = 300;
const PAD = { left: 46, right: 18, top: 18, bottom: 34 };
const MIN_ELEVATION = -20;
const MAX_ELEVATION = 90;

function isoMinutes(value: string) {
  const match = value.match(/T(\d{2}):(\d{2})/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : 0;
}

function windowMinutes(window: TimeWindow) {
  return {
    start: isoMinutes(window.start),
    end: isoMinutes(window.end),
  };
}

function clock(minutes: number) {
  const value = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${
    String(value % 60).padStart(2, "0")
  }`;
}

function interpolateSolar(solar: SolarData, minutes: number) {
  const sample = Math.max(0, Math.min(1439, minutes)) / 10;
  const index = Math.min(solar.path.length - 1, Math.floor(sample));
  const next = Math.min(solar.path.length - 1, index + 1);
  const ratio = sample - index;
  const first = solar.path[index];
  const second = solar.path[next];
  if (!first || !second) return null;
  let difference = second.azimuth - first.azimuth;
  if (difference > 180) difference -= 360;
  if (difference < -180) difference += 360;
  return {
    elevation: first.elevation + (second.elevation - first.elevation) * ratio,
    azimuth: (first.azimuth + difference * ratio + 360) % 360,
  };
}

function durationMinutes(windows: TimeWindow[]) {
  return windows.reduce((sum, window) => {
    const range = windowMinutes(window);
    return sum + Math.max(0, range.end - range.start);
  }, 0);
}

export function SolarPath({
  solar,
  date,
  location,
}: {
  solar: SolarData;
  date: string;
  location: LocationResult | null;
}) {
  const [terrain, setTerrain] = useState<TerrainHorizon | null>(null);
  const [terrainLoading, setTerrainLoading] = useState(false);
  const [terrainError, setTerrainError] = useState("");

  useEffect(() => {
    if (!location) {
      setTerrain(null);
      setTerrainError("");
      return;
    }
    const controller = new AbortController();
    setTerrainLoading(true);
    setTerrainError("");
    loadTerrainHorizon(
      location.latitude,
      location.longitude,
      controller.signal,
    )
      .then((value) => {
        if (!controller.signal.aborted) setTerrain(value);
      })
      .catch((reason) => {
        if (controller.signal.aborted) return;
        setTerrain(null);
        setTerrainError(
          reason instanceof TerrainError
            ? reason.message
            : "地形遮挡暂不可用。",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setTerrainLoading(false);
      });
    return () => controller.abort();
  }, [location?.latitude, location?.longitude]);
  const nowMinutes = useMemo(() => {
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    if (today !== date) return 12 * 60;
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Shanghai",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date());
    const value = Object.fromEntries(
      parts.map((part) => [part.type, part.value]),
    );
    return Number(value.hour) * 60 + Number(value.minute);
  }, [date]);
  const [minutes, setMinutes] = useState(nowMinutes);
  const selected = interpolateSolar(solar, minutes);

  const x = (minute: number) =>
    PAD.left + (Math.min(1440, Math.max(0, minute)) / 1440) *
      (WIDTH - PAD.left - PAD.right);
  const y = (elevation: number) =>
    PAD.top +
    (1 -
        (Math.min(MAX_ELEVATION, Math.max(MIN_ELEVATION, elevation)) -
          MIN_ELEVATION) /
          (MAX_ELEVATION - MIN_ELEVATION)) *
      (HEIGHT - PAD.top - PAD.bottom);

  const points = solar.path
    .map((point) => `${x(isoMinutes(point.time)).toFixed(1)},${y(point.elevation).toFixed(1)}`)
    .join(" ");
  const sunrise = solar.sunrise ? isoMinutes(solar.sunrise) : null;
  const sunset = solar.sunset ? isoMinutes(solar.sunset) : null;
  const elevationTicks = [0, 30, 60, 90];
  const timeTicks = [0, 360, 720, 1080, 1440];

  const horizonLine = terrain
    ? solar.path
      .map((point) => {
        const horizon = horizonAt(terrain.profile, point.azimuth);
        return horizon === null
          ? null
          : `${x(isoMinutes(point.time)).toFixed(1)},${
            y(horizon).toFixed(1)
          }`;
      })
      .filter((point): point is string => point !== null)
      .join(" ")
    : "";
  const selectedHorizon = selected && terrain
    ? horizonAt(terrain.profile, selected.azimuth)
    : null;
  const selectedBlocked = selected !== null && selectedHorizon !== null &&
    selected.elevation < selectedHorizon;
  const sunriseHorizon = terrain && solar.sunriseAzimuth !== null
    ? horizonAt(terrain.profile, solar.sunriseAzimuth)
    : null;
  const sunsetHorizon = terrain && solar.sunsetAzimuth !== null
    ? horizonAt(terrain.profile, solar.sunsetAzimuth)
    : null;
  const sunriseBlocked = sunriseHorizon !== null && sunriseHorizon > -0.833;
  const sunsetBlocked = sunsetHorizon !== null && sunsetHorizon > -0.833;

  const twilightRows = [
    {
      label: "天文暮光",
      dawn: solar.astronomicalDawn,
      dusk: solar.astronomicalDusk,
    },
    { label: "航海暮光", dawn: solar.nauticalDawn, dusk: solar.nauticalDusk },
    { label: "民用暮光", dawn: solar.civilDawn, dusk: solar.civilDusk },
    { label: "日出 / 日落", dawn: solar.sunrise, dusk: solar.sunset },
  ];

  return (
    <div className="space-y-4">
      <section className="rounded-[var(--radius)] border border-border bg-card p-5 shadow-sm 2xl:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold">太阳全天轨迹</h3>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              拖动时间轴查看太阳方位与高度；色带为黄金时刻与蓝调时刻。
            </p>
          </div>
          <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            {clock(minutes)} 所选时刻
          </span>
        </div>

        <div className="mt-4 overflow-hidden rounded-2xl bg-muted/25 p-2">
          <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            className="h-auto w-full"
            role="img"
            aria-label="太阳高度角与时间轨迹"
          >
            {solar.blueHours.map((window) => {
              const range = windowMinutes(window);
              return (
                <rect
                  key={`blue-${window.start}`}
                  x={x(range.start)}
                  y={PAD.top}
                  width={Math.max(1, x(range.end) - x(range.start))}
                  height={HEIGHT - PAD.top - PAD.bottom}
                  fill="#6366f1"
                  opacity="0.12"
                />
              );
            })}
            {solar.goldenHours.map((window) => {
              const range = windowMinutes(window);
              return (
                <rect
                  key={`gold-${window.start}`}
                  x={x(range.start)}
                  y={PAD.top}
                  width={Math.max(1, x(range.end) - x(range.start))}
                  height={HEIGHT - PAD.top - PAD.bottom}
                  fill="#f59e0b"
                  opacity="0.14"
                />
              );
            })}
            {elevationTicks.map((tick) => (
              <g key={`elev-${tick}`}>
                <line
                  x1={PAD.left}
                  x2={WIDTH - PAD.right}
                  y1={y(tick)}
                  y2={y(tick)}
                  stroke="var(--border)"
                  strokeDasharray={tick === 0 ? "0" : "4 6"}
                />
                <text
                  x={PAD.left - 8}
                  y={y(tick) + 4}
                  textAnchor="end"
                  fontSize="10"
                  fill="var(--muted-foreground)"
                >
                  {tick}°
                </text>
              </g>
            ))}
            {timeTicks.map((tick) => (
              <text
                key={`time-${tick}`}
                x={x(tick)}
                y={HEIGHT - 10}
                textAnchor={tick === 0 ? "start" : tick === 1440 ? "end" : "middle"}
                fontSize="10"
                fill="var(--muted-foreground)"
              >
                {clock(tick)}
              </text>
            ))}
            {sunrise !== null && (
              <line
                x1={x(sunrise)}
                x2={x(sunrise)}
                y1={PAD.top}
                y2={HEIGHT - PAD.bottom}
                stroke="#f59e0b"
                strokeDasharray="3 5"
              />
            )}
            {sunset !== null && (
              <line
                x1={x(sunset)}
                x2={x(sunset)}
                y1={PAD.top}
                y2={HEIGHT - PAD.bottom}
                stroke="#f97316"
                strokeDasharray="3 5"
              />
            )}
            {horizonLine && (
              <polyline
                points={horizonLine}
                fill="none"
                stroke="#a16207"
                strokeWidth="1.6"
                strokeDasharray="5 4"
                opacity="0.9"
              />
            )}
            <polyline
              points={points}
              fill="none"
              stroke="var(--primary)"
              strokeWidth="2.2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {selected && (
              <g>
                <circle
                  cx={x(minutes)}
                  cy={y(selected.elevation)}
                  r="7"
                  fill={selectedBlocked ? "#dc2626" : "var(--primary)"}
                  stroke="var(--card)"
                  strokeWidth="2"
                />
                <text
                  x={Math.min(WIDTH - PAD.right - 4, x(minutes) + 12)}
                  y={Math.max(PAD.top + 12, y(selected.elevation) - 10)}
                  fontSize="11"
                  fill="var(--foreground)"
                >
                  {clock(minutes)} · {selected.elevation.toFixed(1)}°
                </text>
              </g>
            )}
          </svg>
        </div>

        <label className="mt-3 block">
          <span className="sr-only">选择时间</span>
          <input
            type="range"
            min={0}
            max={1439}
            step={1}
            value={minutes}
            onChange={(event) => setMinutes(Number(event.target.value))}
            className="h-2 w-full cursor-pointer accent-[var(--primary)]"
          />
          <span className="mt-1 flex justify-between text-[11px] text-muted-foreground">
            <span>00:00</span>
            <span>06:00</span>
            <span>12:00</span>
            <span>18:00</span>
            <span>24:00</span>
          </span>
        </label>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl bg-muted/45 p-3">
            <p className="text-[11px] text-muted-foreground">所选时刻太阳高度</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">
              {selected ? `${selected.elevation.toFixed(1)}°` : "—"}
            </p>
          </div>
          <div className="rounded-xl bg-muted/45 p-3">
            <p className="text-[11px] text-muted-foreground">所选时刻太阳方位</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">
              {selected
                ? `${compass(selected.azimuth)} ${Math.round(selected.azimuth)}°`
                : "—"}
            </p>
          </div>
          <div className="rounded-xl bg-muted/45 p-3">
            <p className="text-[11px] text-muted-foreground">正午太阳高度</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">
              {solar.noonElevation === null
                ? "—"
                : `${solar.noonElevation.toFixed(1)}°`}
            </p>
          </div>
          <div className="rounded-xl bg-muted/45 p-3">
            <p className="text-[11px] text-muted-foreground">所选时刻地形遮挡</p>
            {terrain && selectedHorizon !== null ? (
              <>
                <p
                  className={`mt-1 text-lg font-semibold ${
                    selectedBlocked ? "text-red-600 dark:text-red-400" : ""
                  }`}
                >
                  {selectedBlocked ? "被遮挡" : "可见"}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  地平线约 {selectedHorizon.toFixed(1)}°
                </p>
              </>
            ) : (
              <p className="mt-1 text-lg font-semibold text-muted-foreground">
                {terrainLoading ? "读取中…" : "未计算"}
              </p>
            )}
          </div>
        </div>

        {terrainLoading && (
          <p className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
            <LoaderCircle className="size-3.5 animate-spin text-primary" />
            正在读取星图地球地形瓦片…
          </p>
        )}
        {!terrainLoading && terrainError && (
          <p className="mt-3 rounded-xl bg-muted/45 p-3 text-[11px] leading-5 text-muted-foreground">
            地形遮挡未计算：{terrainError}太阳轨迹仍按本地天文算法显示，未叠加地形地平线。
          </p>
        )}
        {!terrainLoading && terrain && (
          <p className="mt-3 rounded-xl bg-muted/45 p-3 text-[11px] leading-5 text-muted-foreground">
            地形地平线来自星图地球 Terrain-RGB（{terrain.loadedTiles}/
            {terrain.totalTiles} 瓦片，采样半径 12km）。日出方位：
            {sunriseBlocked ? "被地形遮挡" : "可见"}；日落方位：
            {sunsetBlocked ? "被地形遮挡" : "可见"}。未计入建筑与植被遮挡。
          </p>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
        <section className="rounded-[var(--radius)] border border-border bg-card p-5 shadow-sm">
          <h3 className="text-sm font-semibold">晨昏与黄金时刻</h3>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <SolarFact
              icon={Sunrise}
              label="日出"
              value={`${formatTime(solar.sunrise)}${
                solar.sunriseAzimuth === null
                  ? ""
                  : ` · ${compass(solar.sunriseAzimuth)} ${Math.round(solar.sunriseAzimuth)}°`
              }`}
            />
            <SolarFact
              icon={Sunset}
              label="日落"
              value={`${formatTime(solar.sunset)}${
                solar.sunsetAzimuth === null
                  ? ""
                  : ` · ${compass(solar.sunsetAzimuth)} ${Math.round(solar.sunsetAzimuth)}°`
              }`}
            />
            <SolarFact
              icon={Sun}
              label="黄金时刻总长"
              value={`${durationMinutes(solar.goldenHours)} 分钟`}
            />
            <SolarFact
              icon={MoonStar}
              label="蓝调时刻总长"
              value={`${durationMinutes(solar.blueHours)} 分钟`}
            />
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[26rem] text-left text-xs">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="py-2 font-medium">阶段</th>
                  <th className="py-2 font-medium">晨光</th>
                  <th className="py-2 font-medium">暮光</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {twilightRows.map((row) => (
                  <tr key={row.label}>
                    <td className="py-2 font-medium">{row.label}</td>
                    <td className="py-2 tabular-nums text-muted-foreground">
                      {formatTime(row.dawn)}
                    </td>
                    <td className="py-2 tabular-nums text-muted-foreground">
                      {formatTime(row.dusk)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 space-y-2 text-xs text-muted-foreground">
            <p>
              黄金时刻：
              {solar.goldenHours.length
                ? solar.goldenHours.map((window) => formatRange(window.start, window.end)).join("；")
                : "该日期没有可用窗口"}
            </p>
            <p>
              蓝调时刻：
              {solar.blueHours.length
                ? solar.blueHours.map((window) => formatRange(window.start, window.end)).join("；")
                : "该日期没有可用窗口"}
            </p>
          </div>
        </section>

        <section className="rounded-[var(--radius)] border border-border bg-card p-5 shadow-sm">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Compass className="size-4 text-primary" />方向罗盘
          </h3>
          <CompassRose
            azimuth={selected?.azimuth ?? 0}
            sunriseAzimuth={solar.sunriseAzimuth}
            sunsetAzimuth={solar.sunsetAzimuth}
          />
          <p className="mt-2 text-[11px] leading-4 text-muted-foreground">
            箭头为所选时刻太阳方向；橙色与蓝色刻度分别是日出、日落方位。
          </p>
        </section>
      </div>

      <p className="flex items-start gap-1.5 rounded-xl bg-muted/45 p-3 text-[11px] leading-5 text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        太阳位置由 NOAA 算法在本地计算；地形地平线取自星图地球 Terrain-RGB（约 12km 半径），不含建筑与植被。地图联动需要高德 JS API Key，当前以方位罗盘呈现方向。
      </p>
    </div>
  );
}

function SolarFact({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Sun;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-border/70 p-3">
      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Icon className="size-3.5 text-primary" />
        {label}
      </p>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  );
}

function CompassRose({
  azimuth,
  sunriseAzimuth,
  sunsetAzimuth,
}: {
  azimuth: number;
  sunriseAzimuth: number | null;
  sunsetAzimuth: number | null;
}) {
  const center = 90;
  const point = (degrees: number, radius: number) => {
    const angle = (degrees - 90) * Math.PI / 180;
    return {
      x: center + Math.cos(angle) * radius,
      y: center + Math.sin(angle) * radius,
    };
  };
  const tip = point(azimuth, 58);
  const sunRise = sunriseAzimuth === null ? null : point(sunriseAzimuth, 72);
  const sunSet = sunsetAzimuth === null ? null : point(sunsetAzimuth, 72);
  return (
    <svg viewBox="0 0 180 180" className="mx-auto mt-3 w-full max-w-[180px]" role="img" aria-label="太阳方位罗盘">
      <circle cx={center} cy={center} r="74" fill="none" stroke="var(--border)" />
      <circle cx={center} cy={center} r="54" fill="none" stroke="var(--border)" strokeDasharray="3 5" />
      {["北", "东", "南", "西"].map((label, index) => {
        const at = point(index * 90, 64);
        return (
          <text
            key={label}
            x={at.x}
            y={at.y + 4}
            textAnchor="middle"
            fontSize="10"
            fill="var(--muted-foreground)"
          >
            {label}
          </text>
        );
      })}
      {sunRise && (
        <circle cx={sunRise.x} cy={sunRise.y} r="3" fill="#f59e0b" />
      )}
      {sunSet && (
        <circle cx={sunSet.x} cy={sunSet.y} r="3" fill="#f97316" />
      )}
      <line
        x1={center}
        y1={center}
        x2={tip.x}
        y2={tip.y}
        stroke="var(--primary)"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <circle cx={center} cy={center} r="4" fill="var(--primary)" />
    </svg>
  );
}
