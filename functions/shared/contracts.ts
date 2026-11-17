export const THEMES = [
  "PORTRAIT",
  "LANDSCAPE",
  "ARCHITECTURE",
  "STREET",
  "FOOD",
  "NIGHT",
  "TRAVEL",
] as const;

export type ThemeId = (typeof THEMES)[number];
export type LocationPrecision = "GPS" | "MANUAL" | "DISTRICT";
export type ServiceStatus = "OK" | "STALE" | "UNCONFIGURED" | "UNAVAILABLE";

export interface LocationInput {
  name: string;
  latitude: number;
  longitude: number;
  precision: LocationPrecision;
}

export interface LocationResult extends LocationInput {
  id?: string;
  region?: string;
  timezone: "Asia/Shanghai";
}

export interface TimeWindow {
  start: string;
  end: string;
}

export interface AirQuality {
  aqi: number | null;
  category: string | null;
  primaryPollutant: string | null;
}

export interface CurrentWeather {
  observedAt: string;
  temperature: number | null;
  feelsLike: number | null;
  condition: string;
  humidity: number | null;
  cloud: number | null;
  precipitation: number | null;
  windSpeed: number | null;
  windDirection: string;
  windDegree: number | null;
  visibility: number | null;
  pressure: number | null;
  airQuality: AirQuality | null;
}

export interface HourlyWeather {
  time: string;
  temperature: number | null;
  condition: string;
  humidity: number | null;
  cloud: number | null;
  precipitationProbability: number | null;
  precipitation: number | null;
  windSpeed: number | null;
  windDirection: string;
  visibility: number | null;
  /** 高云量（%），仅 Open-Meteo 提供。 */
  cloudHigh?: number | null;
  /** 中云量（%），仅 Open-Meteo 提供。 */
  cloudMid?: number | null;
  /** 低云量（%），仅 Open-Meteo 提供。 */
  cloudLow?: number | null;
  /** 气溶胶光学厚度（无量纲），仅 Open-Meteo 空气质量接口提供。 */
  aerosolOpticalDepth?: number | null;
}

export interface WeatherData {
  status: ServiceStatus;
  current: CurrentWeather | null;
  hourly: HourlyWeather[];
  sources: string[];
  missingFields: string[];
  message: string | null;
  /** 逐小时预报的获取时间；与 current.observedAt 的实况观测时间区分。 */
  forecastUpdatedAt?: string | null;
}

export interface SolarPosition {
  elevation: number;
  azimuth: number;
  /** 未计入大气折射的几何高度，用于日出、暮光与黄金时刻阈值。 */
  geometricElevation?: number;
}

export interface SolarPathPoint {
  time: string;
  elevation: number;
  azimuth: number;
}

export interface SolarData {
  sunrise: string | null;
  sunset: string | null;
  solarNoon: string;
  civilDawn: string | null;
  civilDusk: string | null;
  nauticalDawn: string | null;
  nauticalDusk: string | null;
  astronomicalDawn: string | null;
  astronomicalDusk: string | null;
  sunriseAzimuth: number | null;
  sunsetAzimuth: number | null;
  noonElevation: number | null;
  goldenHours: TimeWindow[];
  blueHours: TimeWindow[];
  path: SolarPathPoint[];
  algorithm: "NOAA_SOLAR_POSITION";
}

export interface ScoreBasis {
  code: string;
  label: string;
  value: number | null;
  unit: string;
  contribution: number | null;
  explanation: string;
}

export interface PotentialScore {
  status: "OK" | "INSUFFICIENT_DATA" | "UNAVAILABLE";
  score: number | null;
  confidence: number;
  confidenceLevel: "LOW" | "MEDIUM" | "HIGH";
  basis: ScoreBasis[];
  missingFields: string[];
  forecastWindow: TimeWindow | null;
  scoreMode: "FULL" | "PARTIAL" | "UNAVAILABLE";
  summary: string;
}

export interface FireCloudOutlook {
  possibility: "LOW" | "MEDIUM" | "HIGH" | null;
  possibilityLabel: string;
  vividness: number | null;
  vividnessLabel: string;
  cloudCover: number | null;
  cloudNote: string;
  cloudHigh: number | null;
  cloudMid: number | null;
  cloudLow: number | null;
  aerosolOpticalDepth: number | null;
}

