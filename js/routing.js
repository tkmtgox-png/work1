const OSRM_PROFILES = {
  walk: "foot",
  car: "driving",
};

let routingControl = null;
let currentProfile = null;
let fallbackLine = null;

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

function drawFallbackLine(map, latlngs) {
  clearFallback(map);
  fallbackLine = L.polyline(latlngs, { color: "#2563eb", weight: 4, dashArray: "6 8" }).addTo(map);
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
    lineOptions: { styles: [{ color: "#2563eb", weight: 5 }] },
  }).addTo(map);

  routingControl.on("routesfound", () => clearFallback(map));
  routingControl.on("routingerror", () => {
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
}
