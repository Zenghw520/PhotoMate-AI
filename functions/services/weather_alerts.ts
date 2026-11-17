import type {
  HourlyWeather,
  TimelineItem,
  WeatherAlert,
} from "../shared/contracts.ts";

const DAY_MS = 86_400_000;

function clock(value: string | null): string {
  if (!value) return "";
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(time));
}

function pct(value: number | null): string {
  return value === null ? "—" : `${Math.round(value)}%`;
}

function shanghaiDate(now: Date): string {
  return new Date(now.getTime() + 8 * 60 * 60_000).toISOString().slice(0, 10);
}

function targetStart(date: string, now: Date): number {
  const start = Date.parse(`${date}T00:00:00+08:00`);
  if (!Number.isFinite(start)) return now.getTime();
  if (date === shanghaiDate(now)) {
    return Math.max(start, now.getTime() - 30 * 60_000);
  }
  return start;
}

function activeHours(
  hourly: HourlyWeather[],
  date: string,
  now: Date,
): HourlyWeather[] {
  const start = targetStart(date, now);
  const end = date === shanghaiDate(now)
    ? start + 24 * 60 * 60_000
    : Date.parse(`${date}T00:00:00+08:00`) + DAY_MS;
  if (end < now.getTime()) return [];
  return hourly.filter((entry) => {
    const time = Date.parse(entry.time);
    return Number.isFinite(time) && time >= start && time <= end;
  }).slice(0, 24);
}

function precipitationAlert(hours: HourlyWeather[]): WeatherAlert | null {
  let peak: HourlyWeather | null = null;
  for (const entry of hours) {
    if ((entry.precipitationProbability ?? 0) >= 50) {
      if (
        !peak || (entry.precipitationProbability ?? 0) >
          (peak.precipitationProbability ?? 0)
      ) peak = entry;
    }
  }
  if (!peak) return null;
  const probability = peak.precipitationProbability ?? 0;
  const amount = peak.precipitation ?? 0;
  const level = probability >= 80 || amount >= 2.5 ? "WARNING" : "WATCH";
  return {
    id: `precipitation-${peak.time}`,
    kind: "PRECIPITATION",
    level,
    title: level === "WARNING" ? "降水风险较高" : "降水概率上升",
    detail: `${clock(peak.time)} 前后降水概率 ${pct(probability)}${
      amount > 0 ? `，小时降水量约 ${amount.toFixed(1)} mm` : ""
    }；建议准备防雨并保留备选机位。`,
    time: peak.time,
  };
}

function cloudShiftAlert(hours: HourlyWeather[]): WeatherAlert | null {
  const window = hours.slice(0, 12).filter((entry) => entry.cloud !== null);
  let best: { from: HourlyWeather; to: HourlyWeather; delta: number } | null =
    null;
  for (let index = 0; index < window.length; index++) {
    for (let next = index + 1; next < window.length; next++) {
      const delta = (window[next].cloud ?? 0) - (window[index].cloud ?? 0);
      if (!best || Math.abs(delta) > Math.abs(best.delta)) {
        best = { from: window[index], to: window[next], delta };
      }
    }
  }
  if (!best || Math.abs(best.delta) < 25) return null;
  const rising = best.delta > 0;
  return {
    id: `cloud-${best.from.time}-${best.to.time}`,
    kind: "CLOUD",
    level: "INFO",
    title: rising ? "云量将明显增加" : "云量将明显减少",
    detail: `${clock(best.from.time)} 云量 ${pct(best.from.cloud)} → ${
      clock(best.to.time)
    } ${pct(best.to.cloud)}，${
      rising
        ? "天空层次可能增加，也可能遮挡太阳"
        : "天空趋于通透，画面层次可能减少"
    }。`,
    time: best.to.time,
  };
}

function visibilityAlert(hours: HourlyWeather[]): WeatherAlert | null {
  const visible = hours.filter((entry) => entry.visibility !== null);
  if (visible.length === 0) return null;
  const lowest = visible.reduce((min, entry) =>
    (entry.visibility ?? Infinity) < (min.visibility ?? Infinity) ? entry : min
  );
  const first = visible[0];
  const drop = (first.visibility ?? 0) - (lowest.visibility ?? 0);
  if ((lowest.visibility ?? Infinity) >= 5_000 && drop < 5_000) return null;
  const level = (lowest.visibility ?? Infinity) < 2_000 ? "WARNING" : "WATCH";
  return {
    id: `visibility-${lowest.time}`,
    kind: "VISIBILITY",
    level,
    title: drop >= 5_000 ? "能见度将明显下降" : "能见度偏低",
    detail: `${clock(lowest.time)} 能见度约 ${
      ((lowest.visibility ?? 0) / 1000).toFixed(1)
    } km；远景层次、霞光与星空细节可能受限。`,
    time: lowest.time,
  };
}

