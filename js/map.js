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

// iOSでホーム画面に追加したアプリ(スタンドアロン起動)かどうか。
// この状態だとGeolocationが許可設定に関わらず動作しないWebKitの既知の制限があるため、
// 位置情報エラー時にSafariで開き直すよう案内する。
function isIosStandalone() {
  return window.navigator.standalone === true;
}

function describeGeolocationError(err) {
  const standaloneHint = isIosStandalone()
    ? " ホーム画面から起動したアプリでは位置情報が使えない場合があります。Safariで直接このページを開いてお試しください。"
    : "";
  switch (err.code) {
    case err.PERMISSION_DENIED:
      return `位置情報が許可されていません。端末の設定アプリ→プライバシーとセキュリティ→位置情報サービスでSafari(またはこのアプリ)の許可を確認してください。${standaloneHint}`;
    case err.POSITION_UNAVAILABLE:
      return `現在地を取得できません。端末の位置情報サービスがオンになっているか確認してください。${standaloneHint}`;
    case err.TIMEOUT:
      return "現在地の取得がタイムアウトしました。電波状況の良い場所で再度お試しください。";
    default:
      return `位置情報を取得できませんでした: ${err.message}${standaloneHint}`;
  }
}

export function locateOnce(map, onStatus) {
  if (!navigator.geolocation) {
    onStatus("この端末では位置情報がサポートされていません");
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      map.setView([pos.coords.latitude, pos.coords.longitude], DEFAULT_ZOOM);
      onStatus("");
    },
    (err) => onStatus(describeGeolocationError(err)),
    { enableHighAccuracy: true, timeout: 10000 }
  );
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
      (err) => onStatus(describeGeolocationError(err)),
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
