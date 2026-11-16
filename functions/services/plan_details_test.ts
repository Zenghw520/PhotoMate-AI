import { buildCameraParameters, buildPlanSchedule } from "./plan_details.ts";
import type { TimelineItem } from "../shared/contracts.ts";
import { assert, assertEquals } from "../providers/test_utils.ts";

const SLOT: TimelineItem = {
  slotId: "night",
  start: "2026-01-02T19:00:00+08:00",
  end: "2026-01-02T21:00:00+08:00",
  kind: "NIGHT",
  label: "夜景",
  score: 70,
  scoreMode: "FULL",
  solar: { elevation: -8, azimuth: 250 },
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

Deno.test("拍摄方案生成真实到达时间与按题材参数", () => {
  const details = buildPlanSchedule("星空与银河", SLOT, "相机 + 三脚架");
  assertEquals(details.arrivalTime, "2026-01-02T10:15:00.000Z");
  assertEquals(details.schedule.length, 6);
  assert(
    Date.parse(details.schedule[0].time) < Date.parse(SLOT.start),
    "到达时间应早于窗口",
  );
  const camera = buildCameraParameters("星空与银河", SLOT, "相机 + 三脚架");
  assert(camera.iso.includes("3200"));
  assert(camera.aperture.includes("f/1.8"));
  assert(camera.focusMode.includes("三脚架"));

  const phone = buildCameraParameters("城市日落", SLOT, "手机");
  assert(phone.aperture.includes("固定"));
  assert(phone.focalLength.includes("24"));
});
