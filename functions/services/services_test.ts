import { strict as assert } from "node:assert";
import { computeSolar } from "../astronomy/solar.ts";
import type { HourlyWeather, LocationResult } from "../shared/contracts.ts";
import { buildRulePlans } from "./planner.ts";
import { scoreFireCloud } from "./firecloud.ts";
import { scoreTwilight } from "./scoring.ts";
import { buildTimeline } from "./timeline.ts";

const LOCATION: LocationResult = {
  name: "上海市黄浦区",
  latitude: 31.2304,
  longitude: 121.4737,
  precision: "DISTRICT",
  timezone: "Asia/Shanghai",
};

function hourly(
  time: string,
  overrides: Partial<HourlyWeather> = {},
): HourlyWeather {
  return {
    time,
    temperature: 20,
    condition: "多云",
    humidity: 60,
    cloud: 40,
    precipitationProbability: 10,
    precipitation: 0,
    windSpeed: 2,
    windDirection: "东",
    visibility: 12_000,
    ...overrides,
  };
}

const WINDOW = {
  start: "2025-03-20T04:30:00+08:00",
  end: "2025-03-20T06:30:00+08:00",
};
const FETCHED_AT = new Date("2025-03-19T12:00:00+08:00");

Deno.test("暮光评分只使用窗口前后90分钟内的真实逐小时数据", () => {
  const result = scoreTwilight(
    "dawn",
    WINDOW,
    [
      hourly("2025-03-20T03:00:00+08:00"),
      hourly("2025-03-20T05:00:00+08:00"),
      hourly("2025-03-20T08:00:00+08:00"),
      hourly("2025-03-20T08:01:00+08:00", {
        cloud: 100,
        precipitationProbability: 100,
      }),
    ],
    FETCHED_AT,
    FETCHED_AT,
  );
  assert.equal(result.status, "OK");
  assert.equal(result.scoreMode, "PARTIAL");
  assert.equal(result.basis.find((item) => item.code === "cloud")?.value, 40);
  assert.ok(result.score !== null && result.score > 75);
  assert.equal(
    result.basis.find((item) => item.code === "cloudHigh")?.value,
    null,
  );
  assert.match(result.summary, /缺少高中低云分层/);
  assert.ok(result.confidence <= 0.74);
  assert.equal(result.confidenceLevel, "MEDIUM");
  assert.match(result.summary, /置信度反映数据完整性与时效性/);
});

Deno.test("缺字段按剩余权重归一化并降低置信度，云量全缺则不评分", () => {
  const complete = scoreTwilight(
    "dusk",
    WINDOW,
    [hourly("2025-03-20T05:00:00+08:00")],
    FETCHED_AT,
    FETCHED_AT,
  );
  const partial = scoreTwilight(
    "dusk",
    WINDOW,
    [hourly("2025-03-20T05:00:00+08:00", {
      humidity: null,
      precipitationProbability: null,
      precipitation: null,
      windSpeed: null,
      visibility: null,
    })],
    FETCHED_AT,
    FETCHED_AT,
  );
  assert.ok(partial.score !== null);
  assert.equal(partial.scoreMode, "PARTIAL");
  assert.ok(partial.confidence < complete.confidence);
  assert.equal(
    partial.basis.find((item) => item.code === "visibility")?.contribution,
    null,
  );
  assert.ok(partial.missingFields.includes("visibility"));

  const noCloud = scoreTwilight(
    "dusk",
    WINDOW,
    [hourly("2025-03-20T05:00:00+08:00", { cloud: null })],
    FETCHED_AT,
    FETCHED_AT,
  );
  assert.equal(noCloud.score, null);
  assert.equal(noCloud.status, "INSUFFICIENT_DATA");
  assert.equal(noCloud.scoreMode, "UNAVAILABLE");
});

