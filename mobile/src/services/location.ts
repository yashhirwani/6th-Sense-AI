import * as Location from 'expo-location';

export type Fix = { lat: number; lon: number; accuracy_m: number | null; at: number };

let last: Fix | null = null;

export async function ensureLocationPermission(): Promise<boolean> {
  const cur = await Location.getForegroundPermissionsAsync();
  if (cur.granted) return true;
  if (!cur.canAskAgain) return false;
  return (await Location.requestForegroundPermissionsAsync()).granted;
}

/**
 * Current position with a hard timeout. Falls back to the last known fix (clearly aged) rather
 * than blocking - used for memories and emergency location sharing.
 */
export async function getFix(timeoutMs = 6000): Promise<Fix | null> {
  try {
    if (!(await ensureLocationPermission())) return last;
    const pos = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
      new Promise<null>((r) => setTimeout(() => r(null), timeoutMs)),
    ]);
    const p = pos ?? (await Location.getLastKnownPositionAsync());
    if (p) last = { lat: p.coords.latitude, lon: p.coords.longitude, accuracy_m: p.coords.accuracy ?? null, at: p.timestamp };
    return last;
  } catch {
    return last;
  }
}

export function lastFix() {
  return last;
}

export function mapsLink(f: Fix) {
  return `https://maps.google.com/?q=${f.lat.toFixed(6)},${f.lon.toFixed(6)}`;
}

/** Short human place name ("MG Road, Pune") when the OS geocoder can provide one. */
export async function placeName(f: Fix): Promise<string | null> {
  try {
    const [a] = await Location.reverseGeocodeAsync({ latitude: f.lat, longitude: f.lon });
    if (!a) return null;
    return [a.name ?? a.street, a.district ?? a.city].filter(Boolean).join(', ') || null;
  } catch {
    return null;
  }
}
