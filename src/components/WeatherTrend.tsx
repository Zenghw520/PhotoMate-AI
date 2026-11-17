import { useEffect, useRef, useState } from "react";
import type { HourlyWeather } from "@/functions/shared/contracts";
import { formatObservedAt, formatTime, metric } from "@/src/lib/format";

const WIDTH = 720;
const HEIGHT = 190;
const PLOT_LEFT = 38;
const PLOT_RIGHT = 14;
const PLOT_TOP = 14;
const PLOT_BOTTOM = 26;
const LONG_PRESS_MS = 320;

type MetricKey =
  | "temperature"
  | "cloud"
  | "humidity"
  | "windSpeed"
  | "precipitationProbability";

const METRICS: Record<
  MetricKey,
  {
    label: string;
    unit: string;
    digits: number;
    color: string;
    pick: (entry: HourlyWeather) => number | null;
  }
> = {
  temperature: {
    label: "温度",
    unit: "°C",
    digits: 1,
    color: "var(--primary)",
    pick: (entry) => entry.temperature,
  },
  cloud: {
    label: "云量",
    unit: "%",
    digits: 0,
    color: "#71717a",
    pick: (entry) => entry.cloud,
  },
  humidity: {
    label: "湿度",
    unit: "%",
    digits: 0,
    color: "#0ea5e9",
    pick: (entry) => entry.humidity,
  },
  windSpeed: {
    label: "风速",
    unit: "m/s",
    digits: 1,
    color: "#8b5cf6",
    pick: (entry) => entry.windSpeed,
  },
  precipitationProbability: {
    label: "降水概率",
    unit: "%",
    digits: 0,
    color: "#0284c7",
    pick: (entry) => entry.precipitationProbability,
  },
};

const RANGES = [24, 48, 72] as const;
type RangeHours = (typeof RANGES)[number];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function valuesOf(hours: HourlyWeather[], key: MetricKey) {
  return hours
    .map((entry) => METRICS[key].pick(entry))
    .filter((value): value is number => value !== null);
}

function scaleFor(key: MetricKey, values: number[]) {
  if (values.length === 0) return { min: 0, max: 100, ticks: [0, 50, 100] };
  if (key === "temperature") {
    const min = Math.floor(Math.min(...values) - 2);
    const max = Math.ceil(Math.max(...values) + 2);
    const middle = Math.round((min + max) / 2);
    return { min, max, ticks: [min, middle, max] };
  }
  if (key === "windSpeed") {
    const max = Math.max(6, Math.ceil(Math.max(...values) + 1));
    return { min: 0, max, ticks: [0, Math.round(max / 2), max] };
  }
  return { min: 0, max: 100, ticks: [0, 50, 100] };
}

function formatValue(value: number, key: MetricKey) {
  return `${value.toFixed(METRICS[key].digits)}${METRICS[key].unit}`;
}

