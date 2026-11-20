/** WGS-84 与 GCJ-02 互转，以及静态地图上的像素偏移换算。 */

function outsideChina(latitude: number, longitude: number) {
  return longitude < 72.004 || longitude > 137.8347 || latitude < 0.8293 ||
    latitude > 55.8271;
}

function transformLatitude(x: number, y: number) {
  let value = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y +
    0.2 * Math.sqrt(Math.abs(x));
  value += (20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) *
    2 / 3;
  value += (20 * Math.sin(y * Math.PI) + 40 * Math.sin(y / 3 * Math.PI)) * 2 / 3;
  value += (160 * Math.sin(y / 12 * Math.PI) + 320 * Math.sin(y * Math.PI / 30)) *
    2 / 3;
  return value;
}

function transformLongitude(x: number, y: number) {
  let value = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y +
    0.1 * Math.sqrt(Math.abs(x));
  value += (20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) *
    2 / 3;
  value += (20 * Math.sin(x * Math.PI) + 40 * Math.sin(x / 3 * Math.PI)) * 2 / 3;
  value += (150 * Math.sin(x / 12 * Math.PI) + 300 * Math.sin(x / 30 * Math.PI)) *
    2 / 3;
  return value;
}

export function wgs84ToGcj02(latitude: number, longitude: number) {
  if (outsideChina(latitude, longitude)) return { latitude, longitude };
  const a = 6378245.0;
  const eccentricity = 0.00669342162296594323;
  let deltaLatitude = transformLatitude(longitude - 105, latitude - 35);
  let deltaLongitude = transformLongitude(longitude - 105, latitude - 35);
  const radLatitude = latitude / 180 * Math.PI;
  let magic = Math.sin(radLatitude);
  magic = 1 - eccentricity * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  deltaLatitude = deltaLatitude * 180 /
    ((a * (1 - eccentricity)) / (magic * sqrtMagic) * Math.PI);
  deltaLongitude = deltaLongitude * 180 /
    (a / sqrtMagic * Math.cos(radLatitude) * Math.PI);
  return {
    latitude: latitude + deltaLatitude,
    longitude: longitude + deltaLongitude,
  };
}

export function gcj02ToWgs84(latitude: number, longitude: number) {
  if (outsideChina(latitude, longitude)) return { latitude, longitude };
  let wgsLatitude = latitude;
  let wgsLongitude = longitude;
  for (let index = 0; index < 6; index++) {
    const converted = wgs84ToGcj02(wgsLatitude, wgsLongitude);
    wgsLatitude -= converted.latitude - latitude;
    wgsLongitude -= converted.longitude - longitude;
  }
  return { latitude: wgsLatitude, longitude: wgsLongitude };
}

/** 按米为单位的东/北偏移移动坐标，用于微调按钮。 */
export function offsetMeters(
  latitude: number,
  longitude: number,
  eastMeters: number,
  northMeters: number,
) {
  const metersPerDegree = 111_320;
  const cosine = Math.max(0.1, Math.cos(latitude * Math.PI / 180));
  return {
    latitude: latitude + northMeters / metersPerDegree,
    longitude: longitude + eastMeters / (metersPerDegree * cosine),
  };
}

/** Web Mercator 下每像素对应的地面米数（与高德缩放级别一致）。 */
export function metersPerPixel(latitude: number, zoom: number) {
  return 156_543.03392 * Math.cos(latitude * Math.PI / 180) /
    Math.pow(2, zoom);
}

export function formatCoordinate(latitude: number, longitude: number) {
  return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
}
