import type {
  PhotoExif,
  PhotoScene,
  PhotoSignals,
  PhotoStats,
  PhotoSubject,
} from "@/functions/shared/contracts";
import { PHOTO_SUBJECT_LABELS } from "@/functions/shared/contracts";

function percent(value: number, total: number) {
  return total > 0 ? (value / total) * 100 : 0;
}

function sharpnessScore(sum: number, squares: number, count: number) {
  if (count === 0) return 0;
  const mean = sum / count;
  const variance = Math.max(0, squares / count - mean * mean);
  return Math.min(100, Math.log10(1 + variance) * 20);
}

function measureSignals(
  width: number,
  height: number,
  pixels: Uint8ClampedArray,
): PhotoSignals {
  const total = width * height;
  const luminance = new Float32Array(total);
  const colorBuckets = new Uint32Array(32768);
  let skin = 0;
  let green = 0;
  let warm = 0;
  let dark = 0;
  let bright = 0;
  const upperLimit = Math.max(1, Math.round(height * 0.4));
  let upperTotal = 0;
  let sky = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      const at = index * 4;
      const red = pixels[at];
      const greenChannel = pixels[at + 1];
      const blue = pixels[at + 2];
      const value = 0.299 * red + 0.587 * greenChannel + 0.114 * blue;
      luminance[index] = value;
      colorBuckets[((red >> 3) << 10) | ((greenChannel >> 3) << 5) | (blue >> 3)]++;

      if (value < 45) dark++;
      if (value > 225) bright++;
      if (
        greenChannel > red * 1.06 && greenChannel > blue * 1.06 &&
        value > 35
      ) green++;
      if (red > blue * 1.2 && red > greenChannel * 1.04 && value > 50) warm++;

      const cb = 128 - 0.168736 * red - 0.331264 * greenChannel + 0.5 * blue;
      const cr = 128 + 0.5 * red - 0.418688 * greenChannel - 0.081312 * blue;
      if (
        value > 60 && cb >= 77 && cb <= 127 && cr >= 133 && cr <= 173
      ) skin++;

      if (y < upperLimit) {
        upperTotal++;
        const max = Math.max(red, greenChannel, blue);
        const min = Math.min(red, greenChannel, blue);
        const blueSky = blue > red + 12 && blue >= greenChannel - 5 &&
          value > 90;
        const paleSky = value > 165 && max - min < 28;
        if (blueSky || paleSky) sky++;
      }
    }
  }

  let edgeCount = 0;
  let interior = 0;
  let flat = 0;
  let centerSum = 0;
  let centerSquares = 0;
  let centerCount = 0;
  let borderSum = 0;
  let borderSquares = 0;
  let borderCount = 0;
  const centerHalfWidth = width * 0.3;
  const centerHalfHeight = height * 0.3;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const index = y * width + x;
      const at = index * 4;
      const laplacian = luminance[index] * 4 - luminance[index - 1] -
        luminance[index + 1] - luminance[index - width] -
        luminance[index + width];
      interior++;
      if (Math.abs(laplacian) > 30) edgeCount++;
      const neighborDiff =
        Math.abs(pixels[at] - pixels[at - 4]) +
        Math.abs(pixels[at + 1] - pixels[at - 3]) +
        Math.abs(pixels[at + 2] - pixels[at - 2]) +
        Math.abs(pixels[at] - pixels[at - width * 4]) +
        Math.abs(pixels[at + 1] - pixels[at - width * 4 + 1]) +
        Math.abs(pixels[at + 2] - pixels[at - width * 4 + 2]);
      if (neighborDiff < 12) flat++;
      const inCenter = Math.abs(x - width / 2) <= centerHalfWidth &&
        Math.abs(y - height / 2) <= centerHalfHeight;
      if (inCenter) {
        centerSum += laplacian;
        centerSquares += laplacian * laplacian;
        centerCount++;
      } else {
        borderSum += laplacian;
        borderSquares += laplacian * laplacian;
        borderCount++;
      }
    }
  }

  let dominantCount = 0;
  for (const count of colorBuckets) {
    if (count > dominantCount) dominantCount = count;
  }

  const signals: PhotoSignals = {
    skin: percent(skin, total),
    sky: percent(sky, upperTotal),
    green: percent(green, total),
    warm: percent(warm, total),
    dark: percent(dark, total),
    bright: percent(bright, total),
    edgeDensity: percent(edgeCount, interior),
    centerSharpness: sharpnessScore(centerSum, centerSquares, centerCount),
    borderSharpness: sharpnessScore(borderSum, borderSquares, borderCount),
    flatness: percent(flat, interior),
    dominantColor: percent(dominantCount, total),
  };
  return { ...signals, screenLike: screenLikeness(signals) };
}

