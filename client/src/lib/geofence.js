/** Cafe work zone — Persiaran Panglima Hitam, Setia Alam Impian (500m). */
export const CAFE_ZONE = {
  latitude: Number(import.meta.env.VITE_CAFE_LAT) || 3.028353,
  longitude: Number(import.meta.env.VITE_CAFE_LNG) || 101.51512,
  radiusMeters: Number(import.meta.env.VITE_CAFE_RADIUS_M) || 500,
  label: 'U Coffee · Setia Alam Impian',
};

const EARTH_RADIUS_M = 6371000;

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

/** Distance in meters between two WGS84 points. */
export function distanceMeters(lat1, lng1, lat2, lng2) {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * @returns {{
 *   status: 'inside' | 'outside' | 'missing',
 *   distance_m: number | null,
 *   within: boolean | null,
 * }}
 */
export function checkZone(latitude, longitude, zone = CAFE_ZONE) {
  if (
    latitude == null ||
    longitude == null ||
    Number.isNaN(Number(latitude)) ||
    Number.isNaN(Number(longitude))
  ) {
    return { status: 'missing', distance_m: null, within: null };
  }

  const distance_m = distanceMeters(
    zone.latitude,
    zone.longitude,
    Number(latitude),
    Number(longitude)
  );
  const within = distance_m <= zone.radiusMeters;
  return {
    status: within ? 'inside' : 'outside',
    distance_m: Math.round(distance_m),
    within,
  };
}
