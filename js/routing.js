const OSRM_PROFILES = {
  walk: "foot",
  car: "driving",
};

const OUTBOUND_STYLE = { color: "#2563eb", weight: 5 };
const RETURN_STYLE = { color: "#f97316", weight: 5, dashArray: "8 8" };

let routingControl = null;
let currentProfile = null;
let fallbackLine = null;
let outboundLine = null;
let returnLine = null;

export function buildOrderedPoints(route) {
  const start = route.points.find((p) => p.type === "start");
  const rest = route.points
    .filter((p) => p.type !== "start" && p.included !== false)
    .sort((a, b) => a.order - b.order);
  if (!start) return rest;
  return [start, ...rest, start];
}

function clearFallback(map) {
  if (fallbackLine) {
    map.removeLayer(fallbackLine);
    fallbackLine = null;
  }
}

function clearSegments(map) {
  if (outboundLine) {
    map.removeLayer(outboundLine);
    outboundLine = null;
  }
  if (returnLine) {
    map.removeLayer(returnLine);
    returnLine = null;
  }
}

function drawFallbackLine(map, latlngs) {
  clearFallback(map);
  fallbackLine = L.polyline(latlngs, { color: "#2563eb", weight: 4, dashArray: "6 8" }).addTo(map);
}

// 往路(起点→最後の実ポイント)と復路(最後の実ポイント→起点)を別の色・線種で描画する。
// route.waypointIndicesは、渡したwaypoints配列の各点がcoordinates配列の何番目に対応するかを示す。
function drawSegments(map, route) {
  const coords = route.coordinates;
  const wpIdx = route.waypointIndices;
  if (!wpIdx || wpIdx.length < 2) {
    outboundLine = L.polyline(coords, OUTBOUND_STYLE).addTo(map);
    return;
  }
  const lastStopIdx = wpIdx[wpIdx.length - 2];
  const outboundCoords = coords.slice(0, lastStopIdx + 1);
  const returnCoords = coords.slice(lastStopIdx);
  outboundLine = L.polyline(outboundCoords, OUTBOUND_STYLE).addTo(map);
  if (returnCoords.length > 1) {
    returnLine = L.polyline(returnCoords, RETURN_STYLE).addTo(map);
  }
}

// プロフィール(徒歩/車)が変わらない限りコントロールを使い回す。
// 追加のたびに破棄・再生成すると、OSRMへのリクエストが完了する前にコントロールが
// 消され、Leaflet Routing Machine内部でnullな地図参照にアクセスして例外が出ることがあるため。
function getControl(map, profile) {
  if (routingControl && currentProfile === profile) return routingControl;
  if (routingControl) {
    map.removeControl(routingControl);
    routingControl = null;
  }
  currentProfile = profile;
  routingControl = L.Routing.control({
    waypoints: [],
    router: L.Routing.osrmv1({
      serviceUrl: "https://router.project-osrm.org/route/v1",
      profile,
    }),
    createMarker: () => null,
    addWaypoints: false,
    draggableWaypoints: false,
    fitSelectedRoutes: false,
    show: false,
    // 既定の線描画は使わず、往路・復路を自前のpolylineで描画するため透明にする
    lineOptions: { styles: [{ opacity: 0, weight: 5 }] },
  }).addTo(map);

  routingControl.on("routesfound", (e) => {
    clearFallback(map);
    clearSegments(map);
    drawSegments(map, e.routes[0]);
  });
  routingControl.on("routingerror", () => {
    clearSegments(map);
    if (routingControl && routingControl._lastLatLngs) {
      drawFallbackLine(map, routingControl._lastLatLngs);
    }
  });

  return routingControl;
}

export function drawRoute(map, route) {
  const ordered = buildOrderedPoints(route);
  if (ordered.length < 2) {
    clearRoute(map);
    return;
  }

  const latlngs = ordered.map((p) => L.latLng(p.lat, p.lng));
  const profile = OSRM_PROFILES[route.transportMode] || "foot";
  const control = getControl(map, profile);
  control._lastLatLngs = latlngs;
  control.setWaypoints(latlngs);
}

export function clearRoute(map) {
  if (routingControl) {
    map.removeControl(routingControl);
    routingControl = null;
    currentProfile = null;
  }
  clearFallback(map);
  clearSegments(map);
}
