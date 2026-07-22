const DETOUR_FACTOR = 1.3;
const SPEED_KMH = { walk: 4, car: 20 };

export function haversineKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function travelMinutes(a, b, transportMode) {
  const speed = SPEED_KMH[transportMode] || SPEED_KMH.walk;
  const km = haversineKm(a, b) * DETOUR_FACTOR;
  return (km / speed) * 60;
}

function tourTravelMinutes(tour, transportMode) {
  let total = 0;
  for (let i = 0; i < tour.length - 1; i++) {
    total += travelMinutes(tour[i], tour[i + 1], transportMode);
  }
  return total;
}

function tourStayMinutes(tour) {
  let total = 0;
  for (let i = 0; i < tour.length - 1; i++) {
    total += tour[i].stayMinutes || 0;
  }
  return total;
}

export function recommendRoute(route) {
  const start = route.points.find((p) => p.type === "start");
  if (!start || !route.desiredMinutes) return null;

  const mandatory = route.points
    .filter((p) => p.type === "waypoint" || p.type === "meal")
    .sort((a, b) => a.order - b.order);
  const candidates = route.points.filter((p) => p.type === "sightseeing");

  let tour = [start, ...mandatory, start];
  let totalMinutes = tourTravelMinutes(tour, route.transportMode) + tourStayMinutes(tour);

  const remaining = new Map(candidates.map((c) => [c.id, c]));

  while (remaining.size > 0) {
    let best = null;
    for (const cand of remaining.values()) {
      for (let i = 0; i < tour.length - 1; i++) {
        const a = tour[i];
        const b = tour[i + 1];
        const extra =
          travelMinutes(a, cand, route.transportMode) +
          travelMinutes(cand, b, route.transportMode) -
          travelMinutes(a, b, route.transportMode) +
          (cand.stayMinutes || 0);
        if (!best || extra < best.extra) {
          best = { cand, index: i, extra };
        }
      }
    }
    if (!best) break;
    const newTotal = totalMinutes + best.extra;
    if (newTotal > route.desiredMinutes) break;
    tour.splice(best.index + 1, 0, best.cand);
    remaining.delete(best.cand.id);
    totalMinutes = newTotal;
  }

  const includedSightseeingIds = new Set(
    tour.filter((p) => p.type === "sightseeing").map((p) => p.id)
  );

  return { tour, includedSightseeingIds, totalMinutes };
}