Deno.test("窗口无覆盖与过期数据不会被当成完整可靠评分", () => {
  const noCoverage = scoreTwilight(
    "dawn",
    WINDOW,
    [hourly("2025-03-20T10:00:00+08:00")],
    FETCHED_AT,
    FETCHED_AT,
  );
  assert.equal(noCoverage.score, null);
  assert.equal(noCoverage.status, "UNAVAILABLE");
  assert.equal(noCoverage.confidence, 0);

  const fresh = scoreTwilight(
    "dawn",
    WINDOW,
    [hourly("2025-03-20T05:00:00+08:00")],
    FETCHED_AT,
    FETCHED_AT,
  );
  const stale = scoreTwilight(
    "dawn",
    WINDOW,
    [hourly("2025-03-20T05:00:00+08:00")],
    FETCHED_AT,
    new Date("2025-03-22T12:00:00+08:00"),
  );
  assert.ok(stale.confidence < fresh.confidence);
  assert.notEqual(fresh.summary, "");
});

Deno.test("时间轴按太阳窗口排序、去重叠并标记已过时段", () => {
  const solar = computeSolar(
    LOCATION.latitude,
    LOCATION.longitude,
    "2025-03-20",
  );
  const beforeDay = new Date("2025-03-19T12:00:00+08:00");
  const timeline = buildTimeline(LOCATION, solar, [], "LANDSCAPE", beforeDay);
  assert.deepEqual(timeline.map((item) => item.kind), [
    "DAWN",
    "SUNRISE",
    "MORNING_GOLDEN",
    "DAYTIME",
    "EVENING_GOLDEN",
    "SUNSET",
    "DUSK",
    "NIGHT",
  ]);
  assert.equal(timeline[0].start, solar.blueHours[0].start);
  assert.equal(timeline[0].end, solar.blueHours[0].end);
  for (let index = 0; index < timeline.length; index++) {
    assert.ok(
      Date.parse(timeline[index].start) < Date.parse(timeline[index].end),
    );
    assert.equal(timeline[index].scoreMode, "ASTRO_ONLY");
    assert.equal(timeline[index].weather, null);
    assert.equal(timeline[index].isPast, false);
    if (index > 0) {
      assert.ok(
        Date.parse(timeline[index - 1].end) <=
          Date.parse(timeline[index].start),
      );
    }
  }

  const atNoon = buildTimeline(
    LOCATION,
    solar,
    [],
    "LANDSCAPE",
    new Date("2025-03-20T12:00:00+08:00"),
  );
  assert.ok(atNoon.find((item) => item.kind === "SUNRISE")?.isPast);
  assert.equal(atNoon.find((item) => item.kind === "DAYTIME")?.isPast, false);
  assert.equal(atNoon.find((item) => item.kind === "NIGHT")?.isPast, false);
});

Deno.test("时间轴有覆盖时结合主题与完整天气，无覆盖时保持ASTRO_ONLY", () => {
  const solar = computeSolar(
    LOCATION.latitude,
    LOCATION.longitude,
    "2025-03-20",
  );
  const beforeDay = new Date("2025-03-19T12:00:00+08:00");
  const initial = buildTimeline(LOCATION, solar, [], "LANDSCAPE", beforeDay);
  const weather = initial.map((item) =>
    hourly(
      new Date((Date.parse(item.start) + Date.parse(item.end)) / 2)
        .toISOString(),
    )
  );
  const landscape = buildTimeline(
    LOCATION,
    solar,
    weather,
    "LANDSCAPE",
    beforeDay,
  );
  const nightTheme = buildTimeline(
    LOCATION,
    solar,
    weather,
    "NIGHT",
    beforeDay,
  );
  assert.ok(
    landscape.every((item) =>
      item.scoreMode === "FULL" && item.weather !== null
    ),
  );
  assert.ok(
    nightTheme.find((item) => item.kind === "NIGHT")!.score! >
      landscape.find((item) => item.kind === "NIGHT")!.score!,
  );
  assert.ok(
    landscape.find((item) => item.kind === "MORNING_GOLDEN")!.score! >
      nightTheme.find((item) => item.kind === "MORNING_GOLDEN")!.score!,
  );

  const outside = buildTimeline(
    LOCATION,
    solar,
    [hourly("2025-04-01T12:00:00+08:00")],
    "LANDSCAPE",
    beforeDay,
  );
  assert.ok(outside.every((item) => item.scoreMode === "ASTRO_ONLY"));
  const noCloud = buildTimeline(
    LOCATION,
    solar,
    [hourly("2025-03-20T12:00:00+08:00", { cloud: null })],
    "LANDSCAPE",
    beforeDay,
  );
  assert.equal(
    noCloud.find((item) => item.kind === "DAYTIME")?.scoreMode,
    "ASTRO_ONLY",
  );
});

