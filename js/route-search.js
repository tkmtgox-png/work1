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

// 現在位置(直近に選んだ観光スポット、または起点)から移動できる観光スポットの候補のうち、
// 起点への戻り時間も含めて希望時間内に収まるものだけを返す(未ソート、呼び出し側でまとめて並び替える)。
// 滞在時間はこの時間予算には含めない。
export function getFeasibleCandidates(route, currentLatLng, usedMinutes) {
  const start = route.points.find((p) => p.type === "start");
  if (!start || !route.desiredMinutes) return [];

  const candidates = route.points.filter(
    (p) => p.type === "sightseeing" && p.included !== true
  );

  return candidates
    .map((point) => {
      const fromCurrent = travelMinutes(currentLatLng, point, route.transportMode);
      const backToStart = travelMinutes(point, start, route.transportMode);
      const totalIfChosen = usedMinutes + fromCurrent + backToStart;
      return { point, travelFromCurrent: fromCurrent, totalIfChosen };
    })
    .filter((c) => c.totalIfChosen <= route.desiredMinutes);
}

// 周辺検索(Overpass API)の検索半径の目安。残り時間の半分を片道の上限距離とみなし、
// 移動手段の速度から逆算する。都心部などでは半径が大きいとOverpassの応答が
// 重くなりタイムアウトしやすいため、上限は8kmに抑える。
export function estimateSearchRadiusKm(remainingMinutes, transportMode) {
  const speed = SPEED_KMH[transportMode] || SPEED_KMH.walk;
  const oneWayMinutes = Math.max(0, remainingMinutes) / 2;
  const km = (oneWayMinutes / 60) * speed / DETOUR_FACTOR;
  return Math.min(8, Math.max(1, km));
}
