import type { RoadRouteStep } from './live-map';

export interface ManeuverAnnouncement {
  key: string;
  text: string;
}

export function shouldSpeakManeuver(
  announcement: ManeuverAnnouncement | null,
  lastSpokenKey: string | null,
): announcement is ManeuverAnnouncement {
  return Boolean(announcement && announcement.key !== lastSpokenKey);
}

export function buildManeuverAnnouncement(
  step: RoadRouteStep | null,
  distanceKm: number | null,
): ManeuverAnnouncement | null {
  if (
    !step || distanceKm === null || !Number.isFinite(distanceKm) ||
    distanceKm < 0 || distanceKm > 0.25
  ) return null;
  const distanceMeters = distanceKm * 1_000;
  const spokenDistance = distanceMeters < 1_000
    ? `${Math.max(10, Math.round(distanceMeters / 10) * 10)} meters`
    : `${(distanceMeters / 1_000).toFixed(1)} kilometers`;
  return {
    key: `${step.instruction}|${step.location[0]},${step.location[1]}`,
    text: `${step.instruction} in ${spokenDistance}.`,
  };
}