Deno.test("规则计划选择未来最多三个窗口且不依赖AI或虚构机位", () => {
  const solar = computeSolar(
    LOCATION.latitude,
    LOCATION.longitude,
    "2025-03-20",
  );
  const beforeDay = new Date("2025-03-19T12:00:00+08:00");
  const initial = buildTimeline(LOCATION, solar, [], "TRAVEL", beforeDay);
  const weather = initial.map((item) =>
    hourly(
      new Date((Date.parse(item.start) + Date.parse(item.end)) / 2)
        .toISOString(),
    )
  );
  const timeline = buildTimeline(LOCATION, solar, weather, "TRAVEL", beforeDay);
  const plans = buildRulePlans(timeline, "TRAVEL", LOCATION);
  assert.equal(plans.length, 3);
  for (const plan of plans) {
    const source = timeline.find((item) => item.slotId === plan.slotId)!;
    assert.equal(source.isPast, false);
    assert.equal(plan.aiEnhanced, false);
    assert.deepEqual(plan.timeWindow, { start: source.start, end: source.end });
    assert.match(plan.locationNote, /区县行政中心近似位置/);
    assert.match(plan.cameraSettings, /起步范围/);
    assert.match(plan.viewpoint, /可达|环境/);
    assert.doesNotMatch(
      JSON.stringify(plan),
      /保证出片|精准曝光|已确认无遮挡|AI生成/,
    );
  }
  const expectedOrder = [...timeline].sort((a, b) =>
    (b.score ?? -1) - (a.score ?? -1)
  ).slice(0, 3).map((item) => item.slotId);
  assert.deepEqual(plans.map((plan) => plan.slotId), expectedOrder);

  const allPast = buildTimeline(
    LOCATION,
    solar,
    [],
    "TRAVEL",
    new Date("2025-03-22T12:00:00+08:00"),
  );
  assert.deepEqual(buildRulePlans(allPast, "TRAVEL", LOCATION), []);
});

Deno.test("规则计划按位置精度说明来源，不把近似位置当成已核实机位", () => {
  const solar = computeSolar(
    LOCATION.latitude,
    LOCATION.longitude,
    "2025-03-20",
  );
  const timeline = buildTimeline(
    LOCATION,
    solar,
    [],
    "TRAVEL",
    new Date("2025-03-19T12:00:00+08:00"),
  );
  const gps = buildRulePlans(timeline, "TRAVEL", {
    ...LOCATION,
    precision: "GPS",
  });
  const manual = buildRulePlans(timeline, "TRAVEL", {
    ...LOCATION,
    precision: "MANUAL",
  });
  const district = buildRulePlans(timeline, "TRAVEL", LOCATION);
  assert.match(gps[0].locationNote, /GPS坐标/);
  assert.match(manual[0].locationNote, /手动选择位置/);
  assert.match(district[0].locationNote, /区县行政中心近似位置/);
});