export interface FireCloudPrediction {
  status: "OK" | "INSUFFICIENT_DATA" | "UNAVAILABLE";
  score: number | null;
  confidence: number;
  confidenceLevel: "LOW" | "MEDIUM" | "HIGH";
  basis: ScoreBasis[];
  missingFields: string[];
  forecastWindow: TimeWindow | null;
  scoreMode: "FULL" | "PARTIAL" | "UNAVAILABLE";
  summary: string;
  direction: "EAST" | "WEST";
  outlook: FireCloudOutlook;
}

export interface TimelineWeather {
  condition: string;
  cloud: number | null;
  precipitationProbability: number | null;
  windSpeed: number | null;
  visibility: number | null;
}

export type SlotKind =
  | "DAWN"
  | "SUNRISE"
  | "MORNING_GOLDEN"
  | "DAYTIME"
  | "EVENING_GOLDEN"
  | "SUNSET"
  | "DUSK"
  | "BLUE_HOUR"
  | "NIGHT";

export interface TimelineItem {
  slotId: string;
  start: string;
  end: string;
  kind: SlotKind;
  label: string;
  score: number | null;
  scoreMode: "FULL" | "ASTRO_ONLY" | "UNAVAILABLE";
  solar: SolarPosition;
  weather: TimelineWeather | null;
  isPast: boolean;
  reasons: string[];
  risks: string[];
}

export interface PhotographyPlan {
  slotId: string;
  theme: ThemeId;
  title: string;
  timeWindow: TimeWindow;
  locationNote: string;
  viewpoint: string;
  direction: string;
  cameraAngle: string;
  composition: string;
  cameraSettings: string;
  lightAnalysis: string;
  risks: string[];
  aiEnhanced: boolean;
}

export interface PhotographyIndexEntry {
  id:
    | "LANDSCAPE"
    | "PORTRAIT"
    | "URBAN"
    | "NIGHT"
    | "ASTRONOMY"
    | "DAWN"
    | "DUSK";
  label: string;
  score: number | null;
  note: string;
  confidence: "LOW" | "MEDIUM" | "HIGH";
  status: "OK" | "PARTIAL" | "UNAVAILABLE";
  windowLabel: string;
  basis: ScoreBasis[];
  missingFields: string[];
}

export type WeatherAlertKind =
  | "CLOUD"
  | "PRECIPITATION"
  | "VISIBILITY"
  | "WIND"
  | "BEST_WINDOW"
  | "TEMPERATURE";

export interface WeatherAlert {
  id: string;
  kind: WeatherAlertKind;
  level: "INFO" | "WATCH" | "WARNING";
  title: string;
  detail: string;
  time: string | null;
}

export interface PhotographyIndices {
  overall: number | null;
  confidence: "LOW" | "MEDIUM" | "HIGH";
  entries: PhotographyIndexEntry[];
  trend: Array<{ time: string; label: string; score: number | null }>;
  basis: string[];
}

export interface TodayResponse {
  generatedAt: string;
  date: string;
  timezone: "Asia/Shanghai";
  location: LocationResult;
  weather: WeatherData;
  solar: SolarData;
  indices: PhotographyIndices;
  potential: {
    dawn: PotentialScore;
    dusk: PotentialScore;
  };
  fireCloud: {
    dawn: FireCloudPrediction;
    dusk: FireCloudPrediction;
  };
  timeline: TimelineItem[];
  alerts: WeatherAlert[];
  plans: {
    mode: "AI_ENHANCED" | "RULE_BASED";
    aiStatus:
      | "SUCCESS"
      | "DISABLED"
      | "UNAVAILABLE"
      | "INVALID_RESPONSE"
      | "LIMIT_REACHED";
    items: PhotographyPlan[];
  };
  warnings: string[];
}

export interface TodayRequest {
  location: LocationInput;
  theme: ThemeId;
  date?: string;
}

export interface CustomPlanRequest extends TodayRequest {
  subject: string;
  equipment?: string;
  preferences?: string;
}

