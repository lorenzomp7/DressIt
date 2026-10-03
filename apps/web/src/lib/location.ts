export interface Coords {
  lat: number;
  lon: number;
}

/** Resolves to null if geolocation is unavailable or denied: weather is optional. */
export function getLocation(timeoutMs = 8000): Promise<Coords | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 30 * 60 * 1000 },
    );
  });
}
