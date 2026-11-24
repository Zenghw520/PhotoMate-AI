import type { PlanRecord } from "@/src/lib/records";
import { spotSourceLabel, type SpotSource } from "@/src/lib/shooting";

/** 把 ISO 时间转成拍摄点当地（Asia/Shanghai）的 ICS 本地时间。 */
function localStamp(iso: string) {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${value.year}${value.month}${value.day}T${value.hour}${value.minute}${value.second}`;
}

function utcStamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function escapeText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** RFC 5545 要求每行不超过 75 字节，需要折行。 */
function fold(line: string) {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 74) return line;
  const chunks: string[] = [];
  let current = "";
  for (const char of line) {
    if (encoder.encode(current + char).length > 73) {
      chunks.push(current);
      current = char;
    } else {
      current += char;
    }
  }
  if (current) chunks.push(current);
  return chunks.join("\r\n ");
}

function timeText(iso: string) {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export function buildPlanIcs(record: PlanRecord) {
  const start = localStamp(record.arrivalTime) ?? localStamp(record.timeWindow.start);
  const end = localStamp(record.timeWindow.end);
  if (!start || !end) throw new Error("记录时间无效，无法导出日历。");
  const spotName = record.spot?.name ?? record.locationName;
  const spotNote = record.spot
    ? spotSourceLabel((record.spot.source ?? "MANUAL") as SpotSource)
    : "拍摄位置";
  const description = [
    `机位：${spotName}（${spotNote}）`,
    `窗口：${timeText(record.timeWindow.start)}–${timeText(record.timeWindow.end)}${
      record.windowLabel ? ` · ${record.windowLabel}` : ""
    }`,
    `建议到达：${timeText(record.arrivalTime)}`,
    record.cameraDirection ? `拍摄方向：${record.cameraDirection}` : null,
    record.exposureStart ? `曝光起点：${record.exposureStart}` : null,
    `题材：${record.subject}`,
    record.equipment ? `设备：${record.equipment}` : null,
    record.backup
      ? `备选：${record.backup.trigger} → ${record.backup.action}（${record.backup.windowLabel}）`
      : null,
    record.checklist && record.checklist.length
      ? `出门清单：${record.checklist.join("；")}`
      : null,
    record.spot
      ? `坐标：${record.spot.latitude.toFixed(5)}, ${record.spot.longitude.toFixed(5)}`
      : null,
  ].filter((line): line is string => Boolean(line)).join("\n");

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//逐光//Shooting Plan//CN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VTIMEZONE",
    "TZID:Asia/Shanghai",
    "BEGIN:STANDARD",
    "DTSTART:19700101T000000",
    "TZOFFSETFROM:+0800",
    "TZOFFSETTO:+0800",
    "TZNAME:CST",
    "END:STANDARD",
    "END:VTIMEZONE",
    "BEGIN:VEVENT",
    `UID:${record.id}@zhuguang.app`,
    `DTSTAMP:${utcStamp()}`,
    `DTSTART;TZID=Asia/Shanghai:${start}`,
    `DTEND;TZID=Asia/Shanghai:${end}`,
    `SUMMARY:${escapeText(`拍摄｜${record.title}`)}`,
    `LOCATION:${escapeText(
      record.spot
        ? `${spotName} ${record.spot.latitude.toFixed(5)},${record.spot.longitude.toFixed(5)}`
        : spotName,
    )}`,
    record.spot
      ? `GEO:${record.spot.latitude.toFixed(6)};${record.spot.longitude.toFixed(6)}`
      : null,
    `DESCRIPTION:${escapeText(description)}`,
    "STATUS:CONFIRMED",
    "BEGIN:VALARM",
    "TRIGGER:-PT30M",
    "ACTION:DISPLAY",
    `DESCRIPTION:${escapeText("出发提醒：检查出门清单")}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter((line): line is string => Boolean(line));

  return lines.map(fold).join("\r\n");
}

export function downloadPlanIcs(record: PlanRecord) {
  const content = buildPlanIcs(record);
  const blob = new Blob([content], {
    type: "text/calendar;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const safe = (record.spot?.name ?? record.locationName)
    .replace(/[\\/:*?"<>|\s]+/g, "-")
    .slice(0, 32);
  anchor.href = url;
  anchor.download = `逐光-${record.date}-${safe || "plan"}.ics`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
