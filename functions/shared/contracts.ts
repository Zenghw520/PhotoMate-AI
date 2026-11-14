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
}

export interface WeatherData {
  status: ServiceStatus;
  current: CurrentWeather | null;
  hourly: HourlyWeather[];
  sources: string[];
  missingFields: string[];
  message: string | null;
}

export interface SolarPosition {
  elevation: number;
  azimuth: number;
}

export interface SolarData {
  sunrise: string | null;
  sunset: string | null;
  solarNoon: string;
  goldenHours: TimeWindow[];
  blueHours: TimeWindow[];
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

export interface TodayResponse {
  generatedAt: string;
  date: string;
  timezone: "Asia/Shanghai";
  location: LocationResult;
  weather: WeatherData;
  solar: SolarData;
  potential: {
    dawn: PotentialScore;
    dusk: PotentialScore;
  };
  fireCloud: {
    dawn: FireCloudPrediction;
    dusk: FireCloudPrediction;
  };
  timeline: TimelineItem[];
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
