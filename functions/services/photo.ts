import { PHOTO_SUBJECT_LABELS } from "../shared/contracts.ts";
import type {
  PhotoAnalysisRequest,
  PhotoAnalysisResponse,
  PhotoExif,
  PhotoScene,
  PhotoSignals,
  PhotoStats,
} from "../shared/contracts.ts";
import { secretValue } from "../shared/env.ts";
import {
  classifyPhotoScene,
  summarizePhotoAnalysis,
} from "../providers/deepseek.ts";
import type { DatabaseClient } from "./cache.ts";
import { claimAiUsage } from "./usage.ts";

function shanghaiDate(now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${value.year}-${value.month}-${value.day}`;
}

function dailyLimit() {
  const configured = Number(Deno.env.get("AI_DAILY_LIMIT") ?? "120");
  return Number.isInteger(configured) && configured >= 1 && configured <= 200
    ? configured
    : 40;
}

function shutterText(seconds: number) {
  return seconds >= 1
    ? `${Number(seconds.toFixed(1))}s`
    : `1/${Math.round(1 / seconds)}s`;
}

function addUnique(list: string[], value: string) {
  if (!list.includes(value)) list.push(value);
}

function statIssues(
  stats: PhotoStats,
  issues: string[],
  suggestions: string[],
) {
  if (stats.brightness < 35) {
    addUnique(issues, `整体偏暗（亮度 ${Math.round(stats.brightness)}/100）`);
    addUnique(
      suggestions,
      "适当增加曝光，后期提亮暗部时关注噪点与色彩断层",
    );
  }
  if (stats.brightness > 75) {
    addUnique(issues, `整体偏亮（亮度 ${Math.round(stats.brightness)}/100）`);
    addUnique(suggestions, "适当降低曝光，避免高光区域失去层次");
  }
  if (stats.shadowsClipped > 8) {
    addUnique(
      issues,
      `暗部死黑约 ${stats.shadowsClipped.toFixed(1)}%`,
    );
    addUnique(suggestions, "控制对比或提亮暗部，保留阴影细节");
  }
  if (stats.highlightsClipped > 5) {
    addUnique(
      issues,
      `高光溢出约 ${stats.highlightsClipped.toFixed(1)}%`,
    );
    addUnique(suggestions, "降低高光或减少曝光补偿，避免高光失去细节");
  }
  if (stats.contrast < 20) {
    addUnique(issues, `画面对比偏低（${Math.round(stats.contrast)}/100）`);
    addUnique(suggestions, "适度增加对比或局部对比，让层次更清楚");
  }
  if (stats.contrast > 80) {
    addUnique(issues, `画面对比偏高（${Math.round(stats.contrast)}/100）`);
    addUnique(suggestions, "柔化高光或降低对比，避免明暗过渡过硬");
  }
  if (stats.saturation < 15) {
    addUnique(issues, "色彩饱和度偏低");
    addUnique(suggestions, "根据拍摄意图适度提升饱和度或局部色彩");
  }
  if (stats.saturation > 85) {
    addUnique(issues, "色彩饱和度偏高");
    addUnique(suggestions, "适度降低饱和度，避免颜色溢出或失真");
  }
  if (stats.sharpness < 35) {
    addUnique(issues, "相对清晰度指标偏低");
    addUnique(
      suggestions,
      "检查对焦、快门速度与防抖；必要时提高快门或使用三脚架",
    );
  }
}

function sceneRules(
  scene: PhotoScene,
  exif: PhotoExif | null,
  stats: PhotoStats,
  issues: string[],
  suggestions: string[],
  strengths: string[],
) {
  const aperture = exif?.fNumber ?? null;
  const focal = exif?.focalLength35 ?? exif?.focalLength ?? null;
  const iso = exif?.iso ?? null;
  const exposure = exif?.exposureTime ?? null;

  if (scene.subject === "PORTRAIT") {
    if (aperture !== null && aperture >= 8) {
      addUnique(
        issues,
        `人像常用 f/1.8–f/4 控制背景，当前 f/${aperture} 景深偏深`,
      );
      addUnique(
        suggestions,
        "需要突出人物时开大光圈或拉长焦距，并确认对焦点落在眼睛",
      );
    } else if (aperture !== null && aperture <= 2.8) {
      strengths.push(`f/${aperture} 有利于人像虚化背景`);
    }
    if (focal !== null && focal < 35) {
      addUnique(issues, `等效 ${Math.round(focal)}mm 广角可能带来面部透视变形`);
      addUnique(suggestions, "后退拍摄或改用 50mm 以上焦段");
    }
    if (iso !== null && iso >= 3200) {
      addUnique(issues, `人像 ISO ${iso} 偏高，可能影响肤色与暗部纯净度`);
      addUnique(suggestions, "优先补光或开大光圈，把 ISO 控制在 3200 以内");
    }
    if (exposure !== null && focal !== null) {
      const safeShutter = 1 / (2 * Math.max(1, focal));
      if (exposure > safeShutter) {
        addUnique(
          issues,
          `人像手持快门 ${shutterText(exposure)} 偏慢，建议不慢于 ${
            shutterText(safeShutter)
          }`,
        );
        addUnique(suggestions, "提高快门或开启防抖，抓拍人物表情时尤其重要");
      }
    }
    if (stats.highlightsClipped > 3) {
      addUnique(issues, "高光溢出可能丢失面部或背景亮部细节");
      addUnique(suggestions, "适当降低曝光补偿，优先保住面部与背景高光");
    }
    return;
  }

  if (scene.subject === "LANDSCAPE") {
    if (aperture !== null && aperture < 5.6) {
      addUnique(
        issues,
        `风光通常使用 f/8–f/11，当前 f/${aperture} 景深可能不足`,
      );
      addUnique(suggestions, "收缩光圈到 f/8–f/11，并确认前景与远景都在景深内");
    }
    if (iso !== null && iso > 800) {
      addUnique(issues, `风光 ISO ${iso} 偏高，会削弱远景细节`);
      addUnique(suggestions, "使用三脚架降低 ISO，保留天空与远景的细节");
    }
    if (stats.highlightsClipped > 3) {
      addUnique(issues, "天空或高光区域溢出，云层层次可能丢失");
      addUnique(suggestions, "尝试包围曝光或渐变镜，保留天空高光");
    }
    if (stats.sharpness < 40) {
      addUnique(issues, "远景清晰度偏低，可能受对焦、风或空气通透度影响");
      addUnique(
        suggestions,
        "使用三脚架、收缩光圈并提高快门，减少风带来的模糊",
      );
    }
    if (focal !== null && focal <= 20) {
      addUnique(issues, "超广角边缘拉伸明显，主体靠近画面边缘时容易变形");
      addUnique(suggestions, "把主要元素放在画面中央，或改用 24–35mm 焦段");
    }
    return;
  }

  if (scene.subject === "NIGHT") {
    if (iso !== null && iso >= 3200) {
      addUnique(issues, `夜景 ISO ${iso} 偏高，暗部噪点会明显增加`);
      addUnique(
        suggestions,
        "需要干净画面时使用三脚架，尝试 1–4s 长曝光并降低 ISO",
      );
    }
    if (exposure !== null && exposure >= 1) {
      addUnique(suggestions, "长曝光务必使用稳定支撑与快门线，避免画面抖动");
    }
    if (stats.highlightsClipped > 2) {
      addUnique(issues, "灯光高光溢出，光源周围可能丢失层次");
      addUnique(suggestions, "降低曝光或使用包围曝光，保留灯光边缘细节");
    }
    if (stats.shadowsClipped > 10) {
      addUnique(suggestions, "弱光下适度提亮暗部，但注意控制噪点与色彩断层");
    }
    return;
  }

  if (scene.subject === "URBAN") {
    if (aperture !== null && aperture < 5.6) {
      addUnique(
        issues,
        `城市与建筑细节常用 f/8–f/11，当前 f/${aperture} 景深偏浅`,
      );
      addUnique(suggestions, "收缩光圈，让立面与远景线条同时清晰");
    }
    if (focal !== null && focal <= 24) {
      addUnique(issues, "广角镜头边缘可能出现透视变形与拉伸");
      addUnique(suggestions, "保持机位水平，把主要立面放在画面中央");
    }
    if (stats.sharpness < 45) {
      addUnique(issues, "建筑线条清晰度不足，可能受对焦或快门影响");
      addUnique(suggestions, "对焦在主要立面，并提高快门或使用三脚架");
    }
    if (stats.highlightsClipped > 4) {
      addUnique(issues, "玻璃幕墙或灯光高光溢出");
      addUnique(suggestions, "降低曝光或使用包围曝光，保留高光层次");
    }
    return;
  }

  if (scene.subject === "MACRO") {
    if (aperture !== null && aperture <= 2.8) {
      addUnique(issues, `特写光圈 f/${aperture} 景深极浅，容易失焦`);
      addUnique(suggestions, "收缩到 f/5.6–f/11，或使用景深合成保留细节");
    }
    if (iso !== null && iso >= 1600) {
      addUnique(issues, `特写 ISO ${iso} 偏高，细节纹理可能被噪点覆盖`);
      addUnique(suggestions, "补光或使用三脚架降低 ISO，保留纹理细节");
    }
    if (exposure !== null && focal !== null) {
      const safeShutter = 1 / (2 * Math.max(1, focal));
      if (exposure > safeShutter) {
        addUnique(
          issues,
          `近摄快门 ${shutterText(exposure)} 偏慢，抖动会被放大`,
        );
        addUnique(suggestions, "提高快门或使用三脚架、闪光灯，避免近摄抖动");
      }
    }
    if (stats.sharpness < 45) {
      addUnique(issues, "特写清晰度不足，对焦点可能偏离主体");
      addUnique(suggestions, "放大对焦并确认焦平面，必要时手动对焦");
    }
  }
}

function guardScene(
  scene: PhotoScene,
  signals: PhotoSignals,
  exif: PhotoExif | null,
): PhotoScene {
  if (
    scene.subject !== "GENERAL" &&
    (signals.screenLike ?? 0) >= 60 &&
    signals.skin < 6 &&
    signals.green < 10
  ) {
    return {
      subject: "GENERAL",
      label: PHOTO_SUBJECT_LABELS.GENERAL,
      confidence: "LOW",
      basis: [
        "画面疑似截图、文档或纯色界面",
        "题材判断仅供参考，可按实际拍摄题材修改",
      ],
      source: scene.source,
    };
  }
  if (scene.subject === "GENERAL" && scene.confidence !== "LOW") {
    return { ...scene, confidence: "LOW" };
  }
  if (scene.subject === "LANDSCAPE" && scene.confidence === "HIGH") {
    const focal = exif?.focalLength35 ?? exif?.focalLength ?? null;
    const aperture = exif?.fNumber ?? null;
    const supported = signals.green >= 8 ||
      (focal !== null && focal <= 35) ||
      (aperture !== null && aperture >= 5.6);
    if (!supported) {
      return {
        ...scene,
        confidence: "MEDIUM",
        basis: [
          ...scene.basis.slice(0, 2),
          "仅有上部亮部占比，缺少植被或镜头参数佐证",
        ],
      };
    }
  }
  return scene;
}

export async function analyzePhoto(
  input: PhotoAnalysisRequest,
  db?: DatabaseClient,
  now = new Date(),
): Promise<PhotoAnalysisResponse> {
  const { exif, stats } = input;
  const localScene: PhotoScene = input.scene ?? {
    subject: "GENERAL",
    label: PHOTO_SUBJECT_LABELS.GENERAL,
    confidence: "LOW",
    basis: ["未提供画面特征，按通用技术指标评价"],
    source: "HEURISTIC",
  };
  let scene = localScene;
  let aiStatus: PhotoAnalysisResponse["aiStatus"] = "DISABLED";
  let aiClaimed = false;
  const issues: string[] = [];
  const suggestions: string[] = [];
  const strengths: string[] = [];
  const exifSummary: string[] = [];

  if (secretValue("DEEPSEEK_API_KEY")) {
    const claimed = await claimAiUsage(db, shanghaiDate(now), dailyLimit());
    if (!claimed) {
      aiStatus = "LIMIT_REACHED";
    } else {
      aiClaimed = true;
      if (input.signals && !input.manualScene) {
        const classification = await classifyPhotoScene({
          heuristic: localScene,
          signals: input.signals,
          stats,
          exif,
        });
        if (classification.status === "SUCCESS" && classification.scene) {
          const keepLocal = localScene.confidence === "HIGH" &&
            classification.scene.confidence === "LOW";
          if (!keepLocal) {
            scene = guardScene(classification.scene, input.signals, exif);
          }
        }
      }
    }
  }

  if (exif) {
    const camera = [exif.make, exif.model].filter(Boolean).join(" ");
    if (camera) exifSummary.push(camera);
    if (exif.lens) exifSummary.push(`镜头 ${exif.lens}`);
    if (exif.focalLength !== null || exif.focalLength35 !== null) {
      exifSummary.push(
        `焦距 ${exif.focalLength ?? exif.focalLength35}mm${
          exif.focalLength35 !== null && exif.focalLength !== null
            ? `（等效 ${exif.focalLength35}mm）`
            : ""
        }`,
      );
    }
    if (exif.fNumber !== null) exifSummary.push(`光圈 f/${exif.fNumber}`);
    if (exif.exposureTime !== null) {
      exifSummary.push(`快门 ${shutterText(exif.exposureTime)}`);
    }
    if (exif.iso !== null) exifSummary.push(`ISO ${exif.iso}`);
    if (exif.exposureBias !== null) {
      exifSummary.push(
        `曝光补偿 ${exif.exposureBias > 0 ? "+" : ""}${exif.exposureBias} EV`,
      );
    }
    if (exif.dateTimeOriginal) {
      exifSummary.push(`拍摄时间 ${exif.dateTimeOriginal}`);
    }
    if (exif.hasGps) exifSummary.push("含 GPS 信息（未上传）");

    if (exif.iso !== null) {
      if (exif.iso <= 400) {
        strengths.push(`低 ISO ${exif.iso} 有利于降低噪点`);
      }
      if (exif.iso >= 1600) {
        addUnique(issues, `ISO 偏高（${exif.iso}）`);
        addUnique(
          suggestions,
          "光线允许时降低 ISO，或使用三脚架、堆栈等方式控制噪点",
        );
      }
    }
    if (exif.exposureTime !== null) {
      const reference = exif.focalLength35 ?? exif.focalLength ?? 50;
      const safeShutter = 1 / Math.max(1, reference);
      if (exif.exposureTime > safeShutter) {
        addUnique(
          issues,
          `快门 ${shutterText(exif.exposureTime)} 相对焦距偏慢，手持可能抖动`,
        );
        addUnique(
          suggestions,
          "提高快门、开启防抖或使用三脚架，尤其在长焦拍摄时",
        );
      } else if (exif.exposureTime <= 1 / 500) {
        strengths.push("快门速度充足，有利于凝固动态");
      }
    }
    if (exif.fNumber !== null) {
      const shallowByDesign = scene.subject === "PORTRAIT" ||
        scene.subject === "NIGHT" || scene.subject === "MACRO";
      if (exif.fNumber <= 2 && !shallowByDesign) {
        addUnique(issues, `大光圈 f/${exif.fNumber} 景深较浅`);
        addUnique(
          suggestions,
          "确认对焦点位置，必要时收缩到 f/2.8–f/4 增加容错",
        );
      } else if (exif.fNumber >= 16) {
        addUnique(issues, `小光圈 f/${exif.fNumber} 可能出现衍射`);
        addUnique(suggestions, "考虑 f/8–f/11，或使用景深合成");
      } else if (
        exif.fNumber >= 4 && exif.fNumber <= 11 &&
        (scene.subject !== "PORTRAIT" || exif.fNumber <= 4)
      ) {
        strengths.push(`光圈 f/${exif.fNumber} 处于较稳妥范围`);
      }
    }
    if (exif.focalLength !== null && exif.focalLength >= 200) {
      addUnique(issues, `长焦 ${exif.focalLength}mm 对稳定性要求高`);
      addUnique(suggestions, "使用三脚架或更高快门，避免轻微抖动");
    }
    if (exif.exposureBias !== null && Math.abs(exif.exposureBias) >= 1) {
      addUnique(issues, `曝光补偿 ${exif.exposureBias} EV 较大`);
      addUnique(
        suggestions,
        exif.exposureBias > 0 && stats.highlightsClipped > 3
          ? "降低曝光补偿并检查高光细节"
          : exif.exposureBias < 0 && stats.shadowsClipped > 8
          ? "提高曝光补偿并检查暗部细节"
          : "确认曝光补偿是否符合本次拍摄意图",
      );
    }
    if (exif.flash === true) {
      addUnique(issues, "使用了闪光灯，可能产生硬光或阴影");
      addUnique(suggestions, "尝试跳闪、柔光罩或拉开主体与背景距离");
    }
  } else {
    exifSummary.push("未检测到 EXIF 元数据");
    addUnique(issues, "缺少 EXIF，无法核对焦距、快门与 ISO");
    addUnique(suggestions, "导出照片时保留 EXIF，分析会更具体");
  }

  sceneRules(scene, exif, stats, issues, suggestions, strengths);
  statIssues(stats, issues, suggestions);

  if (stats.sharpness >= 65) {
    strengths.push("相对清晰度指标较好");
  }
  if (
    stats.brightness >= 40 && stats.brightness <= 65 &&
    stats.contrast >= 25 && stats.contrast <= 70 &&
    stats.shadowsClipped <= 5 && stats.highlightsClipped <= 3
  ) {
    strengths.push("曝光与动态范围基础较均衡");
  }
  if (issues.length === 0) {
    strengths.push("未发现明显的技术参数异常");
  }
  if (suggestions.length === 0) {
    suggestions.push("继续使用当前参数，并结合拍摄意图做小幅调整");
  }

  const sceneNote = scene.subject === "GENERAL"
    ? "题材未明确，按通用技术指标评价"
    : scene.confidence === "HIGH"
    ? `按「${scene.label}」题材评价`
    : `按可能为「${scene.label}」的题材评价`;
  const baseSummary = exif
    ? `${sceneNote}，结合 EXIF 与画面统计生成 ${issues.length} 项问题和 ${suggestions.length} 条建议；题材来自像素统计，不识别具体人物或物体。`
    : `未检测到 EXIF，${sceneNote}，仅基于画面统计；题材来自像素统计，不识别具体人物或物体。`;
  let summary = baseSummary;

  if (aiClaimed) {
    const ai = await summarizePhotoAnalysis({
      exifSummary,
      issues,
      suggestions,
      stats: {
        brightness: stats.brightness,
        contrast: stats.contrast,
        shadowsClipped: stats.shadowsClipped,
        highlightsClipped: stats.highlightsClipped,
        saturation: stats.saturation,
        sharpness: stats.sharpness,
      },
      scene: {
        label: scene.label,
        confidence: scene.confidence,
        basis: scene.basis,
      },
    });
    aiStatus = ai.status;
    if (ai.status === "SUCCESS" && ai.summary) summary = ai.summary;
  }

  return {
    generatedAt: now.toISOString(),
    summary,
    strengths: strengths.slice(0, 6),
    issues: issues.slice(0, 8),
    suggestions: suggestions.slice(0, 8),
    exifSummary,
    scene,
    confidenceLevel: exif ? "MEDIUM" : "LOW",
    aiStatus,
    disclaimer:
      "原始图像保留在浏览器本地；题材与画质指标由像素统计推断，建议按推断题材给出，清晰度为相对指标。",
  };
}