function screenLikeness(signals: PhotoSignals) {
  const flatness = signals.flatness ?? 0;
  const dominant = signals.dominantColor ?? 0;
  let score = 0;
  if (flatness >= 70 && dominant >= 45) score += 40;
  else if (flatness >= 55 && dominant >= 30) score += 24;
  if (signals.bright >= 25 && signals.dark < 20) score += 20;
  if (signals.edgeDensity >= 12 && flatness >= 55) score += 15;
  if (signals.dark >= 40 && signals.bright >= 3 && flatness >= 60 && dominant >= 35) {
    score += 25;
  }
  if (signals.skin < 2 && signals.green < 4) score += 5;
  if (signals.dark >= 45 && signals.bright < 18) score = Math.min(score, 25);
  return Math.min(100, score);
}

function exifHour(exif: PhotoExif | null) {
  const match = exif?.dateTimeOriginal?.match(/^\d{4}:\d{2}:\d{2}[ T](\d{2})/);
  return match ? Number(match[1]) : null;
}

function formatNumber(value: number) {
  return Number(value.toFixed(value >= 10 ? 0 : 1));
}

export function sceneFromImageData(
  width: number,
  height: number,
  pixels: Uint8ClampedArray,
  stats: PhotoStats,
  exif: PhotoExif | null,
): { scene: PhotoScene; signals: PhotoSignals } {
  const signals = measureSignals(width, height, pixels);
  const screenLike = signals.screenLike ?? 0;
  if (screenLike >= 60 && signals.skin < 6 && signals.green < 10) {
    return {
      scene: {
        subject: "GENERAL",
        label: PHOTO_SUBJECT_LABELS.GENERAL,
        confidence: "LOW",
        basis: [
          `疑似截图、文档或纯色界面（低纹理区域约 ${
            formatNumber(signals.flatness ?? 0)
          }%）`,
          `单一主色占比约 ${formatNumber(signals.dominantColor ?? 0)}%`,
        ],
        source: "HEURISTIC",
      },
      signals,
    };
  }
  const focal = exif?.focalLength35 ?? exif?.focalLength ?? null;
  const aperture = exif?.fNumber ?? null;
  const iso = exif?.iso ?? null;
  const exposureTime = exif?.exposureTime ?? null;
  const hour = exifHour(exif);
  const scores: Record<PhotoSubject, number> = {
    PORTRAIT: 0,
    LANDSCAPE: 0,
    NIGHT: 0,
    URBAN: 0,
    MACRO: 0,
    GENERAL: 30,
  };

  if (stats.brightness < 32) scores.NIGHT += 30;
  else if (stats.brightness < 45) scores.NIGHT += 15;
  if (signals.dark > 40) scores.NIGHT += 20;
  if (signals.bright > 0.8) scores.NIGHT += 12;
  if (iso !== null && iso >= 1600) scores.NIGHT += 12;
  if (exposureTime !== null && exposureTime >= 1 / 15) scores.NIGHT += 8;
  if (hour !== null && (hour >= 20 || hour <= 5)) scores.NIGHT += 10;

  if (signals.skin >= 4) scores.PORTRAIT += 18;
  if (signals.skin >= 9) scores.PORTRAIT += 22;
  if (signals.skin >= 16) scores.PORTRAIT += 12;
  if (focal !== null && focal >= 35 && focal <= 200) scores.PORTRAIT += 12;
  if (aperture !== null && aperture <= 4) scores.PORTRAIT += 10;
  if (stats.aspectRatio <= 1.15) scores.PORTRAIT += 8;
  if (
    signals.borderSharpness > 1 &&
    signals.centerSharpness > signals.borderSharpness * 1.3
  ) scores.PORTRAIT += 8;
  if (signals.sky > 30) scores.PORTRAIT -= 15;

  if (signals.sky >= 12) scores.LANDSCAPE += 22;
  if (signals.sky >= 25) scores.LANDSCAPE += 18;
  if (signals.sky >= 45) scores.LANDSCAPE += 10;
  if (signals.skin < 5) scores.LANDSCAPE += 8;
  if (focal !== null && focal <= 35) scores.LANDSCAPE += 14;
  if (aperture !== null && aperture >= 5.6) scores.LANDSCAPE += 8;
  if (signals.green > 12) scores.LANDSCAPE += 8;
  if (signals.skin > 12) scores.LANDSCAPE -= 25;

  if (signals.edgeDensity > 6) scores.URBAN += 20;
  else if (signals.edgeDensity > 3.5) scores.URBAN += 12;
  if (signals.sky < 20) scores.URBAN += 6;
  if (signals.skin < 8) scores.URBAN += 8;
  if (focal !== null && focal <= 60) scores.URBAN += 8;
  if (stats.sharpness >= 45) scores.URBAN += 8;
  if (signals.dark > 45) scores.URBAN -= 15;
  if (signals.green > 30) scores.URBAN -= 15;

  if (
    signals.borderSharpness > 1 &&
    signals.centerSharpness > signals.borderSharpness * 1.8
  ) scores.MACRO += 28;
  if (
    signals.borderSharpness > 1 &&
    signals.centerSharpness > signals.borderSharpness * 2.5
  ) scores.MACRO += 10;
  if (focal !== null && focal >= 60) scores.MACRO += 10;
  if (aperture !== null && aperture <= 5.6) scores.MACRO += 8;
  if (signals.skin < 8) scores.MACRO += 8;
  if (signals.warm > 15 || signals.green > 15) scores.MACRO += 6;

  const ranked = (Object.entries(scores) as [PhotoSubject, number][])
    .sort((left, right) => right[1] - left[1]);
  const [best, bestScore] = ranked[0];
  const margin = bestScore - ranked[1][1];
  const subject: PhotoSubject = bestScore < 42 ? "GENERAL" : best;
  const skyOnlyLandscape = subject === "LANDSCAPE" &&
    signals.green < 8 &&
    !(focal !== null && focal <= 35) &&
    !(aperture !== null && aperture >= 5.6);
  let confidence: PhotoScene["confidence"] = subject === "GENERAL"
    ? "LOW"
    : margin >= 18
    ? "HIGH"
    : margin >= 8
    ? "MEDIUM"
    : "LOW";
  if (subject === "LANDSCAPE" && skyOnlyLandscape && confidence === "HIGH") {
    confidence = "MEDIUM";
  }

  return {
    scene: {
      subject,
      label: PHOTO_SUBJECT_LABELS[subject],
      confidence,
      basis: sceneBasis(subject, signals, focal, aperture, iso),
      source: "HEURISTIC",
    },
    signals,
  };
}