export interface CameraParameters {
  iso: string;
  aperture: string;
  shutter: string;
  focalLength: string;
  exposureBias: string;
  whiteBalance: string;
  focusMode: string;
}

export interface PlanScheduleItem {
  time: string;
  label: string;
  action: string;
}

export interface CustomPlan {
  slotId: string;
  title: string;
  timeWindow: TimeWindow;
  arrivalTime: string;
  schedule: PlanScheduleItem[];
  cameraParameters: CameraParameters;
  subjectApproach: string;
  composition: string;
  cameraSettings: string;
  lightAnalysis: string;
  risks: string[];
  solar: SolarPosition;
  weather: TimelineWeather | null;
}

export interface CustomPlansResponse {
  generatedAt: string;
  date: string;
  location: LocationResult;
  weatherSummary: string;
  summary: string;
  plans: CustomPlan[];
  aiStatus: TodayResponse["plans"]["aiStatus"];
  warnings: string[];
}

export interface SpotRecommendation {
  id: string;
  name: string;
  address: string;
  type: string;
  latitude: number;
  longitude: number;
  distanceMeters: number;
  direction: string;
  mapUrl: string;
  sunNote: string;
}

export interface SpotRecommendationsResponse {
  generatedAt: string;
  date: string;
  location: LocationResult;
  theme: ThemeId;
  weatherSummary: string;
  recommendedWindow: TimeWindow | null;
  sunriseAzimuth: number | null;
  sunsetAzimuth: number | null;
  spots: SpotRecommendation[];
  warnings: string[];
}

export interface SearchResponse {
  locations: LocationResult[];
  message?: string;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    retryable: boolean;
  };
}

export interface PhotoExif {
  make: string | null;
  model: string | null;
  lens: string | null;
  dateTimeOriginal: string | null;
  exposureTime: number | null;
  fNumber: number | null;
  iso: number | null;
  focalLength: number | null;
  focalLength35: number | null;
  exposureBias: number | null;
  flash: boolean | null;
  whiteBalance: string | null;
  orientation: number | null;
  hasGps: boolean;
}

export interface PhotoStats {
  width: number;
  height: number;
  aspectRatio: number;
  brightness: number;
  contrast: number;
  shadowsClipped: number;
  highlightsClipped: number;
  saturation: number;
  sharpness: number;
}

export const PHOTO_SUBJECTS = [
  "PORTRAIT",
  "LANDSCAPE",
  "NIGHT",
  "URBAN",
  "MACRO",
  "GENERAL",
] as const;

export type PhotoSubject = (typeof PHOTO_SUBJECTS)[number];

export const PHOTO_SUBJECT_LABELS: Record<PhotoSubject, string> = {
  PORTRAIT: "人像",
  LANDSCAPE: "风光",
  NIGHT: "夜景 / 弱光",
  URBAN: "城市 / 建筑",
  MACRO: "静物 / 特写",
  GENERAL: "通用",
};

/** Measurable pixel statistics used for scene inference and AI review. */
export interface PhotoSignals {
  skin: number;
  sky: number;
  green: number;
  warm: number;
  dark: number;
  bright: number;
  edgeDensity: number;
  centerSharpness: number;
  borderSharpness: number;
}

export interface PhotoScene {
  subject: PhotoSubject;
  label: string;
  confidence: "LOW" | "MEDIUM" | "HIGH";
  basis: string[];
  source?: "HEURISTIC" | "DEEPSEEK";
}

export interface PhotoAnalysisRequest {
  fileName: string;
  fileSize: number;
  mimeType: string;
  exif: PhotoExif | null;
  stats: PhotoStats;
  scene?: PhotoScene;
  signals?: PhotoSignals;
}

export interface PhotoAnalysisResponse {
  generatedAt: string;
  summary: string;
  strengths: string[];
  issues: string[];
  suggestions: string[];
  exifSummary: string[];
  scene: PhotoScene;
  confidenceLevel: "LOW" | "MEDIUM" | "HIGH";
  aiStatus:
    | "SUCCESS"
    | "DISABLED"
    | "LIMIT_REACHED"
    | "UNAVAILABLE"
    | "INVALID_RESPONSE";
  disclaimer: string;
}
