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
  /** 阵风（m/s），部分来源提供。 */
  windGust?: number | null;
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
  cloudHigh?: number | null;
  cloudMid?: number | null;
  cloudLow?: number | null;
  precipitationProbability: number | null;
  windSpeed: number | null;
  windGust?: number | null;
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
  /** 结构化设备信息，缺省时退回 equipment 文本。 */
  phone?: string;
  camera?: string;
  lens?: string;
  /** 指定窗口；缺省时按日期自动挑选。 */
  slotKind?: SlotKind;
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

export interface PlanBackup {
  trigger: string;
  action: string;
  windowLabel: string;
}

export interface CustomPlan {
  slotId: string;
  title: string;
  timeWindow: TimeWindow;
  arrivalTime: string;
  schedule: PlanScheduleItem[];
  cameraParameters: CameraParameters;
  /** 到场后的相机朝向，与去程方向区分。 */
  cameraDirection: string;
  cameraAzimuth: number;
  /** 曝光起点，便于到场后直接试拍。 */
  exposureStart: string;
  subjectApproach: string;
  composition: string;
  cameraSettings: string;
  lightAnalysis: string;
  risks: string[];
  /** 条件变差时的备选方案。 */
  backup: PlanBackup | null;
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
  /** 本次实际使用的窗口类型，便于跨页保持同一选择。 */
  slotKind: SlotKind | null;
  equipment: string | null;
}

export type SpotScene = "SUNRISE" | "SUNSET" | "DAY";

export interface SpotVerification {
  opening: string;
  access: string;
  occlusion: string;
}

export interface SpotRecommendation {
  id: string;
  name: string;
  address: string;
  type: string;
  latitude: number;
  longitude: number;
  distanceMeters: number;
  /** 从当前拍摄位置去机位的行进方向。 */
  direction: string;
  /** 到机位后相机朝向（太阳方位）。 */
  cameraDirection: string;
  cameraAzimuth: number | null;
  scene: SpotScene;
  /** 题材匹配 0–100 与命中说明。 */
  matchScore: number;
  matchReason: string;
  verification: SpotVerification;
  /** 该机位在此日期的推荐窗口。 */
  recommendedWindow: TimeWindow | null;
  windowKind: SlotKind | null;
  windowLabel: string | null;
  mapUrl: string;
  sunNote: string;
}

export interface SpotRequest extends TodayRequest {
  scene?: SpotScene | "ALL";
  radiusMeters?: number;
  slotKind?: SlotKind;
}

export interface SpotRecommendationsResponse {
  generatedAt: string;
  date: string;
  location: LocationResult;
  theme: ThemeId;
  weatherSummary: string;
  recommendedWindow: TimeWindow | null;
  recommendedWindowKind: SlotKind | null;
  recommendedWindowLabel: string | null;
  sunriseAzimuth: number | null;
  sunsetAzimuth: number | null;
  spots: SpotRecommendation[];
  warnings: string[];
}

export interface CompareItemInput {
  location: LocationInput;
  date?: string;
  label?: string;
}

export interface CompareRequest {
  items: CompareItemInput[];
  theme: ThemeId;
  slotKind?: SlotKind;
}

export interface CompareWindow {
  slotId: string;
  kind: SlotKind;
  label: string;
  start: string;
  end: string;
  arrivalTime: string;
  score: number | null;
  confidence: "LOW" | "MEDIUM" | "HIGH";
  precipitationProbability: number | null;
  precipitation: number | null;
  windGust: number | null;
  visibility: number | null;
  cloud: number | null;
  cloudHigh: number | null;
  cloudMid: number | null;
  cloudLow: number | null;
  cameraAzimuth: number | null;
  cameraDirection: string;
  coveredHours: number;
  totalHours: number;
  partial: boolean;
}

export interface CompareItemResult {
  label: string;
  date: string;
  location: LocationResult;
  window: CompareWindow | null;
  warnings: string[];
}

export interface CompareResponse {
  generatedAt: string;
  theme: ThemeId;
  slotKind: SlotKind | null;
  items: CompareItemResult[];
  bestIndex: number | null;
  reason: string;
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
  /** 只在本地判断是否存在 GPS；上报云端时省略。 */
  hasGps?: boolean;
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
  /** 近乎无纹理的像素占比（%）。 */
  flatness?: number;
  /** 出现最多的量化颜色占比（%）。 */
  dominantColor?: number;
  /** 截图、文档或纯色界面图像的可信度（0–100）。 */
  screenLike?: number;
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
  /** 用户手动指定题材时跳过 AI 复核，避免覆盖用户选择。 */
  manualScene?: boolean;
}

export interface PhotoImprovement {
  title: string;
  /** 画面或参数上的观察依据。 */
  evidence: string;
  /** 下次拍摄可直接尝试的调整。 */
  adjustment: string;
}

export interface PhotoAnalysisResponse {
  generatedAt: string;
  summary: string;
  /** 优先展示的三条具体改进；其余保留在 issues / suggestions。 */
  improvements: PhotoImprovement[];
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
