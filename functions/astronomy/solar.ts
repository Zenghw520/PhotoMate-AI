import type {
  SolarData,
  SolarPosition,
  TimeWindow,
} from "../shared/contracts.ts";

const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;
const OFFSET_MS = 8 * 60 * MINUTE_MS;
const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeDegrees(value: number): number {
  return ((value % 360) + 360) % 360;
}

function validateCoordinates(latitude: number, longitude: number): void {
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new RangeError("latitude must be between -90 and 90");
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new RangeError("longitude must be between -180 and 180");
  }
}

export function solarPositionAt(
  latitude: number,
  longitude: number,
  instant: Date,
): SolarPosition {
  validateCoordinates(latitude, longitude);
  const timestamp = instant.getTime();
  if (!Number.isFinite(timestamp)) {
    throw new RangeError("instant must be valid");
  }

  const julianDay = timestamp / DAY_MS + 2_440_587.5;
  const century = (julianDay - 2_451_545) / 36_525;
  const meanLongitude = normalizeDegrees(
    280.46646 + century * (36_000.76983 + century * 0.0003032),
  );
  const meanAnomaly = 357.52911 +
    century * (35_999.05029 - 0.0001537 * century);
  const eccentricity = 0.016708634 -
    century * (0.000042037 + 0.0000001267 * century);
  const anomalyRad = meanAnomaly * RAD;
  const equationOfCenter = Math.sin(anomalyRad) *
      (1.914602 - century * (0.004817 + 0.000014 * century)) +
    Math.sin(2 * anomalyRad) * (0.019993 - 0.000101 * century) +
    Math.sin(3 * anomalyRad) * 0.000289;
  const trueLongitude = meanLongitude + equationOfCenter;
  const omega = 125.04 - 1934.136 * century;
  const apparentLongitude = trueLongitude - 0.00569 -
    0.00478 * Math.sin(omega * RAD);
  const meanObliquity = 23 +
    (26 +
        (21.448 -
            century * (46.815 + century * (0.00059 - century * 0.001813))) /
          60) / 60;
  const obliquity = meanObliquity + 0.00256 * Math.cos(omega * RAD);
  const declination = Math.asin(
    Math.sin(obliquity * RAD) * Math.sin(apparentLongitude * RAD),
  ) * DEG;

  const obliquityFactor = Math.tan(obliquity * RAD / 2) ** 2;
  const longitudeRad = meanLongitude * RAD;
  const equationOfTime = 4 * DEG * (
    obliquityFactor * Math.sin(2 * longitudeRad) -
    2 * eccentricity * Math.sin(anomalyRad) +
    4 * eccentricity * obliquityFactor * Math.sin(anomalyRad) *
      Math.cos(2 * longitudeRad) -
    0.5 * obliquityFactor ** 2 * Math.sin(4 * longitudeRad) -
    1.25 * eccentricity ** 2 * Math.sin(2 * anomalyRad)
  );

  const utcMinutes = ((timestamp / MINUTE_MS) % 1440 + 1440) % 1440;
  const trueSolarMinutes = normalizeDegrees(
    (utcMinutes + equationOfTime + 4 * longitude) * 0.25,
  ) * 4;
  const hourAngle = trueSolarMinutes / 4 - 180;
  const latitudeRad = latitude * RAD;
  const declinationRad = declination * RAD;
  const hourAngleRad = hourAngle * RAD;
  const cosineZenith = clamp(
    Math.sin(latitudeRad) * Math.sin(declinationRad) +
      Math.cos(latitudeRad) * Math.cos(declinationRad) * Math.cos(hourAngleRad),
    -1,
    1,
  );
  const geometricElevation = 90 - Math.acos(cosineZenith) * DEG;

  let refraction = 0;
  if (geometricElevation > 85) {
    refraction = 0;
  } else if (geometricElevation > 5) {
    const tangent = Math.tan(geometricElevation * RAD);
    refraction =
      (58.1 / tangent - 0.07 / tangent ** 3 + 0.000086 / tangent ** 5) / 3600;
  } else if (geometricElevation > -0.575) {
    refraction = (1735 + geometricElevation *
        (-518.2 +
          geometricElevation *
            (103.4 +
              geometricElevation * (-12.79 + geometricElevation * 0.711)))) /
      3600;
  } else {
    refraction = -20.772 / Math.tan(geometricElevation * RAD) / 3600;
  }

  const azimuth = normalizeDegrees(
    Math.atan2(
          Math.sin(hourAngleRad),
          Math.cos(hourAngleRad) * Math.sin(latitudeRad) -
            Math.tan(declinationRad) * Math.cos(latitudeRad),
        ) * DEG + 180,
  );

  return {
    elevation: geometricElevation + refraction,
    azimuth,
    geometricElevation,
  };
}

