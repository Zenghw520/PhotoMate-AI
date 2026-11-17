import { buildWeatherAlerts } from "./weather_alerts.ts";
import type { HourlyWeather, TimelineItem } from "../shared/contracts.ts";
import { assertEquals } from "../providers/test_utils.ts";

function hourly(
  time: string,
  overrides: Partial<HourlyWeather> = {},
): HourlyWeather {
  return {
    time,
    temperature: 20,
    condition: "多云",
    humidity: 60,
    cloud: 20,
    precipitationProbability: 10,
    precipitation: 0,
    windSpeed: 2,
    windDirection: "东",
    visibility: 20_000,
    ...overrides,
  };
}

function slot(
  kind: TimelineItem["kind"],
  score: number,
  start: string,
  end: string,
): TimelineItem {
  return {
    slotId: `${kind}-${start}`,
    start,
    end,
    kind,
    label: kind,
    score,
    scoreMode: "FULL",
    solar: { elevation: 10, azimuth: 120 },
    weather: null,
    isPast: false,
    reasons: [],
    risks: [],
  };
}

Deno.test("天气提醒由真实逐小时变化动态生成并标注时间", () => {
  const now = new Date("2026-01-02T07:00:00+08:00");
  const alerts = buildWeatherAlerts(
    [
      hourly("2026-01-02T08:00:00+08:00", { cloud: 10 }),
      hourly("2026-01-02T12:00:00+08:00", { cloud: 75 }),
      hourly("2026-01-02T15:00:00+08:00", {
        cloud: 85,
        precipitationProbability: 85,
        precipitation: 3,
      }),
      hourly("2026-01-02T16:00:00+08:00", { visibility: 1_500 }),
      hourly("2026-01-02T17:00:00+08:00", { windSpeed: 10 }),
    ],
    [
      slot(
        "MORNING_GOLDEN",
        80,
        "2026-01-02T08:00:00+08:00",
        "2026-01-02T09:00:00+08:00",
      ),
      slot(
        "SUNSET",
        60,
        "2026-01-02T17:00:00+08:00",
        "2026-01-02T18:00:00+08:00",
      ),
    ],
    "2026-01-02",
    now,
  );
  assertEquals(alerts.length, 5);
  assertEquals(alerts.some((item) => item.kind === "PRECIPITATION"), true);
  assertEquals(alerts.some((item) => item.kind === "VISIBILITY"), true);
  assertEquals(alerts.some((item) => item.kind === "WIND"), true);
  assertEquals(alerts.some((item) => item.kind === "CLOUD"), true);
  assertEquals(alerts.some((item) => item.kind === "BEST_WINDOW"), true);
  assertEquals(alerts[0].level, "WARNING");
  assertEquals(alerts.every((item) => item.detail.length > 0), true);
  assertEquals(
    alerts.find((item) => item.kind === "CLOUD")?.time,
    "2026-01-02T15:00:00+08:00",
  );
});

Deno.test("没有真实天气时只保留基于时间轴的窗口提醒", () => {
  const now = new Date("2026-01-02T07:00:00+08:00");
  const alerts = buildWeatherAlerts(
    [],
    [
      slot(
        "MORNING_GOLDEN",
        80,
        "2026-01-02T08:00:00+08:00",
        "2026-01-02T09:00:00+08:00",
      ),
    ],
    "2026-01-02",
    now,
  );
  assertEquals(alerts.length, 1);
  assertEquals(alerts[0].kind, "BEST_WINDOW");
});
