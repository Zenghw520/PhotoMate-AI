import type {
  PhotoExif,
  PhotoScene,
  PhotoSignals,
  PhotoStats,
} from "@/functions/shared/contracts";
import { sceneFromImageData } from "./scene";

export interface PhotoMeasurement {
  stats: PhotoStats;
  scene: PhotoScene;
  signals: PhotoSignals;
}

function statsFromImageData(
  width: number,
  height: number,
  pixels: Uint8ClampedArray,
): PhotoStats {
  const total = width * height;
  const luminance = new Float32Array(total);
  let sum = 0;
  let sumSquares = 0;
  let shadows = 0;
  let highlights = 0;
  let saturationSum = 0;
  let saturationCount = 0;
  for (let index = 0; index < total; index++) {
    const at = index * 4;
    const red = pixels[at];
    const green = pixels[at + 1];
    const blue = pixels[at + 2];
    const value = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    luminance[index] = value;
    sum += value;
    sumSquares += value * value;
    if (value < 8) shadows++;
    if (value > 250) highlights++;
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    if (max > 10) {
      saturationSum += ((max - min) / max) * 100;
      saturationCount++;
    }
  }
  const mean = sum / total;
  const variance = Math.max(0, sumSquares / total - mean * mean);
  const deviation = Math.sqrt(variance);

  let laplacianSum = 0;
  let laplacianSquares = 0;
  let laplacianCount = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const index = y * width + x;
      const laplacian = luminance[index] * 4 - luminance[index - 1] -
        luminance[index + 1] - luminance[index - width] -
        luminance[index + width];
      laplacianSum += laplacian;
      laplacianSquares += laplacian * laplacian;
      laplacianCount++;
    }
  }
  let sharpness = 0;
  if (laplacianCount > 0) {
    const lapMean = laplacianSum / laplacianCount;
    const lapVariance = Math.max(
      0,
      laplacianSquares / laplacianCount - lapMean * lapMean,
    );
    sharpness = Math.min(
      100,
      Math.round(Math.log10(1 + lapVariance) * 20),
    );
  }

  return {
    width,
    height,
    aspectRatio: Number((width / height).toFixed(2)),
    brightness: Number(((mean / 255) * 100).toFixed(1)),
    contrast: Math.min(100, Number(((deviation / 64) * 100).toFixed(1))),
    shadowsClipped: Number(((shadows / total) * 100).toFixed(1)),
    highlightsClipped: Number(((highlights / total) * 100).toFixed(1)),
    saturation: saturationCount
      ? Number((saturationSum / saturationCount).toFixed(1))
      : 0,
    sharpness,
  };
}

export function measureFromImageData(
  width: number,
  height: number,
  pixels: Uint8ClampedArray,
  exif: PhotoExif | null,
): PhotoMeasurement {
  const stats = statsFromImageData(width, height, pixels);
  const { scene, signals } = sceneFromImageData(
    width,
    height,
    pixels,
    stats,
    exif,
  );
  return { stats, scene, signals };
}

export function measureFromSource(
  source: CanvasImageSource,
  width: number,
  height: number,
  exif: PhotoExif | null,
): PhotoMeasurement {
  const scale = Math.min(1, 512 / Math.max(width, height));
  const sampleWidth = Math.max(1, Math.round(width * scale));
  const sampleHeight = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = sampleWidth;
  canvas.height = sampleHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("浏览器无法读取照片像素。");
  context.drawImage(source, 0, 0, sampleWidth, sampleHeight);
  const imageData = context.getImageData(0, 0, sampleWidth, sampleHeight);
  return measureFromImageData(
    imageData.width,
    imageData.height,
    imageData.data,
    exif,
  );
}

export async function measurePhoto(
  blob: Blob,
  exif: PhotoExif | null,
): Promise<PhotoMeasurement> {
  if (typeof createImageBitmap !== "function") {
    throw new Error("当前浏览器无法在本地解析这张照片。");
  }
  const bitmap = await createImageBitmap(blob);
  try {
    return measureFromSource(bitmap, bitmap.width, bitmap.height, exif);
  } finally {
    bitmap.close();
  }
}