function eventElevation(position: SolarPosition): number {
  return position.geometricElevation ?? position.elevation;
}

function parseLocalDate(localDate: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate)) {
    throw new RangeError("localDate must use YYYY-MM-DD");
  }
  const start = Date.parse(`${localDate}T00:00:00+08:00`);
  if (
    !Number.isFinite(start) ||
    new Date(start + OFFSET_MS).toISOString().slice(0, 10) !== localDate
  ) {
    throw new RangeError("localDate must be a valid calendar date");
  }
  return start;
}

function toShanghaiIso(timestamp: number): string {
  const rounded = Math.round(timestamp / 1000) * 1000;
  return `${new Date(rounded + OFFSET_MS).toISOString().slice(0, 19)}+08:00`;
}

interface Crossing {
  time: number;
  rising: boolean;
}

function refineCrossing(
  latitude: number,
  longitude: number,
  left: number,
  right: number,
  threshold: number,
): number {
  const rising =
    eventElevation(solarPositionAt(latitude, longitude, new Date(left))) <
      threshold;
  for (let index = 0; index < 32; index++) {
    const middle = (left + right) / 2;
    const elevation = eventElevation(
      solarPositionAt(latitude, longitude, new Date(middle)),
    );
    if (
      (rising && elevation < threshold) || (!rising && elevation >= threshold)
    ) {
      left = middle;
    } else {
      right = middle;
    }
  }
  return (left + right) / 2;
}

function findCrossings(
  latitude: number,
  longitude: number,
  dayStart: number,
  threshold: number,
): Crossing[] {
  const crossings: Crossing[] = [];
  let leftTime = dayStart;
  let leftElevation = eventElevation(
    solarPositionAt(latitude, longitude, new Date(leftTime)),
  );
  for (let minute = 1; minute <= 1440; minute++) {
    const rightTime = dayStart + minute * MINUTE_MS;
    const rightElevation = eventElevation(
      solarPositionAt(latitude, longitude, new Date(rightTime)),
    );
    if (
      (leftElevation < threshold && rightElevation >= threshold) ||
      (leftElevation >= threshold && rightElevation < threshold)
    ) {
      crossings.push({
        time: refineCrossing(
          latitude,
          longitude,
          leftTime,
          rightTime,
          threshold,
        ),
        rising: leftElevation < threshold,
      });
    }
    leftTime = rightTime;
    leftElevation = rightElevation;
  }
  return crossings;
}

function findSolarNoon(
  latitude: number,
  longitude: number,
  dayStart: number,
): number {
  let bestTime = dayStart;
  let bestElevation = -Infinity;
  for (let minute = 0; minute <= 1440; minute++) {
    const time = dayStart + minute * MINUTE_MS;
    const elevation = eventElevation(
      solarPositionAt(latitude, longitude, new Date(time)),
    );
    if (elevation > bestElevation) {
      bestElevation = elevation;
      bestTime = time;
    }
  }
  let left = Math.max(dayStart, bestTime - 2 * MINUTE_MS);
  let right = Math.min(dayStart + DAY_MS, bestTime + 2 * MINUTE_MS);
  for (let index = 0; index < 36; index++) {
    const first = left + (right - left) / 3;
    const second = right - (right - left) / 3;
    const firstElevation = eventElevation(
      solarPositionAt(latitude, longitude, new Date(first)),
    );
    const secondElevation = eventElevation(
      solarPositionAt(latitude, longitude, new Date(second)),
    );
    if (firstElevation < secondElevation) left = first;
    else right = second;
  }
  return (left + right) / 2;
}

