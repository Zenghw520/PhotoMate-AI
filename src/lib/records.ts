import type {
  CameraParameters,
  PlanScheduleItem,
  SolarPosition,
  TimelineWeather,
} from "@/functions/shared/contracts";

const STORAGE_KEY = "photomate-records:v1";
const EVENT = "photomate-records-changed";
const MAX_RECORDS = 100;

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
