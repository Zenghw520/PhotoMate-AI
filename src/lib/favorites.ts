import type { ShootingSpot, SpotSource } from "@/src/lib/shooting";

const STORAGE_KEY = "photomate-favorites:v1";
const EVENT = "photomate-favorites-changed";
const MAX_FAVORITES = 60;

export interface FavoriteSpot {
  id: string;
  name: string;
  address?: string;
  latitude: number;
  longitude: number;
  source: SpotSource;
  mapUrl?: string;
  savedAt: string;
}

function read(): FavoriteSpot[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is FavoriteSpot =>
      !!item && typeof item === "object" &&
      typeof item.id === "string" &&
      typeof item.name === "string" &&
      typeof item.latitude === "number" &&
      typeof item.longitude === "number"
    );
  } catch {
    return [];
  }
}

function write(items: FavoriteSpot[]) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(items.slice(0, MAX_FAVORITES)),
    );
  } catch {
    // 本地存储不可用时保留当前会话状态。
  }
  window.dispatchEvent(new Event(EVENT));
}

export function readFavorites() {
  return read().sort((left, right) =>
    Date.parse(right.savedAt) - Date.parse(left.savedAt)
  );
}

export function addFavorite(spot: ShootingSpot, name: string) {
  const trimmed = name.trim().slice(0, 40) || spot.name;
  const entry: FavoriteSpot = {
    id: crypto.randomUUID(),
    name: trimmed,
    address: spot.address,
    latitude: spot.latitude,
    longitude: spot.longitude,
    source: spot.source,
    mapUrl: spot.mapUrl,
    savedAt: new Date().toISOString(),
  };
  write([entry, ...read()]);
  return entry;
}

export function removeFavorite(id: string) {
  write(read().filter((item) => item.id !== id));
}

export function favoriteToSpot(favorite: FavoriteSpot): ShootingSpot {
  return {
    id: favorite.id,
    name: favorite.name,
    address: favorite.address,
    latitude: favorite.latitude,
    longitude: favorite.longitude,
    precision: "MANUAL",
    source: "FAVORITE",
    mapUrl: favorite.mapUrl,
    savedAt: favorite.savedAt,
  };
}

export function subscribeFavorites(listener: () => void) {
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
