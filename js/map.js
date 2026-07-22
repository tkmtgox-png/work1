const DEFAULT_CENTER = [35.681236, 139.767125]; // 東京駅
const DEFAULT_ZOOM = 15;

export function initMap(elementId) {
  const map = L.map(elementId, { zoomControl: false }).setView(DEFAULT_CENTER, DEFAULT_ZOOM);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);
  L.control.zoom({ position: "bottomright" }).addTo(map);

  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => map.setView([pos.coords.latitude, pos.coords.longitude], DEFAULT_ZOOM),
      () => {},
      { timeout: 5000 }
    );
  }

  return map;
}

export function createLocationTracker(map) {
  let marker = null;
  let watchId = null;

  function start(onStatus) {
    if (!navigator.geolocation) {
      onStatus("この端末では位置情報がサポートされていません");
      return;
    }
    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const latlng = [pos.coords.latitude, pos.coords.longitude];
        if (!marker) {
          marker = L.marker(latlng, {
            icon: L.divIcon({
              className: "",
              html: '<div class="current-location-dot"></div>',
              iconSize: [16, 16],
              iconAnchor: [8, 8],
            }),
            zIndexOffset: 1000,
          }).addTo(map);
        } else {
          marker.setLatLng(latlng);
        }
        onStatus("");
      },
      (err) => onStatus(`位置情報を取得できませんでした: ${err.message}`),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );
  }

  function stop() {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }
    if (marker) {
      map.removeLayer(marker);
      marker = null;
    }
  }

  return { start, stop };
}
