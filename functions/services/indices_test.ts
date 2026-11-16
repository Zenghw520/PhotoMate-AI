import { buildPhotographyIndices } from "./indices.ts";
import type {
  HourlyWeather,
  PotentialScore,
  TimelineItem,
  WeatherData,
} from "../shared/contracts.ts";
import { assertEquals } from "../providers/test_utils.ts";

function timelineItem(
  kind: TimelineItem["kind"],
  score: number | null,
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
    weather: {
      condition: "多云",
      cloud: 40,
      precipitationProbability: 10,
      windSpeed: 2,
      visibility: 20_000,
    },
    isPast: false,
    reasons: [],
    risks: [],
  };
}

function potential(score: number): PotentialScore {
  return {
    status: "OK",
    score,
    confidence: 0.6,
    confidenceLevel: "MEDIUM",
    basis: [],
    missingFields: [],
    forecastWindow: null,
    scoreMode: "FULL",
    summary: "",
  };
}

function hourly(time: string, cloud: number | null): HourlyWeather {
  return {
    time,
    temperature: 10,
    condition: "多云",
    humidity: 60,
    cloud,
    precipitationProbability: 10,
    precipitation: 0,
    windSpeed: 2,
    windDirection: "北风",
    visibility: cloud === null ? null : 5_000,
  };
}

function weather(overrides: Partial<WeatherData> = {}): WeatherData {
  return {
    status: "OK",
    current: null,
    hourly: [
      hourly("2026-01-02T21:00:00+08:00", 90),
      hourly("2026-01-02T22:00:00+08:00", 90),
    ],
    sources: ["test"],
    missingFields: [],
    message: null,
    ...overrides,
  };
}

Deno.test("摄影指数按题材计算、修正星空并加权综合", () => {
  const indices = buildPhotographyIndices({
    landscape: [
      timelineItem(
        "DAWN",
        80,
        "2026-01-02T06:00:00+08:00",
        "2026-01-02T07:00:00+08:00",
      ),
      timelineItem(
        "SUNRISE",
        90,
        "2026-01-02T07:00:00+08:00",
        "2026-01-02T08:00:00+08:00",
      ),
      timelineItem(
        "SUNSET",
        70,
        "2026-01-02T17:00:00+08:00",
        "2026-01-02T18:00:00+08:00",
      ),
      timelineItem(
        "NIGHT",
        40,
        "2026-01-02T20:00:00+08:00",
        "2026-01-02T23:00:00+08:00",
      ),
    ],
    portrait: [
      timelineItem(
        "MORNING_GOLDEN",
        75,
        "2026-01-02T08:00:00+08:00",
        "2026-01-02T09:00:00+08:00",
      ),
    ],
    urban: [
      timelineItem(
        "DAYTIME",
        65,
        "2026-01-02T12:00:00+08:00",
        "2026-01-02T13:00:00+08:00",
      ),
      timelineItem(
        "NIGHT",
        60,
        "2026-01-02T20:00:00+08:00",
        "2026-01-02T23:00:00+08:00",
      ),
    ],
    night: [
      timelineItem(
        "NIGHT",
        50,
        "2026-01-02T20:00:00+08:00",
        "2026-01-02T23:00:00+08:00",
      ),
      timelineItem(
        "BLUE_HOUR",
        55,
        "2026-01-02T18:00:00+08:00",
        "2026-01-02T19:00:00+08:00",
      ),
    ],
    potential: { dawn: potential(80), dusk: potential(70) },
    weather: weather(),
  });

  const entry = (id: string) => indices.entries.find((item) => item.id === id);
  assertEquals(entry("LANDSCAPE")?.score, 80);
  assertEquals(entry("PORTRAIT")?.score, 75);
  assertEquals(entry("URBAN")?.score, 62.5);
  assertEquals(entry("NIGHT")?.score, 52.5);
  assertEquals(entry("ASTRONOMY")?.score, 17);
  assertEquals(entry("DAWN")?.score, 80);
  assertEquals(entry("DUSK")?.score, 70);
  assertEquals(indices.overall, 62.5);
  assertEquals(indices.confidence, "HIGH");
  assertEquals(indices.trend.length, 4);
  assertEquals(indices.trend[0].score, 80);
  assertEquals(indices.basis.length >= 3, true);
});

Deno.test("天气不可用时摄影指数降低置信度", () => {
  const indices = buildPhotographyIndices({
    landscape: [
      timelineItem(
        "SUNRISE",
        null,
        "2026-01-02T07:00:00+08:00",
        "2026-01-02T08:00:00+08:00",
      ),
    ],
    portrait: [],
    urban: [],
    night: [],
    potential: { dawn: potential(0), dusk: potential(0) },
    weather: weather({ status: "UNAVAILABLE", hourly: [] }),
  });
  assertEquals(indices.confidence, "LOW");
  assertEquals(
    indices.entries.find((item) => item.id === "ASTRONOMY")?.score,
    null,
  );
  assertEquals(indices.overall !== null, true);
});