function elevationWindows(
  latitude: number,
  longitude: number,
  dayStart: number,
  lower: number,
  upper: number,
): TimeWindow[] {
  const inRange = (time: number) => {
    const elevation = eventElevation(
      solarPositionAt(latitude, longitude, new Date(time)),
    );
    return elevation >= lower && elevation <= upper;
  };
  const crossings = [
    ...findCrossings(latitude, longitude, dayStart, lower),
    ...findCrossings(latitude, longitude, dayStart, upper),
  ].sort((first, second) => first.time - second.time);
  const windows: TimeWindow[] = [];
  let windowStart: number | null = inRange(dayStart) ? dayStart : null;
  for (const crossing of crossings) {
    if (windowStart !== null) {
      if (crossing.time - windowStart >= 1000) {
        windows.push({
          start: toShanghaiIso(windowStart),
          end: toShanghaiIso(crossing.time),
        });
      }
      windowStart = null;
    } else if (inRange(Math.min(dayStart + DAY_MS - 1, crossing.time + 1000))) {
      windowStart = crossing.time;
    }
  }
  if (windowStart !== null && dayStart + DAY_MS - windowStart >= 1000) {
    windows.push({
      start: toShanghaiIso(windowStart),
      end: toShanghaiIso(dayStart + DAY_MS),
    });
  }
  return windows;
}

function twilightPair(
  latitude: number,
  longitude: number,
  dayStart: number,
  threshold: number,
): { dawn: number | null; dusk: number | null } {
  const crossings = findCrossings(latitude, longitude, dayStart, threshold);
  return {
    dawn: crossings.find((crossing) => crossing.rising)?.time ?? null,
    dusk: [...crossings].reverse().find((crossing) => !crossing.rising)?.time ??
      null,
  };
}

export function computeSolar(
  latitude: number,
  longitude: number,
  localDate: string,
): SolarData {
  validateCoordinates(latitude, longitude);
  const dayStart = parseLocalDate(localDate);
  const sunriseCrossings = findCrossings(latitude, longitude, dayStart, -0.833);
  const sunrise = sunriseCrossings.find((crossing) => crossing.rising);
  const sunset = [...sunriseCrossings].reverse().find((crossing) =>
    !crossing.rising
  );
  const civil = twilightPair(latitude, longitude, dayStart, -6);
  const nautical = twilightPair(latitude, longitude, dayStart, -12);
  const astronomical = twilightPair(latitude, longitude, dayStart, -18);
  const noonTime = findSolarNoon(latitude, longitude, dayStart);
  const sunriseAzimuth = sunrise
    ? solarPositionAt(latitude, longitude, new Date(sunrise.time)).azimuth
    : null;
  const sunsetAzimuth = sunset
    ? solarPositionAt(latitude, longitude, new Date(sunset.time)).azimuth
    : null;
  const noonElevation =
    solarPositionAt(latitude, longitude, new Date(noonTime)).elevation;
  const path = Array.from({ length: 145 }, (_, index) => {
    const time = dayStart + index * 10 * MINUTE_MS;
    const position = solarPositionAt(
      latitude,
      longitude,
      new Date(time),
    );
    return {
      time: toShanghaiIso(time),
      elevation: Math.round(position.elevation * 10) / 10,
      azimuth: Math.round(position.azimuth * 10) / 10,
    };
  });
  return {
    sunrise: sunrise ? toShanghaiIso(sunrise.time) : null,
    sunset: sunset ? toShanghaiIso(sunset.time) : null,
    solarNoon: toShanghaiIso(noonTime),
    civilDawn: civil.dawn === null ? null : toShanghaiIso(civil.dawn),
    civilDusk: civil.dusk === null ? null : toShanghaiIso(civil.dusk),
    nauticalDawn: nautical.dawn === null ? null : toShanghaiIso(nautical.dawn),
    nauticalDusk: nautical.dusk === null ? null : toShanghaiIso(nautical.dusk),
    astronomicalDawn: astronomical.dawn === null
      ? null
      : toShanghaiIso(astronomical.dawn),
    astronomicalDusk: astronomical.dusk === null
      ? null
      : toShanghaiIso(astronomical.dusk),
    sunriseAzimuth: sunriseAzimuth === null
      ? null
      : Math.round(sunriseAzimuth * 10) / 10,
    sunsetAzimuth: sunsetAzimuth === null
      ? null
      : Math.round(sunsetAzimuth * 10) / 10,
    noonElevation: Math.round(noonElevation * 10) / 10,
    goldenHours: elevationWindows(latitude, longitude, dayStart, -4, 6),
    blueHours: elevationWindows(latitude, longitude, dayStart, -6, -4),
    path,
    algorithm: "NOAA_SOLAR_POSITION",
  };
}
