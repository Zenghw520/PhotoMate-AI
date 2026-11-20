import {
  Clock3,
  Compass,
  Flame,
  Gauge,
  SunMedium,
  Sunrise,
  Sunset,
} from "lucide-react";
import type {
  TimelineItem,
  TodayResponse,
} from "@/functions/shared/contracts";
import {
  compass,
  fireCloudLabel,
  formatRange,
  formatTime,
  scoreLabel,
} from "@/src/lib/format";
import { windowGroupLabel } from "@/src/lib/shooting";

const CONFIDENCE_LABELS = { LOW: "较低", MEDIUM: "中等", HIGH: "较高" };

/**
 * 霞光结论区：把“几点到、拍哪段、朝哪看”放在最上面，
 * 并分开说明霞光评分、火烧云潜力与数据置信度。
 */
export function GlowConclusion({
  data,
  slot,
}: {
  data: TodayResponse;
  slot: TimelineItem | null;
}) {
  const dawnKinds = ["DAWN", "SUNRISE", "MORNING_GOLDEN"];
  const duskKinds = ["EVENING_GOLDEN", "SUNSET", "DUSK"];
  let type: "dawn" | "dusk" = "dusk";
  if (slot && dawnKinds.includes(slot.kind)) type = "dawn";
  else if (slot && duskKinds.includes(slot.kind)) type = "dusk";
  else if (slot) {
    const noon = Date.parse(data.solar.solarNoon);
    type = Date.parse(slot.start) < noon ? "dawn" : "dusk";
  }

  const potential = data.potential[type];
  const fire = data.fireCloud[type];
  const eventTime = type === "dawn" ? data.solar.sunrise : data.solar.sunset;
  const azimuth = type === "dawn"
    ? data.solar.sunriseAzimuth
    : data.solar.sunsetAzimuth;
  const window = slot
    ? { start: slot.start, end: slot.end }
    : potential.forecastWindow;
  const arrival = window
    ? new Date(Date.parse(window.start) - 40 * 60_000).toISOString()
    : null;
  const confidence = Math.max(
    0,
    Math.min(potential.confidence, fire.confidence),
  );
  const level = potential.confidenceLevel === "LOW" ||
      fire.confidenceLevel === "LOW"
    ? "LOW"
    : potential.confidenceLevel === "MEDIUM" ||
        fire.confidenceLevel === "MEDIUM"
    ? "MEDIUM"
    : "HIGH";
  const isDawn = type === "dawn";
  const EventIcon = isDawn ? Sunrise : Sunset;
  const direction = azimuth === null
    ? isDawn ? "东方" : "西方"
    : `${compass(azimuth)} ${Math.round(azimuth)}°`;
  const scoreText = (value: number | null) =>
    value === null ? "数据不足" : `${Math.round(value)} / 100`;

  return (
    <section
      className="overflow-hidden rounded-[var(--radius)] border border-primary/25 bg-primary/[0.05] shadow-sm"
      aria-labelledby="glow-conclusion-title"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-primary/15 px-5 py-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <EventIcon className="size-4" />
          </span>
          <div className="min-w-0">
            <h3 id="glow-conclusion-title" className="font-semibold">
              {isDawn ? "朝霞" : "晚霞"}结论
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {windowGroupLabel(slot?.kind ?? null)} ·{" "}
              {slot?.label ?? (isDawn ? "日出窗口" : "日落窗口")}
            </p>
          </div>
        </div>
        <span className="rounded-full bg-card/80 px-2.5 py-1 text-xs text-muted-foreground">
          {data.date} · {data.location.name}
        </span>
      </div>

      <div className="px-5 py-4">
        <p className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm font-medium">
          <span className="inline-flex items-center gap-1.5">
            <Clock3 className="size-4 text-primary" />
            建议 {arrival ? formatTime(arrival) : "—"} 到达
          </span>
          <span className="inline-flex items-center gap-1.5">
            <SunMedium className="size-4 text-primary" />
            推荐 {window ? formatRange(window.start, window.end) : "窗口暂不可用"}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Compass className="size-4 text-primary" />
            面朝{direction}
          </span>
        </p>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          {slot
            ? `当前窗口来自「${windowGroupLabel(slot.kind)}」；改日期或换机位后，结论会按同类型窗口重算。`
            : "尚未选择窗口，以下按当日太阳事件估算。"}
          {isDawn ? "朝霞" : "晚霞"}评分窗口锚定{isDawn ? "日出" : "日落"}{" "}
          {eventTime ? formatTime(eventTime) : "—"}。
        </p>
      </div>

      <div className="grid gap-2 px-4 pb-4 sm:grid-cols-3 sm:px-5 sm:pb-5">
        <ConclusionStat
          icon={Gauge}
          label="霞光评分"
          value={scoreText(potential.score)}
          sub={scoreLabel(potential.score)}
          note="综合分层云、湿度、能见度与太阳窗口"
        />
        <ConclusionStat
          icon={Flame}
          label="火烧云潜力"
          value={scoreText(fire.score)}
          sub={fireCloudLabel(fire.score)}
          note="中高云承光、低云遮挡与气溶胶"
        />
        <ConclusionStat
          icon={SunMedium}
          label="数据置信度"
          value={confidence > 0
            ? `约 ${Math.round(confidence * 100)}%`
            : "较低"}
          sub={CONFIDENCE_LABELS[level]}
          note="取两项评分中较低者，反映缺测与数据时效"
        />
      </div>

      {potential.scoreMode !== "FULL" || fire.scoreMode !== "FULL" ? (
        <p className="border-t border-primary/15 px-5 py-3 text-xs leading-5 text-amber-700 dark:text-amber-300">
          部分天气字段缺失，评分已按可用数据降级；具体缺项可在下方「查看预测依据」中核对。
        </p>
      ) : null}
    </section>
  );
}

function ConclusionStat({
  icon: Icon,
  label,
  value,
  sub,
  note,
}: {
  icon: typeof Gauge;
  label: string;
  value: string;
  sub: string;
  note: string;
}) {
  return (
    <div className="rounded-xl bg-card/80 px-3 py-2.5">
      <p className="flex items-center gap-1 text-xs text-muted-foreground">
        <Icon className="size-3.5" />{label}
      </p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
      <p className="text-xs font-medium text-primary">{sub}</p>
      <p className="mt-1 text-xs leading-4 text-muted-foreground">{note}</p>
    </div>
  );
}
