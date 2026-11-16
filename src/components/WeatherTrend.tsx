import { useEffect, useRef, useState } from "react";
import type { HourlyWeather } from "@/functions/shared/contracts";
import { formatTime, metric } from "@/src/lib/format";

const WIDTH = 720;
const HEIGHT = 118;
const LONG_PRESS_MS = 320;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function WeatherTrend({ hours }: { hours: HourlyWeather[] }) {
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
    if (!rect || rect.width === 0 || hours.length === 0) return null;
    const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
    return Math.round(ratio * (hours.length - 1));
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

  const temperatures = hours
    .map((entry) => entry.temperature)
    .filter((value): value is number => value !== null);
  const min = temperatures.length ? Math.min(...temperatures) : 0;
  const max = temperatures.length ? Math.max(...temperatures) : 1;
  const span = Math.max(1, max - min);
  const x = (index: number) =>
    12 + (index / Math.max(1, hours.length - 1)) * (WIDTH - 24);
  const y = (value: number) =>
    HEIGHT - 16 - ((value - min) / span) * (HEIGHT - 34);
  const points = hours.map((entry, index) =>
    entry.temperature === null
      ? null
      : `${x(index).toFixed(1)},${y(entry.temperature).toFixed(1)}`
  ).filter((point): point is string => point !== null).join(" ");
  const active = activeIndex === null ? null : hours[activeIndex] ?? null;
  const activePercent = activeIndex === null ? 0 : x(activeIndex) / WIDTH * 100;
  const tooltipPercent = clamp(activePercent, 15, 85);

  return (
    <div
      ref={containerRef}
      className="relative mt-3 select-none"
      style={{ touchAction: "pan-y" }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onPointerLeave={handlePointerLeave}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="relative">
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>温度</span>
          <span className="tabular-nums">
            {min.toFixed(1)}° — {max.toFixed(1)}°
          </span>
        </div>
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="mt-1 h-auto w-full"
          role="img"
          aria-label="逐小时温度变化"
        >
          <line x1="12" x2={WIDTH - 12} y1={y(min)} y2={y(min)} stroke="var(--border)" strokeDasharray="4 6" />
          <line x1="12" x2={WIDTH - 12} y1={y(max)} y2={y(max)} stroke="var(--border)" strokeDasharray="4 6" />
          <polyline
            points={points}
            fill="none"
            stroke="var(--primary)"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {hours.map((entry, index) =>
            index % 3 === 0 && entry.temperature !== null ? (
              <text
                key={entry.time}
                x={x(index)}
                y={HEIGHT - 2}
                textAnchor="middle"
                fontSize="9"
                fill="var(--muted-foreground)"
              >
                {formatTime(entry.time)}
              </text>
            ) : null
          )}
          {active && activeIndex !== null && active.temperature !== null && (
            <circle
              r="4.5"
              cx="0"
              cy="0"
              fill="var(--primary)"
              stroke="var(--card)"
              strokeWidth="2"
              style={{
                transform: `translate(${x(activeIndex)}px, ${y(active.temperature)}px)`,
                transition: "transform 160ms ease",
              }}
            />
          )}
        </svg>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span>云量与降水概率</span>
          <span className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1">
              <span className="size-2 rounded-sm bg-zinc-400/70" />云量
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="size-2 rounded-sm bg-sky-500/60" />降水概率
            </span>
          </span>
        </div>
        <div className="mt-2 flex h-28 items-end gap-[3px]">
          {hours.map((entry, index) => {
            const isActive = activeIndex === index;
            const dimmed = activeIndex !== null && !isActive;
            return (
              <div
                key={entry.time}
                className={`flex h-full flex-1 items-end justify-center gap-[1px] rounded-t-md transition-[background-color,opacity] duration-150 ${
                  isActive ? "bg-primary/10" : ""
                } ${dimmed ? "opacity-50" : "opacity-100"}`}
              >
                <div
                  className="w-[45%] rounded-t-sm bg-zinc-400/60"
                  style={{ height: `${Math.max(2, entry.cloud ?? 0)}%` }}
                />
                <div
                  className="w-[45%] rounded-t-sm bg-sky-500/55"
                  style={{
                    height: `${Math.max(2, entry.precipitationProbability ?? 0)}%`,
                  }}
                />
              </div>
            );
          })}
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
          <span>{formatTime(hours[0].time)}</span>
          <span>{formatTime(hours[Math.floor(hours.length / 2)].time)}</span>
          <span>{formatTime(hours[hours.length - 1].time)}</span>
        </div>

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
              className="pointer-events-none absolute top-0 z-10 w-[12.5rem] rounded-xl border border-border bg-popover/95 p-2.5 text-[11px] leading-4 shadow-lg backdrop-blur"
              style={{
                left: `${tooltipPercent}%`,
                transform: "translateX(-50%)",
                transition: "left 150ms ease",
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold tabular-nums">
                  {formatTime(active.time)}
                </span>
                <span className="truncate text-muted-foreground">
                  {active.condition || "天气未知"}
                </span>
              </div>
              <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-muted-foreground">
                <span>温度 {metric(active.temperature, "°")}</span>
                <span>云量 {metric(active.cloud, "%")}</span>
                <span>降水 {metric(active.precipitationProbability, "%")}</span>
                <span>风速 {metric(active.windSpeed, "m/s", 1)}</span>
                <span className="col-span-2">
                  能见度{" "}
                  {active.visibility === null
                    ? "—"
                    : `${(active.visibility / 1000).toFixed(1)} km`}
                </span>
              </div>
            </div>
          </>
        )}
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground">
        悬停图表查看逐小时数据；触控端长按后拖动。
      </p>
    </div>
  );
}
