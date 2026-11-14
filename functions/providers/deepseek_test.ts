import type { PhotographyPlan, TimelineItem } from "../shared/contracts.ts";
import { enhancePlans, type EnhancePlansInput } from "./deepseek.ts";
import {
  assert,
  assertEquals,
  jsonResponse,
  withEnv,
  withFetchStub,
} from "./test_utils.ts";

function fixture(): EnhancePlansInput {
  const plan: PhotographyPlan = {
    slotId: "sunrise-1",
    theme: "LANDSCAPE",
    title: "日出拍摄",
    timeWindow: {
      start: "2026-01-02T06:30:00+08:00",
      end: "2026-01-02T07:30:00+08:00",
    },
    locationNote: "外滩观景台",
    viewpoint: "原始机位",
    direction: "东",
    cameraAngle: "原始角度",
    composition: "原始构图",
    cameraSettings: "f/8, ISO 100",
    lightAnalysis: "原始光线",
    risks: ["江边风大"],
    aiEnhanced: false,
  };
  const timeline: TimelineItem = {
    slotId: "sunrise-1",
    start: "2026-01-02T06:30:00+08:00",
    end: "2026-01-02T07:30:00+08:00",
    kind: "SUNRISE",
    label: "日出",
    score: 80,
    scoreMode: "FULL",
    solar: { elevation: 0, azimuth: 115 },
    weather: {
      condition: "晴",
      cloud: 10,
      precipitationProbability: 0,
      windSpeed: 8,
      visibility: 20,
    },
    isPast: false,
    reasons: ["云量较低"],
    risks: [],
  };
  return {
    theme: "LANDSCAPE",
    location: {
      name: "上海市黄浦区",
      latitude: 31.2304,
      longitude: 121.4737,
      precision: "DISTRICT",
      timezone: "Asia/Shanghai",
    },
    plans: [plan],
    timeline: [timeline],
  };
}

function aiResponse(plans: unknown): Response {
  return jsonResponse({
    choices: [{
      message: { role: "assistant", content: JSON.stringify({ plans }) },
    }],
  });
}

const ENV = { DEEPSEEK_API_KEY: "test-deepseek-key", DEEPSEEK_MODEL: null };

Deno.test("deepseek: disabled without a key and does not fetch", async () => {
  await withEnv({ DEEPSEEK_API_KEY: null }, async () => {
    await withFetchStub(() => jsonResponse({}), async (calls) => {
      const input = fixture();
      const result = await enhancePlans(input);
      assertEquals(result.status, "DISABLED");
      assert(result.plans === input.plans);
      assertEquals(calls.length, 0);
    });
  });
});

Deno.test("deepseek: sends compact factual JSON and enhances only approved prose", async () => {
  await withEnv(ENV, async () => {
    await withFetchStub((call) => {
      const url = new URL(call.url);
      assertEquals(url.origin, "https://api.deepseek.com");
      assertEquals(url.pathname, "/chat/completions");
      assertEquals(call.init?.method, "POST");
      assertEquals(
        new Headers(call.init?.headers).get("authorization"),
        "Bearer test-deepseek-key",
      );
      const body = JSON.parse(String(call.init?.body));
      assertEquals(body.model, "deepseek-chat");
      assertEquals(body.response_format, { type: "json_object" });
      const expectedCompactInput = JSON.stringify({
        theme: "LANDSCAPE",
        location: fixture().location,
        plans: fixture().plans,
        timeline: fixture().timeline,
      });
      assertEquals(body.messages[1].content, expectedCompactInput);
      return aiResponse([{
        slotId: "sunrise-1",
        composition: "利用岸线引导视线",
        viewpoint: "在原有观景台稍向东移动",
        cameraAngle: "低机位保留前景",
        lightAnalysis: "依据输入的低云量保留日出暖光描述",
      }]);
    }, async (calls) => {
      const input = fixture();
      const result = await enhancePlans(input);
      assertEquals(result.status, "SUCCESS");
      assertEquals(result.plans[0].composition, "利用岸线引导视线");
      assertEquals(result.plans[0].viewpoint, "在原有观景台稍向东移动");
      assertEquals(result.plans[0].direction, "东");
      assertEquals(result.plans[0].timeWindow, input.plans[0].timeWindow);
      assertEquals(result.plans[0].cameraSettings, "f/8, ISO 100");
      assertEquals(result.plans[0].locationNote, "外滩观景台");
      assertEquals(result.plans[0].risks, ["江边风大"]);
      assertEquals(result.plans[0].aiEnhanced, true);
      assertEquals(calls.length, 1);
    });
  });
});

Deno.test("deepseek: falls back when AI attempts to alter protected facts", async () => {
  await withEnv(ENV, async () => {
    await withFetchStub(() =>
      aiResponse([{
        slotId: "sunrise-1",
        composition: "修改构图",
        viewpoint: "修改机位",
        cameraAngle: "修改角度",
        lightAnalysis: "声称天气改为暴雨",
        direction: "西",
        timeWindow: {
          start: "2026-01-02T12:00:00+08:00",
          end: "2026-01-02T13:00:00+08:00",
        },
        cameraSettings: "f/1.4",
        score: 1,
      }]), async () => {
      const input = fixture();
      const original = JSON.stringify(input.plans);
      const result = await enhancePlans(input);
      assertEquals(result.status, "INVALID_RESPONSE");
      assert(result.plans === input.plans);
      assertEquals(JSON.stringify(result.plans), original);
      assertEquals(result.plans[0].aiEnhanced, false);
    });
  });
});

Deno.test("deepseek: rejects unknown slots and malformed model JSON", async () => {
  await withEnv(ENV, async () => {
    await withFetchStub(() =>
      aiResponse([{
        slotId: "invented-slot",
        composition: "构图",
        viewpoint: "机位",
        cameraAngle: "角度",
        lightAnalysis: "光线",
      }]), async () => {
      const input = fixture();
      const result = await enhancePlans(input);
      assertEquals(result.status, "INVALID_RESPONSE");
      assert(result.plans === input.plans);
    });
    await withFetchStub(
      () => jsonResponse({ choices: [{ message: { content: "not-json" } }] }),
      async () => {
        const input = fixture();
        const result = await enhancePlans(input);
        assertEquals(result.status, "INVALID_RESPONSE");
        assert(result.plans === input.plans);
      },
    );
    await withFetchStub(() => new Response("broken-upstream"), async () => {
      const input = fixture();
      const result = await enhancePlans(input);
      assertEquals(result.status, "INVALID_RESPONSE");
      assert(result.plans === input.plans);
    });
  });
});

Deno.test("deepseek: service failure is UNAVAILABLE and POST is not retried", async () => {
  await withEnv(ENV, async () => {
    await withFetchStub(
      () => jsonResponse({ error: "private detail" }, 503),
      async (calls) => {
        const input = fixture();
        const result = await enhancePlans(input);
        assertEquals(result.status, "UNAVAILABLE");
        assert(result.plans === input.plans);
        assertEquals(calls.length, 1);
      },
    );
  });
});
