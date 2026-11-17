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
      cloud: 45,
      precipitationProbability: 10,
      windSpeed: 3,
      visibility: 15_000,
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

function potentialUnavailable(): PotentialScore {
  return {
    status: "UNAVAILABLE",
    score: null,
    confidence: 0,
    confidenceLevel: "LOW",
    basis: [],
    missingFields: ["cloud"],
    forecastWindow: null,
    scoreMode: "UNAVAILABLE",
    summary: "天气不可用",
  };
}

function hourly(
  time: string,
  overrides: Partial<HourlyWeather> = {},
): HourlyWeather {
  return {
    time,
    temperature: 10,
    condition: "多云",
    humidity: 60,
    cloud: 45,
    cloudHigh: 40,
    cloudMid: 35,
    cloudLow: 20,
    aerosolOpticalDepth: 0.2,
    precipitationProbability: 10,
    precipitation: 0,
    windSpeed: 3,
    windDirection: "北风",
    visibility: 15_000,
    ...overrides,
  };
}

function weather(overrides: Partial<WeatherData> = {}): WeatherData {
  return {
    status: "OK",
    current: null,
    hourly: [
      hourly("2026-01-02T06:30:00+08:00"),
      hourly("2026-01-02T07:30:00+08:00"),
      hourly("2026-01-02T08:30:00+08:00"),
      hourly("2026-01-02T12:30:00+08:00"),
      hourly("2026-01-02T17:30:00+08:00"),
      hourly("2026-01-02T21:00:00+08:00"),
      hourly("2026-01-02T22:00:00+08:00"),
    ],
    sources: ["test"],
    missingFields: [],
    message: null,
    forecastUpdatedAt: "2026-01-01T23:00:00.000Z",
    ...overrides,
  };
}

function input(
  overrides: Partial<Parameters<typeof buildPhotographyIndices>[0]> = {},
) {
  return {
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
    ...overrides,
  };
}

Deno.test("七个题材使用独立权重、真实逐小时数据并给出可核对依据", () => {
  const indices = buildPhotographyIndices(input());
  const entry = (id: string) => indices.entries.find((item) => item.id === id)!;

  assertEquals(entry("LANDSCAPE").score, 87.8);
  assertEquals(entry("PORTRAIT").score, 88.3);
  assertEquals(entry("URBAN").score, 86);
  assertEquals(entry("NIGHT").score, 79.5);
  assertEquals(entry("ASTRONOMY").score, 75);
  assertEquals(entry("DAWN").score, 80);
  assertEquals(entry("DUSK").score, 70);
  assertEquals(indices.overall, 81.4);
  assertEquals(indices.confidence, "HIGH");

  const landscapeCloud = entry("LANDSCAPE").basis.find((item) =>
    item.code === "cloud"
  )!;
  assertEquals(landscapeCloud.value, 45);
  assertEquals(
    landscapeCloud.contribution !== null &&
      landscapeCloud.contribution > 0,
    true,
  );
  assertEquals(entry("LANDSCAPE").status, "OK");
  assertEquals(entry("LANDSCAPE").windowLabel, "DAWN、SUNRISE、SUNSET");
  assertEquals(
    entry("ASTRONOMY").basis.find((item) => item.code === "clearSky")?.value,
    55,
  );
  assertEquals(indices.trend.length, 4);
  assertEquals(indices.basis.length >= 4, true);
});

Deno.test("天气不可用或窗口无逐小时数据时不输出摄影天气分", () => {
  const indices = buildPhotographyIndices(input({
    weather: weather({ status: "UNAVAILABLE", hourly: [] }),
    potential: { dawn: potentialUnavailable(), dusk: potentialUnavailable() },
  }));
  const astronomy = indices.entries.find((item) => item.id === "ASTRONOMY")!;
  assertEquals(astronomy.score, null);
  assertEquals(astronomy.status, "UNAVAILABLE");
  assertEquals(indices.overall, null);
  assertEquals(indices.confidence, "LOW");
});

Deno.test("题材评分的因子贡献可加总回总分", () => {
  const indices = buildPhotographyIndices(input());
  for (const entry of indices.entries) {
    if (
      entry.id === "DAWN" || entry.id === "DUSK" || entry.score === null ||
      entry.status === "UNAVAILABLE"
    ) continue;
    const total = entry.basis.reduce(
      (sum, item) => sum + (item.contribution ?? 0),
      0,
    );
    assertEquals(Math.abs(total - entry.score) <= 0.5, true);
  }
});

Deno.test("缺失分层云量时按剩余权重归一化并标注字段", () => {
  const sparse = hourly("2026-01-02T21:00:00+08:00", {
    cloudHigh: null,
    cloudMid: null,
    cloudLow: null,
    aerosolOpticalDepth: null,
  });
  const indices = buildPhotographyIndices(input({
    weather: weather({ hourly: [sparse] }),
  }));
  const astronomy = indices.entries.find((item) => item.id === "ASTRONOMY")!;
  assertEquals(astronomy.score !== null, true);
  assertEquals(astronomy.status, "PARTIAL");
  assertEquals(astronomy.missingFields.includes("cloudLow"), true);
  assertEquals(astronomy.missingFields.includes("aerosolOpticalDepth"), true);
  assertEquals(
    astronomy.basis.find((item) => item.code === "aerosolOpticalDepth")
      ?.contribution,
    null,
  );
});
