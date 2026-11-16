import { strict as assert } from "node:assert";
import { computeSolar, solarPositionAt } from "./solar.ts";

function localMinutes(iso: string): number {
  const [hour, minute] = iso.slice(11, 16).split(":").map(Number);
  return hour * 60 + minute;
}

function assertNear(
  actual: number,
  expected: number,
  tolerance: number,
  message: string,
): void {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${message}: actual=${actual}, expected=${expected}`,
  );
}

const NOAA_REFERENCES = [
  {
    name: "北京",
    latitude: 39.9042,
    longitude: 116.4074,
    date: "2025-06-21",
    sunrise: 4 * 60 + 46,
    sunset: 19 * 60 + 47,
    sunriseAzimuth: [55, 65],
    sunsetAzimuth: [295, 305],
  },
  {
    name: "上海",
    latitude: 31.2304,
    longitude: 121.4737,
    date: "2025-03-20",
    sunrise: 5 * 60 + 57,
    sunset: 18 * 60 + 4,
    sunriseAzimuth: [85, 95],
    sunsetAzimuth: [265, 275],
  },
  {
    name: "广州",
    latitude: 23.1291,
    longitude: 113.2644,
    date: "2025-12-21",
    sunrise: 7 * 60 + 4,
    sunset: 17 * 60 + 46,
    sunriseAzimuth: [110, 120],
    sunsetAzimuth: [240, 250],
  },
] as const;

for (const reference of NOAA_REFERENCES) {
  Deno.test(`${reference.name} ${reference.date} 与 NOAA Solar Calculator 日出日落参考值相符`, () => {
    const solar = computeSolar(
      reference.latitude,
      reference.longitude,
      reference.date,
    );
    assert.ok(solar.sunrise);
    assert.ok(solar.sunset);
    assertNear(localMinutes(solar.sunrise!), reference.sunrise, 5, "日出");
    assertNear(localMinutes(solar.sunset!), reference.sunset, 5, "日落");
    assert.ok(solar.sunrise!.endsWith("+08:00"));
    assert.ok(solar.sunset!.endsWith("+08:00"));
    assert.equal(solar.algorithm, "NOAA_SOLAR_POSITION");

    const sunrisePosition = solarPositionAt(
      reference.latitude,
      reference.longitude,
      new Date(solar.sunrise!),
    );
    const sunsetPosition = solarPositionAt(
      reference.latitude,
      reference.longitude,
      new Date(solar.sunset!),
    );
    assertNear(sunrisePosition.elevation, -0.833, 0.02, "日出高度角");
    assertNear(sunsetPosition.elevation, -0.833, 0.02, "日落高度角");
    assert.ok(
      sunrisePosition.azimuth >= reference.sunriseAzimuth[0] &&
        sunrisePosition.azimuth <= reference.sunriseAzimuth[1],
    );
    assert.ok(
      sunsetPosition.azimuth >= reference.sunsetAzimuth[0] &&
        sunsetPosition.azimuth <= reference.sunsetAzimuth[1],
    );
    const noonPosition = solarPositionAt(
      reference.latitude,
      reference.longitude,
      new Date(solar.solarNoon),
    );
    assertNear(noonPosition.azimuth, 180, 0.2, "正午方位");
  });
}

Deno.test("黄金和蓝调窗口按高度阈值生成且顺序衔接", () => {
  const solar = computeSolar(31.2304, 121.4737, "2025-03-20");
  assert.equal(solar.goldenHours.length, 2);
  assert.equal(solar.blueHours.length, 2);
  const windows = [
    solar.blueHours[0],
    solar.goldenHours[0],
    solar.goldenHours[1],
    solar.blueHours[1],
  ];
  for (let index = 1; index < windows.length; index++) {
    assert.ok(
      Date.parse(windows[index - 1].start) < Date.parse(windows[index - 1].end),
    );
    assert.ok(
      Date.parse(windows[index - 1].end) <= Date.parse(windows[index].start),
    );
  }
  assertNear(
    Date.parse(solar.blueHours[0].end) / 1000,
    Date.parse(solar.goldenHours[0].start) / 1000,
    2,
    "清晨蓝调与黄金窗口衔接",
  );
  assertNear(
    Date.parse(solar.goldenHours[1].end) / 1000,
    Date.parse(solar.blueHours[1].start) / 1000,
    2,
    "傍晚黄金与蓝调窗口衔接",
  );
  assert.ok(
    Date.parse(solar.goldenHours[0].start) < Date.parse(solar.sunrise!),
  );
  assert.ok(Date.parse(solar.sunrise!) < Date.parse(solar.goldenHours[0].end));
  assert.ok(Date.parse(solar.goldenHours[1].start) < Date.parse(solar.sunset!));
  assert.ok(Date.parse(solar.sunset!) < Date.parse(solar.goldenHours[1].end));
});

Deno.test("正午太阳高度是当日一分钟扫描区间内的最大值附近", () => {
  const latitude = 39.9042;
  const longitude = 116.4074;
  const solar = computeSolar(latitude, longitude, "2025-06-21");
  const noonElevation =
    solarPositionAt(latitude, longitude, new Date(solar.solarNoon)).elevation;
  const before = solarPositionAt(
    latitude,
    longitude,
    new Date(Date.parse(solar.solarNoon) - 120_000),
  ).elevation;
  const after = solarPositionAt(
    latitude,
    longitude,
    new Date(Date.parse(solar.solarNoon) + 120_000),
  ).elevation;
  assert.ok(noonElevation > before && noonElevation > after);
  assertNear(noonElevation, 73.4, 0.5, "北京夏至正午高度角");
});

Deno.test("非法坐标与日期会被拒绝", () => {
  assert.throws(() => solarPositionAt(91, 120, new Date()), RangeError);
  assert.throws(() => computeSolar(31.2, 121.4, "2025-02-30"), RangeError);
});

Deno.test("太阳轨迹包含晨昏阶段、方位角与全天采样", () => {
  const solar = computeSolar(31.2304, 121.4737, "2025-03-20");
  assert.ok(solar.civilDawn && solar.civilDusk);
  assert.ok(solar.nauticalDawn && solar.nauticalDusk);
  assert.ok(solar.astronomicalDawn && solar.astronomicalDusk);
  assert.ok(
    localMinutes(solar.astronomicalDawn!) <
      localMinutes(solar.nauticalDawn!),
  );
  assert.ok(
    localMinutes(solar.nauticalDawn!) < localMinutes(solar.civilDawn!),
  );
  assert.ok(localMinutes(solar.civilDawn!) < localMinutes(solar.sunrise!));
  assert.ok(localMinutes(solar.sunset!) < localMinutes(solar.civilDusk!));
  assert.ok(solar.sunriseAzimuth !== null && solar.sunriseAzimuth > 80);
  assert.ok(solar.sunsetAzimuth !== null && solar.sunsetAzimuth > 260);
  assert.ok(solar.noonElevation !== null && solar.noonElevation > 50);
  assert.equal(solar.path.length, 145);
  assert.ok(solar.path[0].time.endsWith("T00:00:00+08:00"));
  assert.ok(solar.path[72].elevation > 0);
});
