import type { PhotoExif } from "@/functions/shared/contracts";

type TagValue = string | number | boolean | number[] | null;
type Tags = Map<number, TagValue>;

const TYPE_SIZES: Record<number, number> = {
  1: 1,
  2: 1,
  3: 2,
  4: 4,
  5: 8,
  7: 1,
  9: 4,
  10: 8,
};

function readAscii(
  bytes: Uint8Array,
  offset: number,
  count: number,
): string {
  let value = "";
  for (let index = 0; index < count; index++) {
    const code = bytes[offset + index];
    if (code === undefined || code === 0) break;
    value += String.fromCharCode(code);
  }
  return value.trim();
}

function readValue(
  view: DataView,
  bytes: Uint8Array,
  type: number,
  count: number,
  offset: number,
  little: boolean,
): TagValue {
  if (count > 4096) return null;
  if (type === 2) return readAscii(bytes, offset, count);
  const values: number[] = [];
  const limit = Math.min(count, 8);
  for (let index = 0; index < limit; index++) {
    const at = offset + index * (TYPE_SIZES[type] ?? 0);
    if (at < 0 || at + (TYPE_SIZES[type] ?? 0) > view.byteLength) return null;
    switch (type) {
      case 1:
      case 7:
        values.push(bytes[at]);
        break;
      case 3:
        values.push(view.getUint16(at, little));
        break;
      case 4:
        values.push(view.getUint32(at, little));
        break;
      case 9:
        values.push(view.getInt32(at, little));
        break;
      case 5: {
        const denominator = view.getUint32(at + 4, little);
        values.push(denominator === 0 ? 0 : view.getUint32(at, little) / denominator);
        break;
      }
      case 10: {
        const denominator = view.getInt32(at + 4, little);
        values.push(denominator === 0 ? 0 : view.getInt32(at, little) / denominator);
        break;
      }
      default:
        return null;
    }
  }
  if (values.length === 0) return null;
  return values.length === 1 ? values[0] : values;
}

function readIfd(
  view: DataView,
  bytes: Uint8Array,
  base: number,
  ifdOffset: number,
  little: boolean,
  tags: Tags,
  depth = 0,
): void {
  if (depth > 3 || ifdOffset < 0 || ifdOffset + 2 > view.byteLength - base) {
    return;
  }
  const start = base + ifdOffset;
  const count = view.getUint16(start, little);
  if (count > 512) return;
  for (let index = 0; index < count; index++) {
    const entry = start + 2 + index * 12;
    if (entry + 12 > view.byteLength) return;
    const tag = view.getUint16(entry, little);
    const type = view.getUint16(entry + 2, little);
    const length = view.getUint32(entry + 4, little);
    const size = TYPE_SIZES[type];
    if (!size) continue;
    const total = size * length;
    if (!Number.isFinite(total) || total < 0) continue;
    const valueOffset = total <= 4
      ? entry + 8
      : base + view.getUint32(entry + 8, little);
    if (valueOffset < 0 || valueOffset + total > view.byteLength) continue;
    const value = readValue(view, bytes, type, length, valueOffset, little);
    if (value !== null) tags.set(tag, value);
    if (tag === 0x8769 && typeof value === "number") {
      readIfd(view, bytes, base, value, little, tags, depth + 1);
    }
    if (tag === 0x8825 && typeof value === "number") {
      readIfd(view, bytes, base, value, little, tags, depth + 1);
    }
  }
}

function textTag(tags: Tags, tag: number): string | null {
  const value = tags.get(tag);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberTag(tags: Tags, tag: number): number | null {
  const value = tags.get(tag);
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function parseJpegExif(buffer: ArrayBuffer): PhotoExif | null {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 4 || bytes[0] !== 0xFF || bytes[1] !== 0xD8) return null;
  const view = new DataView(buffer);
  let offset = 2;
  let tiffBase = -1;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xFF) return null;
    const marker = bytes[offset + 1];
    if (marker === 0xD8 || marker === 0x01 || (marker >= 0xD0 && marker <= 0xD7)) {
      offset += 2;
      continue;
    }
    if (marker === 0xDA) break;
    const length = view.getUint16(offset + 2, false);
    if (length < 2 || offset + 2 + length > bytes.length) return null;
    if (
      marker === 0xE1 && length >= 8 &&
      readAscii(bytes, offset + 4, 6) === "Exif"
    ) {
      tiffBase = offset + 10;
      break;
    }
    offset += 2 + length;
  }
  if (tiffBase < 0 || tiffBase + 8 > bytes.length) return null;
  const order = view.getUint16(tiffBase, false);
  if (order !== 0x4949 && order !== 0x4D4D) return null;
  const little = order === 0x4949;
  if (view.getUint16(tiffBase + 2, little) !== 42) return null;
  const ifdOffset = view.getUint32(tiffBase + 4, little);
  const tags: Tags = new Map();
  readIfd(view, bytes, tiffBase, ifdOffset, little, tags);
  if (tags.size === 0) return null;

  const flashValue = numberTag(tags, 0x9209);
  const whiteBalanceValue = numberTag(tags, 0xA403);
  const hasGps = tags.has(2) || tags.has(4);
  return {
    make: textTag(tags, 0x010F),
    model: textTag(tags, 0x0110),
    lens: textTag(tags, 0xA434),
    dateTimeOriginal: textTag(tags, 0x9003) ?? textTag(tags, 0x0132),
    exposureTime: numberTag(tags, 0x829A),
    fNumber: numberTag(tags, 0x829D),
    iso: numberTag(tags, 0x8827),
    focalLength: numberTag(tags, 0x920A),
    focalLength35: numberTag(tags, 0xA405),
    exposureBias: numberTag(tags, 0x9204),
    flash: flashValue === null ? null : (flashValue & 1) === 1,
    whiteBalance: whiteBalanceValue === null
      ? null
      : whiteBalanceValue === 0
      ? "自动"
      : "手动",
    orientation: numberTag(tags, 0x0112),
    hasGps,
  };
}