function sceneBasis(
  subject: PhotoSubject,
  signals: PhotoSignals,
  focal: number | null,
  aperture: number | null,
  iso: number | null,
) {
  const basis: string[] = [];
  const sharpnessRatio = signals.borderSharpness > 1
    ? signals.centerSharpness / signals.borderSharpness
    : null;
  if (subject === "PORTRAIT") {
    basis.push(`肤色像素约 ${formatNumber(signals.skin)}%`);
    if (focal !== null) basis.push(`等效焦距约 ${Math.round(focal)}mm`);
    if (aperture !== null) basis.push(`光圈 f/${formatNumber(aperture)}`);
    if (basis.length < 3 && sharpnessRatio !== null && sharpnessRatio > 1.3) {
      basis.push(`中央清晰度约为边缘的 ${sharpnessRatio.toFixed(1)} 倍`);
    }
  } else if (subject === "LANDSCAPE") {
    basis.push(`画面上部天空或亮部约 ${formatNumber(signals.sky)}%`);
    if (signals.green > 8) {
      basis.push(`绿色植被约占 ${formatNumber(signals.green)}%`);
    }
    if (
      signals.green <= 8 && !(focal !== null && focal <= 35) &&
      !(aperture !== null && aperture >= 5.6)
    ) {
      basis.push("仅有上部亮部占比，缺少植被或镜头参数佐证");
    }
    if (focal !== null && basis.length < 3) {
      basis.push(`等效焦距约 ${Math.round(focal)}mm`);
    }
    if (basis.length < 3 && aperture !== null) {
      basis.push(`光圈 f/${formatNumber(aperture)}`);
    }
  } else if (subject === "NIGHT") {
    basis.push(`暗部像素约 ${formatNumber(signals.dark)}%`);
    if (signals.bright > 0.3) {
      basis.push(`亮部光点约 ${formatNumber(signals.bright)}%`);
    }
    if (iso !== null) basis.push(`ISO ${iso}`);
    if (basis.length < 3 && aperture !== null) {
      basis.push(`光圈 f/${formatNumber(aperture)}`);
    }
  } else if (subject === "URBAN") {
    basis.push(`边缘密度约 ${formatNumber(signals.edgeDensity)}%`);
    basis.push(`天空占比约 ${formatNumber(signals.sky)}%`);
    if (focal !== null) basis.push(`等效焦距约 ${Math.round(focal)}mm`);
  } else if (subject === "MACRO") {
    if (sharpnessRatio !== null && sharpnessRatio > 1.5) {
      basis.push(`中央清晰度约为边缘的 ${sharpnessRatio.toFixed(1)} 倍`);
    }
    if (focal !== null) basis.push(`等效焦距约 ${Math.round(focal)}mm`);
    if (aperture !== null) basis.push(`光圈 f/${formatNumber(aperture)}`);
    if (basis.length < 3) {
      basis.push(
        `暖色或绿色主体约占 ${
          formatNumber(Math.max(signals.warm, signals.green))
        }%`,
      );
    }
  } else {
    basis.push("明暗、色彩与清晰度分布未呈现明确题材特征");
  }
  return basis.slice(0, 3);
}
