const SECONDS_PER_E_FOLD = 0.11;
const QUICKEST_SECONDS = 2.5;
const SLOWEST_SECONDS = 5;
const DEPARTURE_HASTE = 0.7;

export const eased = (progress) => progress * progress * (3 - 2 * progress);

export function planGlide({ distance, finalDistance, departureRoom }) {
  if (distance <= finalDistance) {
    return { seconds: QUICKEST_SECONDS, distanceAt: (progress) => distance * (finalDistance / distance) ** eased(progress) };
  }
  const travel = distance - finalDistance;
  const departureScale = Math.min(departureRoom, travel);
  const start = Math.log(departureScale / (travel + finalDistance));
  const finish = Math.log((travel + departureScale) / finalDistance);
  const distanceAt = (progress) => {
    const ratio = Math.exp(start + (finish - start) * eased(progress ** DEPARTURE_HASTE));
    const remaining = (travel + departureScale - finalDistance * ratio) / (1 + ratio);
    return finalDistance + Math.max(0, Math.min(travel, remaining));
  };
  return { seconds: Math.max(QUICKEST_SECONDS, Math.min(SLOWEST_SECONDS, (finish - start) * SECONDS_PER_E_FOLD)), distanceAt };
}
