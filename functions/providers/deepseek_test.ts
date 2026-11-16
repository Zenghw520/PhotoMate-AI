import type { PhotographyPlan, TimelineItem } from "../shared/contracts.ts";
import {
  type CustomPlansInput,
  enhancePlans,
  type EnhancePlansInput,
  generateCustomPlans,
} from "./deepseek.ts";
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

function customInput(): CustomPlansInput {
  return {
    subject: "雨后的城市街头骑行",
    theme: "STREET",
    location: {
      name: "上海市黄浦区",
      latitude: 31.2304,
      longitude: 121.4737,
    },
    date: "2026-01-02",
    weather: {
      status: "OK",
      condition: "多云",
      temperature: 12,
      cloud: 40,
      humidity: 60,
      windSpeed: 3,
      visibility: 20_000,
    },
    slots: [
      {
        slotId: "sunrise-1",
        label: "日出",
        start: "2026-01-02T06:30:00+08:00",
        end: "2026-01-02T07:30:00+08:00",
        score: 80,
        scoreMode: "FULL",
        solar: { azimuth: 115, elevation: 2 },
        weather: {
          condition: "多云",
          cloud: 40,
          precipitationProbability: 10,
          windSpeed: 3,
          visibility: 20_000,
        },
      },
      {
        slotId: "sunset-1",
        label: "日落",
        start: "2026-01-02T16:30:00+08:00",
        end: "2026-01-02T17:30:00+08:00",
        score: 72,
        scoreMode: "FULL",
        solar: { azimuth: 245, elevation: 1 },
        weather: {
          condition: "多云",
          cloud: 55,
          precipitationProbability: 20,
          windSpeed: 4,
          visibility: 18_000,
        },
      },
    ],
  };
}

function customAiResponse(
  plans: unknown[],
  summary = "优先选择光线稳定且云量适中的窗口，再结合现场环境安排机位。",
) {
  return jsonResponse({
    choices: [{
      message: {
        content: JSON.stringify({ summary, plans }),
      },
    }],
  });
}

Deno.test("deepseek: custom plans only use provided slots and facts", async () => {
  await withEnv(ENV, async () => {
    await withFetchStub((call) => {
      const url = new URL(call.url);
      assertEquals(url.pathname, "/chat/completions");
      const body = JSON.parse(String(call.init?.body));
      assertEquals(body.model, "deepseek-chat");
      assertEquals(body.response_format, { type: "json_object" });
      assertEquals(
        body.messages[1].content,
        JSON.stringify(customInput()),
      );
      return customAiResponse([
        {
          slotId: "sunrise-1",
          title: "雨后街头的清晨骑行",
          subjectApproach: "利用湿润路面反光与骑行者动势。",
          composition: "低机位保留前景反光，主体放在三分线。",
          cameraSettings: "f/4、1/250s、ISO 200 起步。",
          lightAnalysis: "日出低角度侧光，云量 40%，注意现场测光。",
          risks: ["路面湿滑"],
        },
        {
          slotId: "sunset-1",
          title: "傍晚街道骑行剪影",
          subjectApproach: "以街道延伸和骑行剪影组织画面。",
          composition: "用道路引导线指向主体。",
          cameraSettings: "f/5.6、1/500s、ISO 400 起步。",
          lightAnalysis: "太阳位于西方 245°，云量 55%。",
          risks: [],
        },
      ]);
    }, async (calls) => {
      const result = await generateCustomPlans(customInput());
      assertEquals(result.status, "SUCCESS");
      assertEquals(result.plans.length, 2);
      assertEquals(result.plans[0].slotId, "sunrise-1");
      assertEquals(result.plans[0].risks, ["路面湿滑"]);
      assertEquals(result.plans[1].slotId, "sunset-1");
      assertEquals(calls.length, 1);
    });
  });
});

Deno.test("deepseek: custom plans allow one when only one window remains", async () => {
  await withEnv(ENV, async () => {
    await withFetchStub(() =>
      customAiResponse([{
        slotId: "sunrise-1",
        title: "夜间骑行",
        subjectApproach: "利用夜间环境光。",
        composition: "低机位保留路面反光。",
        cameraSettings: "f/2.8、1/60s、ISO 1600 起步。",
        lightAnalysis: "依据输入的日出窗口与云量调整。",
        risks: ["夜间注意安全"],
      }]), async () => {
      const input = customInput();
      input.slots = [input.slots[0]];
      const result = await generateCustomPlans(input);
      assertEquals(result.status, "SUCCESS");
      assertEquals(result.plans.length, 1);
      assertEquals(result.plans[0].slotId, "sunrise-1");
    });
  });
});

Deno.test("deepseek: custom plans reject invented slots or missing key", async () => {
  await withEnv({ DEEPSEEK_API_KEY: null }, async () => {
    await withFetchStub(() => jsonResponse({}), async (calls) => {
      const result = await generateCustomPlans(customInput());
      assertEquals(result.status, "DISABLED");
      assertEquals(result.plans, []);
      assertEquals(calls.length, 0);
    });
  });

  await withEnv(ENV, async () => {
    await withFetchStub(
      () =>
        customAiResponse([
          {
            slotId: "invented-slot",
            title: "虚构",
            subjectApproach: "虚构",
            composition: "虚构",
            cameraSettings: "虚构",
            lightAnalysis: "虚构",
            risks: [],
          },
          {
            slotId: "sunset-1",
            title: "方案",
            subjectApproach: "方案",
            composition: "方案",
            cameraSettings: "方案",
            lightAnalysis: "方案",
            risks: [],
          },
        ]),
      async () => {
        const result = await generateCustomPlans(customInput());
        assertEquals(result.status, "INVALID_RESPONSE");
        assertEquals(result.plans, []);
      },
    );
  });
});