function windAlert(hours: HourlyWeather[]): WeatherAlert | null {
  const windy = hours.filter((entry) => entry.windSpeed !== null);
  if (windy.length === 0) return null;
  const max = windy.reduce((strongest, entry) =>
    (entry.windSpeed ?? 0) > (strongest.windSpeed ?? 0) ? entry : strongest
  );
  const first = windy[0];
  const increase = (max.windSpeed ?? 0) - (first.windSpeed ?? 0);
  if ((max.windSpeed ?? 0) < 8 && increase < 5) return null;
  return {
    id: `wind-${max.time}`,
    kind: "WIND",
    level: (max.windSpeed ?? 0) >= 12 ? "WARNING" : "WATCH",
    title: "风速将增大",
    detail: `${clock(max.time)} 风速约 ${
      (max.windSpeed ?? 0).toFixed(1)
    } m/s，较当前增加 ${
      increase.toFixed(1)
    } m/s；注意脚架稳定、长曝光与无人机安全。`,
    time: max.time,
  };
}

function bestWindowAlert(
  timeline: TimelineItem[],
  now: Date,
  date: string,
): WeatherAlert | null {
  const future = timeline.filter((item) =>
    item.start.slice(0, 10) === date && !item.isPast &&
    item.score !== null && Date.parse(item.end) > now.getTime()
  );
  if (future.length === 0) return null;
  const best =
    [...future].sort((left, right) =>
      (right.score ?? 0) - (left.score ?? 0)
    )[0];
  const firstHalf = future.filter((item) =>
    Date.parse(item.start) < Date.parse(future[0].start) + 12 * 60 * 60_000
  );
  const secondHalf = future.filter((item) =>
    Date.parse(item.start) >= Date.parse(future[0].start) + 12 * 60 * 60_000
  );
  const top = (items: TimelineItem[]) =>
    items.length
      ? [...items].sort((left, right) =>
        (right.score ?? 0) - (left.score ?? 0)
      )[0]
      : null;
  const morning = top(firstHalf);
  const evening = top(secondHalf);
  if (
    morning && evening &&
    Math.abs((morning.score ?? 0) - (evening.score ?? 0)) >= 8
  ) {
    const later = (evening.score ?? 0) > (morning.score ?? 0);
    return {
      id: `window-shift-${best.slotId}`,
      kind: "BEST_WINDOW",
      level: "INFO",
      title: later ? "最佳拍摄时段偏向傍晚" : "最佳拍摄时段偏向清晨",
      detail: `${morning.label} ${clock(morning.start)} 约 ${
        Math.round(morning.score ?? 0)
      } 分，${evening.label} ${clock(evening.start)} 约 ${
        Math.round(evening.score ?? 0)
      } 分；请按分数变化调整到达时间。`,
      time: best.start,
    };
  }
  return {
    id: `window-${best.slotId}`,
    kind: "BEST_WINDOW",
    level: "INFO",
    title: "最佳拍摄窗口",
    detail: `${best.label} ${clock(best.start)}–${clock(best.end)}，评分约 ${
      Math.round(best.score ?? 0)
    } 分；建议提前约 40 分钟到达完成机位与构图。`,
    time: best.start,
  };
}

export function buildWeatherAlerts(
  hourly: HourlyWeather[],
  timeline: TimelineItem[],
  date: string,
  now: Date = new Date(),
): WeatherAlert[] {
  const hours = activeHours(hourly, date, now);
  const alerts = [
    hours.length ? precipitationAlert(hours) : null,
    hours.length ? visibilityAlert(hours) : null,
    hours.length ? windAlert(hours) : null,
    hours.length ? cloudShiftAlert(hours) : null,
    bestWindowAlert(timeline, now, date),
  ].filter((alert): alert is WeatherAlert => alert !== null);
  const rank = { WARNING: 0, WATCH: 1, INFO: 2 };
  return alerts
    .sort((left, right) => rank[left.level] - rank[right.level])
    .slice(0, 5);
}