Deno.test("火烧云评分偏好适中云量并诚实标注云层与气溶胶缺失", () => {
  const result = scoreFireCloud(
    "dusk",
    WINDOW,
    [hourly("2025-03-20T05:00:00+08:00", {
      cloud: 50,
      humidity: 60,
      visibility: 20_000,
      precipitationProbability: 10,
      precipitation: 0,
      windSpeed: 3,
    })],
    FETCHED_AT,
    FETCHED_AT,
  );
  assert.equal(result.status, "OK");
  assert.ok(result.score !== null && result.score > 70);
  assert.equal(result.scoreMode, "PARTIAL");
  assert.equal(result.direction, "WEST");
  assert.ok(result.missingFields.includes("cloudHigh"));
  assert.ok(result.missingFields.includes("cloudLow"));
  assert.ok(result.missingFields.includes("aerosolOpticalDepth"));
  assert.ok(result.confidence <= 0.44);
  assert.equal(result.confidenceLevel, "LOW");
  assert.match(result.summary, /火烧云环境评分/);
  assert.equal(result.outlook.possibility, "HIGH");
  assert.equal(result.outlook.possibilityLabel, "较高");
  assert.equal(result.outlook.cloudCover, 50);
  assert.ok(
    result.outlook.vividness !== null && result.outlook.vividness >= 75,
  );
  assert.equal(result.outlook.vividnessLabel, "很鲜艳");
  assert.match(result.outlook.cloudNote, /总云量适中/);
});

Deno.test("霞光与火烧云评分纳入分层云量与气溶胶", () => {
  const time = "2025-03-20T05:00:00+08:00";
  const layered = hourly(time, {
    cloud: 50,
    cloudHigh: 55,
    cloudMid: 40,
    cloudLow: 15,
    aerosolOpticalDepth: 0.12,
  });
  const fire = scoreFireCloud(
    "dusk",
    WINDOW,
    [layered],
    FETCHED_AT,
    FETCHED_AT,
  );
  assert.equal(fire.scoreMode, "FULL");
  assert.equal(fire.missingFields.length, 0);
  assert.equal(fire.outlook.cloudHigh, 55);
  assert.equal(fire.outlook.cloudMid, 40);
  assert.equal(fire.outlook.cloudLow, 15);
  assert.equal(fire.outlook.aerosolOpticalDepth, 0.12);
  assert.ok(fire.confidence > 0.44);
  assert.match(fire.summary, /已纳入高中低云分层与气溶胶数据/);
  assert.ok(
    fire.basis.find((item) => item.code === "cloudLow")?.contribution !==
      null,
  );

  const twilight = scoreTwilight(
    "dusk",
    WINDOW,
    [layered],
    FETCHED_AT,
    FETCHED_AT,
  );
  assert.equal(twilight.missingFields.length, 0);
  assert.equal(twilight.scoreMode, "FULL");
  assert.match(twilight.summary, /已纳入高中低云分层与气溶胶数据/);
  assert.equal(
    twilight.basis.find((item) => item.code === "cloudHigh")?.value,
    55,
  );
});

Deno.test("朝霞与晚霞采用不同的气象权重", () => {
  const layered = hourly("2025-03-20T05:00:00+08:00", {
    cloud: 50,
    cloudHigh: 55,
    cloudMid: 40,
    cloudLow: 15,
    aerosolOpticalDepth: 0.12,
  });
  const dawn = scoreTwilight(
    "dawn",
    WINDOW,
    [layered],
    FETCHED_AT,
    FETCHED_AT,
  );
  const dusk = scoreTwilight(
    "dusk",
    WINDOW,
    [layered],
    FETCHED_AT,
    FETCHED_AT,
  );
  const dawnLow = dawn.basis.find((item) => item.code === "cloudLow")
    ?.contribution;
  const duskLow = dusk.basis.find((item) => item.code === "cloudLow")
    ?.contribution;
  assert.ok(dawnLow !== null && duskLow !== null);
  assert.notEqual(dawnLow, duskLow);
  assert.equal(dawn.basis.find((item) => item.code === "cloud")?.value, 50);
  assert.equal(dusk.basis.find((item) => item.code === "cloud")?.value, 50);
});

