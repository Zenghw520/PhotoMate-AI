import type {
  PhotoExif,
  PhotoScene,
  PhotoSignals,
  PhotoStats,
} from "@/functions/shared/contracts";
import type { LibRawMetadata, RawImageData } from "libraw-wasm";
import { measureFromSource, measurePhoto } from "./photo";

const RAW_EXTENSIONS = new Set([
  "3fr",
  "arw",
  "cr2",
  "cr3",
  "dng",
  "erf",
  "fff",
  "iiq",
  "kdc",
  "mef",
  "mos",
  "mrw",
  "nef",
  "nrw",
  "orf",
  "pef",
  "raf",
  "raw",
  "rw2",
  "rwl",
  "sr2",
  "srf",
  "srw",
  "x3f",
]);

export const RAW_ACCEPT = [...RAW_EXTENSIONS].map((ext) => `.${ext}`).join(",");

export interface RawDecodeResult {
  exif: PhotoExif | null;
  stats: PhotoStats;
  scene: PhotoScene;
  signals: PhotoSignals;
  preview: Blob;
  source: "RAW 解码" | "RAW 内嵌预览";
}

export function isRawFile(name: string) {
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  return RAW_EXTENSIONS.has(extension);
}

function formatTimestamp(value: Date) {
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${value.getFullYear()}:${pad(value.getMonth() + 1)}:${
    pad(value.getDate())
  } ${pad(value.getHours())}:${pad(value.getMinutes())}:${
    pad(value.getSeconds())
  }`;
}

function metadataExif(meta: LibRawMetadata | undefined): PhotoExif | null {
  if (!meta) return null;
  const lens = meta.lens;
  return {
    make: meta.camera_make || meta.normalized_make || null,
    model: meta.camera_model || meta.normalized_model || null,
    lens: lens?.Lens || lens?.makernotes?.Lens || null,
    dateTimeOriginal: meta.timestamp instanceof Date
      ? formatTimestamp(meta.timestamp)
      : null,
    exposureTime: meta.shutter > 0 ? meta.shutter : null,
    fNumber: meta.aperture > 0 ? meta.aperture : null,
    iso: meta.iso_speed > 0 ? meta.iso_speed : null,
    focalLength: meta.focal_len > 0 ? meta.focal_len : null,
    focalLength35: lens?.FocalLengthIn35mmFormat &&
        lens.FocalLengthIn35mmFormat > 0
      ? lens.FocalLengthIn35mmFormat
      : null,
    exposureBias: null,
    flash: null,
    whiteBalance: null,
    orientation: null,
    hasGps: Boolean(meta.gps_data?.gpsparsed),
  };
}

async function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return await new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("无法生成预览。")),
      "image/jpeg",
      0.9,
    );
  });
}

async function imageToPreview(
  image: RawImageData,
): Promise<{ canvas: HTMLCanvasElement; preview: Blob }> {
  const { width, height, colors, bits, data } = image;
  if (!width || !height || !data?.length) {
    throw new Error("RAW 解码结果为空。");
  }
  const channels = colors >= 3 ? colors : 1;
  const rgba = new Uint8ClampedArray(width * height * 4);
  const maximum = bits > 8 ? 65535 : 255;
  for (let index = 0; index < width * height; index++) {
    const source = index * channels;
    const red = data[source] ?? 0;
    const green = channels === 1 ? red : data[source + 1] ?? red;
    const blue = channels === 1 ? red : data[source + 2] ?? red;
    const scale = (value: number) => bits > 8 ? value / maximum * 255 : value;
    rgba[index * 4] = scale(red);
    rgba[index * 4 + 1] = scale(green);
    rgba[index * 4 + 2] = scale(blue);
    rgba[index * 4 + 3] = 255;
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("浏览器无法渲染 RAW 预览。");
  context.putImageData(new ImageData(rgba, width, height), 0, 0);
  return { canvas, preview: await canvasToBlob(canvas) };
}

function extractEmbeddedJpeg(bytes: Uint8Array): Blob | null {
  let start = -1;
  let bestStart = -1;
  let bestEnd = -1;
  for (let index = 0; index + 1 < bytes.length; index++) {
    if (bytes[index] === 0xFF && bytes[index + 1] === 0xD8) {
      start = index;
    } else if (
      bytes[index] === 0xFF && bytes[index + 1] === 0xD9 && start >= 0
    ) {
      const end = index + 2;
      if (end - start > bestEnd - bestStart) {
        bestStart = start;
        bestEnd = end;
      }
      start = -1;
    }
  }
  if (bestStart < 0 || bestEnd <= bestStart) return null;
  return new Blob([bytes.slice(bestStart, bestEnd)], { type: "image/jpeg" });
}

export async function decodeRaw(file: File): Promise<RawDecodeResult> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { default: LibRaw } = await import("libraw-wasm");
  const raw = new LibRaw();
  let exif: PhotoExif | null = null;
  try {
    await raw.open(bytes, {
      halfSize: true,
      outputBps: 8,
      useCameraWb: true,
      userQual: 3,
      noAutoBright: false,
    });
    exif = metadataExif(await raw.metadata());
    try {
      const image = await raw.imageData();
      if (image) {
        const { canvas, preview } = await imageToPreview(image);
        const measurement = measureFromSource(
          canvas,
          canvas.width,
          canvas.height,
          exif,
        );
        return {
          exif,
          stats: measurement.stats,
          scene: measurement.scene,
          signals: measurement.signals,
          preview,
          source: "RAW 解码",
        };
      }
    } catch {
      // Fall back to the embedded preview below.
    }
    try {
      const thumbnail = await raw.thumbnailData();
      if (thumbnail?.data?.length) {
        const data = new Uint8Array(thumbnail.data.byteLength);
        data.set(thumbnail.data);
        const preview = new Blob([data], {
          type: thumbnail.format === "jpeg" ? "image/jpeg" : "image/bmp",
        });
        const measurement = await measurePhoto(preview, exif);
        return {
          exif,
          stats: measurement.stats,
          scene: measurement.scene,
          signals: measurement.signals,
          preview,
          source: "RAW 内嵌预览",
        };
      }
    } catch {
      // Fall back to scanning the container for a JPEG preview.
    }
  } catch {
    // Some compression variants are unavailable; try the embedded preview.
  } finally {
    raw.dispose();
  }

  const preview = extractEmbeddedJpeg(bytes);
  if (preview) {
    const measurement = await measurePhoto(preview, exif);
    return {
      exif,
      stats: measurement.stats,
      scene: measurement.scene,
      signals: measurement.signals,
      preview,
      source: "RAW 内嵌预览",
    };
  }
  throw new Error(
    "无法解码该 RAW 文件。请改用 DNG 转换，或选择带内嵌预览的 RAW。",
  );
}
