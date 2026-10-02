import { MALAM_CENTER, type LatLng } from '@delivery/shared';

/** Haversine distance in kilometres between two coordinates. */
export function haversineDistance(from: LatLng, to: LatLng): number {
  const earthRadiusKm = 6_371;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitudeDelta = toRadians(to.lat - from.lat);
  const longitudeDelta = toRadians(to.lng - from.lng);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(toRadians(from.lat)) * Math.cos(toRadians(to.lat)) * Math.sin(longitudeDelta / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Check whether a location falls within the configured delivery radius. */
export function isWithinDeliveryZone(
  latitude: number,
  longitude: number,
  kitchenLat: number = MALAM_CENTER.lat,
  kitchenLng: number = MALAM_CENTER.lng,
  maxRadiusKm = 15,
): { within: boolean; distanceKm: number; message: string | null } {
  const distance = haversineDistance(
    { lat: kitchenLat, lng: kitchenLng },
    { lat: latitude, lng: longitude },
  );

  if (distance <= maxRadiusKm) {
    return { within: true, distanceKm: distance, message: null };
  }

  return {
    within: false,
    distanceKm: distance,
    message: `This location is ${distance.toFixed(1)} km from our kitchen, outside our current delivery area (max ${maxRadiusKm} km).`,
  };
}
