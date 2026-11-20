import type {
  CameraParameters,
  PlanBackup,
  PlanScheduleItem,
  SlotKind,
  SolarPosition,
  TimelineWeather,
} from "@/functions/shared/contracts";

const STORAGE_KEY = "photomate-records:v1";
const EVENT = "photomate-records-changed";
const MAX_RECORDS = 100;

export interface PlanSpotSnapshot {
  id?: string;
  name: string;
  address?: string;
  latitude: number;
  longitude: number;
  source?: string;
  mapUrl?: string;
}

export interface ShootReview {
  createdAt: string;
  actualWeather: string;
  actualParams: string;
  note: string;
  /** 下次可尝试的一条调整。 */
  adjustment: string;
  analysisId?: string;
  analysisLabel?: string;
}

export interface PlanRecord {
  id: string;
  kind: "plan";
  savedAt: string;
  date: string;
  locationName: string;
  subject: string;
  title: string;
  timeWindow: { start: string; end: string };
  arrivalTime: string;
  cameraParameters: CameraParameters;
  schedule: PlanScheduleItem[];
  solar: SolarPosition;
  weather: TimelineWeather | null;
  /** 以下字段为行程导出与拍后复盘新增，旧记录可缺省。 */
  spot?: PlanSpotSnapshot;
  windowKind?: SlotKind | null;
  windowLabel?: string;
  equipment?: string;
  cameraDirection?: string;
  exposureStart?: string;
  backup?: PlanBackup | null;
  checklist?: string[];
  review?: ShootReview;
}

export interface AnalysisRecord {
  id: string;
  kind: "analysis";
  savedAt: string;
  fileName: string;
  sceneLabel: string;
  confidence: string;
  summary: string;
  issues: string[];
  suggestions: string[];
  exifSummary: string[];
  /** 拍后复盘时可关联的方案记录。 */
  planId?: string;
}

export type PhotoRecord = PlanRecord | AnalysisRecord;
export type NewPhotoRecord =
  | Omit<PlanRecord, "id" | "savedAt">
  | Omit<AnalysisRecord, "id" | "savedAt">;

function read(): PhotoRecord[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is PhotoRecord =>
      !!item && typeof item === "object" &&
      (item.kind === "plan" || item.kind === "analysis") &&
      typeof item.id === "string" && typeof item.savedAt === "string"
    );
  } catch {
    return [];
  }
}

function write(records: PhotoRecord[]) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(records.slice(0, MAX_RECORDS)),
    );
  } catch {
    // Storage may be full or disabled; the UI keeps the current session data.
  }
  window.dispatchEvent(new Event(EVENT));
}

export function readRecords() {
  return read().sort((left, right) =>
    Date.parse(right.savedAt) - Date.parse(left.savedAt)
  );
}

export function addRecord(record: NewPhotoRecord): PhotoRecord {
  const entry = {
    ...record,
    id: crypto.randomUUID(),
    savedAt: new Date().toISOString(),
  } as PhotoRecord;
  write([entry, ...read()]);
  return entry;
}

export function findRecord(id: string): PhotoRecord | null {
  return read().find((record) => record.id === id) ?? null;
}

/** 局部更新记录（旧记录缺省字段时自动补上）。 */
export function updateRecord(
  id: string,
  patch: Partial<PlanRecord> | Partial<AnalysisRecord>,
): PhotoRecord | null {
  let updated: PhotoRecord | null = null;
  const next = read().map((record) => {
    if (record.id !== id) return record;
    updated = { ...record, ...patch } as PhotoRecord;
    return updated;
  });
  if (updated) write(next);
  return updated;
}

export function deleteRecord(id: string) {
  write(read().filter((record) => record.id !== id));
}

export function clearRecords() {
  write([]);
}

export function subscribeRecords(listener: () => void) {
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
