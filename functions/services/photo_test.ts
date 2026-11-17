import { analyzePhoto } from "./photo.ts";
import type { PhotoAnalysisRequest } from "../shared/contracts.ts";
import type { DatabaseClient } from "./cache.ts";
import {
  assert,
  assertEquals,
  jsonResponse,
  withEnv,
  withFetchStub,
} from "../providers/test_utils.ts";

function request(
  overrides: Partial<PhotoAnalysisRequest> = {},
): PhotoAnalysisRequest {
  return {
    fileName: "test.jpg",
    fileSize: 120_000,
    mimeType: "image/jpeg",
    exif: {
      make: "Test",
      model: "Camera",
      lens: "50mm F1.8",
      dateTimeOriginal: "2026:01:02 17:30:00",
      exposureTime: 1 / 30,
      fNumber: 1.8,
      iso: 6400,
      focalLength: 50,
      focalLength35: 50,
      exposureBias: 1.5,
      flash: false,
      whiteBalance: "自动",
      orientation: 1,
      hasGps: true,
    },
    stats: {
      width: 6000,
      height: 4000,
      aspectRatio: 1.5,
      brightness: 28,
      contrast: 85,
      shadowsClipped: 12,
      highlightsClipped: 10,
      saturation: 90,
      sharpness: 20,
    },
    scene: {
      subject: "GENERAL",
      label: "通用",
      confidence: "LOW",
      basis: ["测试未提供画面特征"],
    },
    ...overrides,
  };
}

function portraitExif(fNumber: number, focal: number, exposureTime: number) {
  return {
    make: "Test",
    model: "Camera",
    lens: "85mm F1.8",
    dateTimeOriginal: "2026:01:02 15:30:00",
    exposureTime,
    fNumber,
    iso: 400,
    focalLength: focal,
    focalLength35: focal,
    exposureBias: 0,
    flash: false,
    whiteBalance: "自动",
    orientation: 1,
    hasGps: false,
  };
}

function usageDb(): DatabaseClient {
  return {
    from(table: string) {
      assertEquals(table, "usage_counters");
      return {
        insertIfAbsent(value: { slot: number }) {
          return {
            select() {
              return Promise.resolve({
                data: [{ slot: value.slot }],
                error: null,
              });
            },
          };
        },
      };
    },
  } as unknown as DatabaseClient;
}

Deno.test("photo: rules combine EXIF and image statistics with honest limits", async () => {
  const result = await analyzePhoto(
    request(),
    undefined,
    new Date("2026-01-02T12:00:00Z"),
  );
  assertEquals(result.aiStatus, "DISABLED");
  assertEquals(result.confidenceLevel, "MEDIUM");
  assert(result.exifSummary.some((item) => item.includes("ISO 6400")));
  assert(result.exifSummary.some((item) => item.includes("含 GPS")));
  assert(result.issues.some((item) => item.includes("ISO 偏高")));
  assert(result.issues.some((item) => item.includes("快门")));
  assert(result.issues.some((item) => item.includes("大光圈")));
  assert(result.issues.some((item) => item.includes("高光溢出")));
  assert(result.issues.some((item) => item.includes("暗部死黑")));
  assert(result.suggestions.length > 0);
  assert(result.disclaimer.includes("保留在浏览器本地"));
  assert(result.disclaimer.includes("像素统计推断"));
  assert(result.summary.includes("题材未明确"));
  assertEquals(result.scene.subject, "GENERAL");
});

Deno.test("photo: missing EXIF lowers confidence and asks for metadata", async () => {
  const result = await analyzePhoto(
    request({
      exif: null,
      stats: {
        width: 1200,
        height: 1600,
        aspectRatio: 0.75,
        brightness: 55,
        contrast: 45,
        shadowsClipped: 1,
        highlightsClipped: 1,
        saturation: 40,
        sharpness: 70,
      },
    }),
  );
  assertEquals(result.confidenceLevel, "LOW");
  assertEquals(result.exifSummary, ["未检测到 EXIF 元数据"]);
  assert(result.issues.some((item) => item.includes("缺少 EXIF")));
  assert(result.suggestions.some((item) => item.includes("保留 EXIF")));
  assert(result.strengths.some((item) => item.includes("曝光")));
});