function dayTime(value: string, withDate: boolean) {
  if (!withDate) return formatTime(value);
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

export function WeatherTrend({
  hours,
  forecastUpdatedAt,
  sources,
}: {
  hours: HourlyWeather[];
  forecastUpdatedAt?: string | null;
  sources: string[];
}) {
  const [range, setRange] = useState<RangeHours>(24);
  const [metricKey, setMetricKey] = useState<MetricKey>("temperature");
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<number | null>(null);
  const longPressRef = useRef(false);
  const startRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  function clearTimer() {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  function indexAt(clientX: number) {
    const rect = containerRef.current?.getBoundingClientRect();
    const visible = hours.slice(0, range);
    if (!rect || rect.width === 0 || visible.length === 0) return null;
    const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
    return Math.round(ratio * (visible.length - 1));
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse") {
      setActiveIndex(indexAt(event.clientX));
      return;
    }
    startRef.current = { x: event.clientX, y: event.clientY };
    longPressRef.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
    clearTimer();
    timerRef.current = window.setTimeout(() => {
      longPressRef.current = true;
      setActiveIndex(indexAt(event.clientX));
    }, LONG_PRESS_MS);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse") {
      setActiveIndex(indexAt(event.clientX));
      return;
    }
    if (!longPressRef.current) {
      if (
        Math.abs(event.clientX - startRef.current.x) > 10 ||
        Math.abs(event.clientY - startRef.current.y) > 10
      ) {
        clearTimer();
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      }
      return;
    }
    event.preventDefault();
    setActiveIndex(indexAt(event.clientX));
  }

  function handlePointerEnd(event: React.PointerEvent<HTMLDivElement>) {
    clearTimer();
    if (event.pointerType !== "mouse") {
      longPressRef.current = false;
      setActiveIndex(null);
    }
  }

  function handlePointerLeave(event: React.PointerEvent<HTMLDivElement>) {
    clearTimer();
    if (event.pointerType === "mouse") setActiveIndex(null);
  }

  if (hours.length === 0) return null;

  const visible = hours.slice(0, range);
  const config = METRICS[metricKey];
  const values = valuesOf(visible, metricKey);
  const scale = scaleFor(metricKey, values);
  const span = Math.max(1, scale.max - scale.min);
  const plotWidth = WIDTH - PLOT_LEFT - PLOT_RIGHT;
  const plotHeight = HEIGHT - PLOT_TOP - PLOT_BOTTOM;
  const x = (index: number) =>
    PLOT_LEFT + (index / Math.max(1, visible.length - 1)) * plotWidth;
  const y = (value: number) =>
    PLOT_TOP + (1 - (value - scale.min) / span) * plotHeight;

  const segments: Array<Array<{ index: number; value: number }>> = [];
  let current: Array<{ index: number; value: number }> = [];
  visible.forEach((entry, index) => {
    const value = config.pick(entry);
    if (value === null) {
      if (current.length) segments.push(current);
      current = [];
      return;
    }
    current.push({ index, value });
  });
  if (current.length) segments.push(current);

  const active = activeIndex === null
    ? null
    : visible[clamp(activeIndex, 0, visible.length - 1)] ?? null;
  const activeValue = active ? config.pick(active) : null;
  const activePercent = activeIndex === null
    ? 0
    : x(clamp(activeIndex, 0, visible.length - 1)) / WIDTH * 100;
  const tooltipPercent = clamp(activePercent, 18, 82);
  const crossesDay = visible[0].time.slice(0, 10) !==
    visible[visible.length - 1].time.slice(0, 10);
  const timeTicks = [
    ...new Set([
      0,
      Math.floor((visible.length - 1) / 3),
      Math.floor((visible.length - 1) * 2 / 3),
      visible.length - 1,
    ]),
  ];

  return (
    <div className="mt-3 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div
          role="group"
          aria-label="预报范围"
          className="flex gap-1.5 rounded-full bg-muted p-1"
        >
          {RANGES.map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={range === item}
              onClick={() => {
                setRange(item);
                setActiveIndex(null);
              }}
              className={`min-h-8 rounded-full px-3 text-[11px] font-medium transition ${
                range === item
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              未来 {item} 小时
            </button>
          ))}
        </div>
        <span className="text-[10px] text-muted-foreground">
          {hours.length < 72
            ? `上游仅覆盖未来 ${hours.length} 小时`
            : "预报缺口以断线显示，不补造数值"}
        </span>
      </div>

      <div
        role="group"
        aria-label="趋势指标"
        className="scrollbar-none flex gap-1.5 overflow-x-auto pb-1"
      >
        {(Object.keys(METRICS) as MetricKey[]).map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={metricKey === key}
            onClick={() => {
              setMetricKey(key);
              setActiveIndex(null);
            }}
            className={`min-h-8 shrink-0 rounded-full border px-3 text-[11px] font-medium transition ${
              metricKey === key
                ? "border-primary/25 bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {METRICS[key].label}
          </button>
        ))}
      </div>

      <div
        ref={containerRef}
        className="relative select-none"
        style={{ touchAction: "pan-y" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onPointerLeave={handlePointerLeave}
        onContextMenu={(event) => event.preventDefault()}
      >
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>{config.label}变化</span>
          <span className="tabular-nums">
            {values.length
              ? `${formatValue(Math.min(...values), metricKey)} — ${
                formatValue(Math.max(...values), metricKey)
              }`
              : "所选范围缺少该字段"}
          </span>
        </div>

        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="mt-1 h-auto w-full"
          role="img"
          aria-label={`未来${range}小时${config.label}变化`}
        >
          {scale.ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={PLOT_LEFT}
                x2={WIDTH - PLOT_RIGHT}
                y1={y(tick)}
                y2={y(tick)}
                stroke="var(--border)"
                strokeDasharray={tick === scale.ticks[0] ? "0" : "4 6"}
              />
              <text
                x={PLOT_LEFT - 5}
                y={y(tick) + 3}
                textAnchor="end"
                fontSize="9"
                fill="var(--muted-foreground)"
              >
                {tick}
              </text>
            </g>
          ))}
          {segments.map((segment, index) => {
            const points = segment.map((point) =>
              `${x(point.index).toFixed(1)},${y(point.value).toFixed(1)}`
            ).join(" ");
            if (segment.length === 1) {
              return (
                <circle
                  key={`point-${index}`}
                  cx={x(segment[0].index)}
                  cy={y(segment[0].value)}
                  r="2.5"
                  fill={config.color}
                />
              );
            }
            const first = segment[0];
            const last = segment[segment.length - 1];
            const area = `M ${x(first.index)} ${y(first.value)} L ${
              segment.map((point) =>
                `${x(point.index)} ${y(point.value)}`
              ).join(" L ")
            } L ${x(last.index)} ${HEIGHT - PLOT_BOTTOM} L ${
              x(first.index)
            } ${HEIGHT - PLOT_BOTTOM} Z`;
            return (
              <g key={`segment-${index}`}>
                <path d={area} fill={config.color} fillOpacity="0.08" />
                <polyline
                  points={points}
                  fill="none"
                  stroke={config.color}
                  strokeWidth="2"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              </g>
            );
          })}
          {timeTicks.map((index) => (
            <text
              key={`time-${index}`}
              x={x(index)}
              y={HEIGHT - 6}
              textAnchor={index === 0
                ? "start"
                : index === visible.length - 1
                ? "end"
                : "middle"}
              fontSize="9"
              fill="var(--muted-foreground)"
            >
              {dayTime(visible[index].time, crossesDay)}
            </text>
          ))}
          {active && activeIndex !== null && activeValue !== null && (
            <circle
              r="4.5"
              cx="0"
              cy="0"
              fill={config.color}
              stroke="var(--card)"
              strokeWidth="2"
              style={{
                transform: `translate(${x(activeIndex)}px, ${y(activeValue)}px)`,
                transition: "transform 160ms ease",
              }}
            />
          )}
        </svg>

        {active && (
          <>
            <div
              className="pointer-events-none absolute inset-y-0 w-px bg-primary/35"
              style={{
                left: `${activePercent}%`,
                transition: "left 150ms ease",
              }}
            />
            <div
              className="pointer-events-none absolute top-0 z-10 w-[13rem] rounded-xl border border-border bg-popover/95 p-2.5 text-[11px] leading-4 shadow-lg backdrop-blur"
              style={{
                left: `${tooltipPercent}%`,
                transform: "translateX(-50%)",
                transition: "left 150ms ease",
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold tabular-nums">
                  {dayTime(active.time, true)}
                </span>
                <span className="truncate text-muted-foreground">
                  {active.condition || "天气未知"}
                </span>
              </div>
              <p
                className="mt-1 text-sm font-semibold tabular-nums"
                style={{ color: config.color }}
              >
                {config.label}{" "}
                {activeValue === null
                  ? "—"
                  : formatValue(activeValue, metricKey)}
              </p>
              <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-muted-foreground">
                <span>温度 {metric(active.temperature, "°", 1)}</span>
                <span>云量 {metric(active.cloud, "%")}</span>
                <span>湿度 {metric(active.humidity, "%")}</span>
                <span>风速 {metric(active.windSpeed, "m/s", 1)}</span>
                <span>降水 {metric(active.precipitationProbability, "%")}</span>
                <span>
                  能见度{" "}
                  {active.visibility === null
                    ? "—"
                    : `${(active.visibility / 1000).toFixed(1)}km`}
                </span>
              </div>
            </div>
          </>
        )}

        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10px] text-muted-foreground">
          <span>
            {forecastUpdatedAt
              ? `预报获取于 ${formatObservedAt(forecastUpdatedAt)}`
              : "预报获取时间未提供"}
          </span>
          <span className="truncate">
            {sources.length ? `来源 ${sources.join(" / ")}` : "来源未提供"}
          </span>
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground">
        悬停或长按拖动查看逐小时详情；图表为预报数据，实况以“此刻天气”观测时间为准。
      </p>
    </div>
  );
}
