const OSRM_PROFILES = {
  walk: "foot",
  car: "driving",
};

let routingControl = null;
let fallbackLine = null;

export function buildOrderedPoints(route) {
  const start = route.points.find((p) => p.type === "start");
  const rest = route.points
    .filter((p) => p.type !== "start")
    .sort((a, b) => a.order - b.order);
  if (!start) return rest;
  return [start, ...rest, start];
}

function clearLayers(map) {
  if (routingControl) {
    map.removeControl(routingControl);
    routingControl = null;
  }
  if (fallbackLine) {
    map.removeLayer(fallbackLine);
    fallbackLine = null;
  }
}

function drawFallbackLine(map, latlngs) {
  fallbackLine = L.polyline(latlngs, { color: "#2563eb", weight: 4, dashArray: "6 8" }).addTo(map);
}

export function drawRoute(map, route) {
  clearLayers(map);
  const ordered = buildOrderedPoints(route);
  if (ordered.length < 2) return;

  const latlngs = ordered.map((p) => L.latLng(p.lat, p.lng));
  const profile = OSRM_PROFILES[route.transportMode] || "foot";

  routingControl = L.Routing.control({
    waypoints: latlngs,
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
  });

  routingControl.on("routingerror", () => {
    map.removeControl(routingControl);
    routingControl = null;
    drawFallbackLine(map, latlngs);
  });

  routingControl.addTo(map);
}

export function clearRoute(map) {
  clearLayers(map);
}