Deno.test("photo: DeepSeek only rewrites the summary and rules stay intact", async () => {
  await withEnv({ DEEPSEEK_API_KEY: "test-deepseek-key" }, async () => {
    await withFetchStub((call) => {
      const url = new URL(call.url);
      assertEquals(url.origin, "https://api.deepseek.com");
      assertEquals(url.pathname, "/chat/completions");
      const body = JSON.parse(String(call.init?.body));
      assertEquals(body.model, "deepseek-chat");
      return jsonResponse({
        choices: [{
          message: {
            content: JSON.stringify({
              summary:
                "当前参数下优先控制噪点与高光，再根据现场光线调整快门与光圈。",
            }),
          },
        }],
      });
    }, async (calls) => {
      const result = await analyzePhoto(
        request(),
        usageDb(),
        new Date("2026-01-02T12:00:00Z"),
      );
      assertEquals(result.aiStatus, "SUCCESS");
      assertEquals(
        result.summary,
        "当前参数下优先控制噪点与高光，再根据现场光线调整快门与光圈。",
      );
      assert(result.issues.some((item) => item.includes("ISO 偏高")));
      assertEquals(calls.length, 1);
    });
  });
});

Deno.test("photo: DeepSeek reviews the inferred subject before rules", async () => {
  await withEnv({ DEEPSEEK_API_KEY: "test-deepseek-key" }, async () => {
    await withFetchStub((call) => {
      const body = JSON.parse(String(call.init?.body));
      const system = String(body.messages?.[0]?.content ?? "");
      if (system.includes("题材分类器")) {
        return jsonResponse({
          choices: [{
            message: {
              content: JSON.stringify({
                subject: "MACRO",
                confidence: "MEDIUM",
                basis: ["中央清晰度为边缘的 2.4 倍", "肤色像素约 1%"],
              }),
            },
          }],
        });
      }
      return jsonResponse({
        choices: [{
          message: {
            content: JSON.stringify({
              summary: "按推断的静物/特写题材，建议收缩光圈并确认对焦点。",
            }),
          },
        }],
      });
    }, async (calls) => {
      const result = await analyzePhoto(
        request({
          exif: portraitExif(2.8, 85, 1 / 250),
          scene: {
            subject: "PORTRAIT",
            label: "人像",
            confidence: "MEDIUM",
            basis: ["肤色像素约 12%"],
          },
          signals: {
            skin: 12,
            sky: 0,
            green: 2,
            warm: 8,
            dark: 4,
            bright: 0.2,
            edgeDensity: 5,
            centerSharpness: 60,
            borderSharpness: 25,
          },
        }),
        usageDb(),
        new Date("2026-01-02T12:00:00Z"),
      );
      assertEquals(calls.length, 2);
      assertEquals(result.scene.subject, "MACRO");
      assertEquals(result.scene.source, "DEEPSEEK");
      assert(result.issues.some((item) => item.includes("特写光圈")));
      assert(result.summary.includes("静物"));
    });
  });
});

Deno.test("photo: exhausted AI quota falls back to rule summary", async () => {
  await withEnv({ DEEPSEEK_API_KEY: "test-deepseek-key" }, async () => {
    const db = {
      from() {
        return {
          insertIfAbsent() {
            return {
              select() {
                return Promise.resolve({ data: [], error: null });
              },
            };
          },
        };
      },
    } as unknown as DatabaseClient;
    const result = await analyzePhoto(
      request(),
      db,
      new Date("2026-01-02T12:00:00Z"),
    );
    assertEquals(result.aiStatus, "LIMIT_REACHED");
    assert(result.summary.includes("题材未明确"));
  });
});

Deno.test("photo: inferred portrait subject switches to subject-specific advice", async () => {
  const result = await analyzePhoto(
    request({
      exif: portraitExif(8, 85, 1 / 250),
      stats: {
        width: 4000,
        height: 6000,
        aspectRatio: 0.67,
        brightness: 55,
        contrast: 45,
        shadowsClipped: 1,
        highlightsClipped: 1,
        saturation: 40,
        sharpness: 60,
      },
      scene: {
        subject: "PORTRAIT",
        label: "人像",
        confidence: "HIGH",
        basis: ["肤色像素约 12%"],
      },
    }),
  );
  assertEquals(result.scene.label, "人像");
  assert(result.issues.some((item) => item.includes("人像常用")));
  assert(result.summary.includes("人像"));
});

Deno.test("photo: inferred night subject keeps fast lenses as a strength", async () => {
  const result = await analyzePhoto(
    request({
      exif: {
        ...portraitExif(1.8, 35, 1 / 15),
        iso: 6400,
      },
      scene: {
        subject: "NIGHT",
        label: "夜景 / 弱光",
        confidence: "HIGH",
        basis: ["暗部像素约 60%"],
      },
    }),
  );
  assertEquals(result.scene.label, "夜景 / 弱光");
  assert(!result.issues.some((item) => item.includes("大光圈")));
  assert(result.issues.some((item) => item.includes("夜景 ISO 6400")));
  assert(result.issues.some((item) => item.includes("快门")));
});
