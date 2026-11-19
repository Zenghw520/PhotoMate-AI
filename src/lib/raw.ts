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

export interface RawDecodeOptions {
  signal?: AbortSignal;
  onProgress?: (percent: number) => void;
}

function abortError() {
  return new DOMException("Aborted", "AbortError");
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw abortError();
}

function readFileWithProgress(
  file: File,
  options: RawDecodeOptions,
): Promise<Uint8Array<ArrayBuffer>> {
  return new Promise((resolve, reject) => {
    throwIfAborted(options.signal);
    const reader = new FileReader();
    const cleanup = () => options.signal?.removeEventListener("abort", onAbort);
    const onAbort = () => reader.abort();
    reader.onprogress = (event) => {
      if (event.lengthComputable) {
        options.onProgress?.(
          Math.round((event.loaded / event.total) * 100),
        );
      }
    };
    reader.onload = () => {
      cleanup();
      resolve(new Uint8Array(reader.result as ArrayBuffer));
    };
    reader.onerror = () => {
      cleanup();
      reject(reader.error ?? new Error("无法读取文件。"));
    };
    reader.onabort = () => {
      cleanup();
      reject(abortError());
    };
    options.signal?.addEventListener("abort", onAbort, { once: true });
    reader.readAsArrayBuffer(file);
  });
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

export async function decodeRaw(
  file: File,
  options: RawDecodeOptions = {},
): Promise<RawDecodeResult> {
  const { signal, onProgress } = options;
  const bytes = await readFileWithProgress(file, {
    signal,
    onProgress: (percent) => onProgress?.(Math.round(percent * 0.4)),
  });
  throwIfAborted(signal);
  onProgress?.(42);
  const { default: LibRaw } = await import("libraw-wasm");
  throwIfAborted(signal);
  const raw = new LibRaw();
  let exif: PhotoExif | null = null;
  try {
    onProgress?.(48);
    await raw.open(bytes, {
      halfSize: true,
      outputBps: 8,
      useCameraWb: true,
      userQual: 3,
      noAutoBright: false,
    });
    throwIfAborted(signal);
    onProgress?.(58);
    exif = metadataExif(await raw.metadata());
    throwIfAborted(signal);
    try {
      const image = await raw.imageData();
      throwIfAborted(signal);
      if (image) {
        onProgress?.(78);
        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, 0);
        });
        throwIfAborted(signal);
        const { canvas, preview } = await imageToPreview(image);
        throwIfAborted(signal);
        onProgress?.(90);
        const measurement = measureFromSource(
          canvas,
          canvas.width,
          canvas.height,
          exif,
        );
        onProgress?.(100);
        return {
          exif,
          stats: measurement.stats,
          scene: measurement.scene,
          signals: measurement.signals,
          preview,
          source: "RAW 解码",
        };
      }
    } catch (error) {
      if (signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) {
        throw error;
      }
      // Fall back to the embedded preview below.
    }
    throwIfAborted(signal);
    try {
      onProgress?.(70);
      const thumbnail = await raw.thumbnailData();
      throwIfAborted(signal);
      if (thumbnail?.data?.length) {
        const data = new Uint8Array(thumbnail.data.byteLength);
        data.set(thumbnail.data);
        const preview = new Blob([data], {
          type: thumbnail.format === "jpeg" ? "image/jpeg" : "image/bmp",
        });
        onProgress?.(82);
        const measurement = await measurePhoto(preview, exif);
        throwIfAborted(signal);
        onProgress?.(100);
        return {
          exif,
          stats: measurement.stats,
          scene: measurement.scene,
          signals: measurement.signals,
          preview,
          source: "RAW 内嵌预览",
        };
      }
    } catch (error) {
      if (signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) {
        throw error;
      }
      // Fall back to scanning the container for a JPEG preview.
    }
  } catch (error) {
    if (signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) {
      throw error;
    }
    // Some compression variants are unavailable; try the embedded preview.
  } finally {
    raw.dispose();
  }

  throwIfAborted(signal);
  const preview = extractEmbeddedJpeg(bytes);
  if (preview) {
    onProgress?.(70);
    const measurement = await measurePhoto(preview, exif);
    throwIfAborted(signal);
    onProgress?.(100);
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
