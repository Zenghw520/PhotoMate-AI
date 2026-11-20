import { CalendarDays, Clock3, MapPin, Pencil } from "lucide-react";
import type {
  ThemeId,
  TimelineItem,
} from "@/functions/shared/contracts";
import { formatDate, formatRange } from "@/src/lib/format";
import {
  DAY_LABELS,
  THEME_LABELS,
  THEME_OPTIONS,
  spotSourceLabel,
  windowGroup,
  windowGroupLabel,
  type ShootingSpot,
} from "@/src/lib/shooting";

/**
 * 全站共用的拍摄会话条：机位、计划日期、窗口与题材。
 * 日期与窗口在任何页面修改后，天气 / 光线 / 地点 / 方案同步使用。
 */
export function ShootingContextBar({
  spot,
  dayOffset,
  targetDate,
  slot,
  theme,
  loading,
  onChangeLocation,
  onDayChange,
  onThemeChange,
  compact = false,
}: {
  spot: ShootingSpot;
  dayOffset: number;
  targetDate: string;
  slot: TimelineItem | null;
  theme: ThemeId;
  loading?: boolean;
  onChangeLocation?: () => void;
  onDayChange?: (offset: number) => void;
  onThemeChange?: (theme: ThemeId) => void;
  compact?: boolean;
}) {
  const windowLabel = slot ? windowGroupLabel(slot.kind) : "窗口待定";
  return (
    <section
      className={`rounded-2xl border border-border bg-card/85 shadow-sm ${
        compact ? "mt-3 px-3 py-2.5" : "mt-4 px-3.5 py-3"
      }`}
      aria-label="当前拍摄计划"
    >
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 text-xs">
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <MapPin className="size-4 shrink-0 text-primary" />
          <strong className="min-w-0 truncate font-medium" title={spot.name}>
            {spot.name}
          </strong>
          <span className="shrink-0 text-muted-foreground">
            · {spotSourceLabel(spot.source)}
          </span>
          {onChangeLocation && (
            <button
              type="button"
              onClick={onChangeLocation}
              className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-full px-2 font-medium text-primary transition hover:bg-primary/10"
            >
              <Pencil className="size-3" />更换
            </button>
          )}
        </span>

        <span className="inline-flex min-w-0 items-center gap-1.5 text-muted-foreground">
          <CalendarDays className="size-3.5 shrink-0" />
          <span className="shrink-0 font-medium text-foreground">
            {DAY_LABELS[dayOffset] ?? `第 ${dayOffset + 1} 天`}
          </span>
          <span className="shrink-0 tabular-nums">{formatDate(targetDate)}</span>
          {onDayChange && (
            <span
              role="group"
              aria-label="计划日期"
              className="ml-1 inline-flex shrink-0 gap-0.5 rounded-full bg-muted p-0.5"
            >
              {[0, 1, 2].map((offset) => (
                <button
                  key={offset}
                  type="button"
                  aria-pressed={dayOffset === offset}
                  onClick={() => onDayChange(offset)}
                  className={`min-h-10 rounded-full px-2.5 text-xs font-medium transition ${
                    dayOffset === offset
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {DAY_LABELS[offset]}
                </button>
              ))}
            </span>
          )}
        </span>

        <span className="inline-flex min-w-0 items-center gap-1.5 text-muted-foreground">
          <Clock3 className="size-3.5 shrink-0" />
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 font-medium ${
              windowGroup(slot?.kind ?? "DAYTIME") === "GLOW"
                ? "bg-primary/10 text-primary"
                : "bg-muted text-foreground/80"
            }`}
          >
            {windowLabel}
          </span>
          <span className="min-w-0 truncate tabular-nums">
            {slot ? formatRange(slot.start, slot.end) : "选择时间轴窗口"}
          </span>
        </span>

        <label className="ml-auto inline-flex shrink-0 items-center gap-1.5 text-muted-foreground">
          <span>题材</span>
          <select
            value={theme}
            onChange={(event) =>
              onThemeChange?.(event.target.value as ThemeId)}
            disabled={!onThemeChange}
            className="min-h-10 rounded-full border border-border bg-card px-2.5 text-xs font-medium text-foreground outline-none transition focus:border-primary/60 disabled:opacity-80"
            aria-label="拍摄题材"
          >
            {THEME_OPTIONS.map((item) => (
              <option key={item.id} value={item.id}>
                {THEME_LABELS[item.id]}
              </option>
            ))}
          </select>
        </label>
        {loading && (
          <span className="shrink-0 text-primary" role="status">
            更新中…
          </span>
        )}
      </div>
    </section>
  );
}