Deno.test("低云遮挡与高气溶胶会显著降低火烧云判断", () => {
  const blocked = scoreFireCloud(
    "dusk",
    WINDOW,
    [hourly("2025-03-20T05:00:00+08:00", {
      cloud: 72,
      cloudHigh: 1,
      cloudMid: 23,
      cloudLow: 99,
      aerosolOpticalDepth: 0.95,
    })],
    FETCHED_AT,
    FETCHED_AT,
  );
  assert.ok(blocked.score !== null && blocked.score < 45);
  assert.equal(blocked.outlook.possibility, "LOW");
  assert.ok(
    blocked.outlook.vividness !== null && blocked.outlook.vividness < 55,
  );
  assert.match(blocked.outlook.cloudNote, /低云约 99%/);

  const twilight = scoreTwilight(
    "dusk",
    WINDOW,
    [hourly("2025-03-20T05:00:00+08:00", {
      cloud: 72,
      cloudHigh: 1,
      cloudMid: 23,
      cloudLow: 99,
      aerosolOpticalDepth: 0.95,
    })],
    FETCHED_AT,
    FETCHED_AT,
  );
  assert.ok(twilight.score !== null && twilight.score < 60);
  assert.match(twilight.summary, /低云遮挡明显/);
  assert.match(twilight.summary, /气溶胶偏高/);
});

Deno.test("火烧云可能性受总云量上限约束", () => {
  const heavy = scoreFireCloud(
    "dusk",
    WINDOW,
    [hourly("2025-03-20T05:00:00+08:00", {
      cloud: 78,
      humidity: 60,
      visibility: 20_000,
      precipitationProbability: 0,
      precipitation: 0,
      windSpeed: 2,
    })],
    FETCHED_AT,
    FETCHED_AT,
  );
  assert.ok(heavy.score !== null && heavy.score >= 70);
  assert.equal(heavy.outlook.possibility, "MEDIUM");
  assert.equal(heavy.outlook.possibilityLabel, "中等");
});

Deno.test("火烧云评分在无云、缺能见度或无窗口数据时降级", () => {
  const clear = scoreFireCloud(
    "dawn",
    WINDOW,
    [hourly("2025-03-20T05:00:00+08:00", {
      cloud: 0,
      humidity: 60,
      visibility: 20_000,
      precipitationProbability: 0,
      precipitation: 0,
      windSpeed: 2,
    })],
    FETCHED_AT,
    FETCHED_AT,
  );
  assert.ok(clear.score !== null && clear.score < 45);
  assert.equal(clear.outlook.possibility, "LOW");
  assert.ok(
    clear.outlook.vividness !== null && clear.outlook.vividness < 35,
  );
  assert.match(clear.outlook.cloudNote, /缺少可被低角度阳光染色/);

  const complete = scoreFireCloud(
    "dusk",
    WINDOW,
    [hourly("2025-03-20T05:00:00+08:00", {
      cloud: 50,
      visibility: 20_000,
    })],
    FETCHED_AT,
    FETCHED_AT,
  );
  const noVisibility = scoreFireCloud(
    "dusk",
    WINDOW,
    [hourly("2025-03-20T05:00:00+08:00", {
      cloud: 50,
      visibility: null,
    })],
    FETCHED_AT,
    FETCHED_AT,
  );
  assert.ok(noVisibility.missingFields.includes("visibility"));
  assert.ok(noVisibility.confidence < complete.confidence);

  const noData = scoreFireCloud(
    "dusk",
    WINDOW,
    [hourly("2025-03-20T10:00:00+08:00")],
    FETCHED_AT,
    FETCHED_AT,
  );
  assert.equal(noData.score, null);
  assert.equal(noData.scoreMode, "UNAVAILABLE");
  assert.equal(noData.outlook.possibility, null);
  assert.equal(noData.outlook.vividness, null);
});
