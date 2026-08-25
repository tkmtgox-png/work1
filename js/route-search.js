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

// 開始地点からpointsを全て回る巡回順を概算する(直線距離ベース)。最近傍法で初期順を作り、
// 2-opt(隣接しない2辺を入れ替えて総距離が縮むなら採用)で改善が無くなるまで繰り返す。
// 移動手段による速度差は全区間に一律にかかるだけで順位には影響しないため、ここではhaversineKmのみで比較する。
// ポイント数が少ない(実用上10〜20件程度)前提の総当たりで、パフォーマンス上の懸念はない。
export function optimizeVisitOrder(startPoint, points) {
  if (points.length <= 1) return points.slice();

  const remaining = points.slice();
  const tour = [];
  let cursor = startPoint;
  while (remaining.length) {
    let bestIdx = 0;
    let bestDist = Infinity;
    remaining.forEach((p, idx) => {
      const d = haversineKm(cursor, p);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = idx;
      }
    });
    const next = remaining.splice(bestIdx, 1)[0];
    tour.push(next);
    cursor = next;
  }

  function tourLength(t) {
    let total = haversineKm(startPoint, t[0]);
    for (let i = 0; i < t.length - 1; i++) total += haversineKm(t[i], t[i + 1]);
    total += haversineKm(t[t.length - 1], startPoint);
    return total;
  }

  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < tour.length - 1; i++) {
      for (let j = i + 1; j < tour.length; j++) {
        const candidate = [...tour.slice(0, i), ...tour.slice(i, j + 1).reverse(), ...tour.slice(j + 1)];
        if (tourLength(candidate) < tourLength(tour) - 1e-9) {
          tour.splice(0, tour.length, ...candidate);
          improved = true;
        }
      }
    }
  }

  return tour;
}

// 周辺検索(Overpass API)の検索半径の目安。残り時間をそのまま片道の上限距離とみなし、
// 移動手段の速度から逆算する(往復前提で半分にはしない)。起点方向にある候補は、
// 実際には「往復」ではなく「帰り道への合流」で済むため、現在地からは遠くても
// 時間内に収まることがある。ここでは検索網を広めに取るだけにとどめ、実際に時間内に
// 収まるかどうかは呼び出し側(getFeasibleCandidates・renderCandidateListのtotalIfChosen)
// の判定に任せる。都心部などでは半径が大きいとOverpassの応答が重くなりタイムアウトしやすいため、
// 上限は8kmに抑える。
export function estimateSearchRadiusKm(remainingMinutes, transportMode) {
  const speed = SPEED_KMH[transportMode] || SPEED_KMH.walk;
  const oneWayMinutes = Math.max(0, remainingMinutes);
  const km = (oneWayMinutes / 60) * speed / DETOUR_FACTOR;
  return Math.min(8, Math.max(1, km));
}
