const REVERSE_URL = "https://nominatim.openstreetmap.org/reverse";
const SEARCH_URL = "https://nominatim.openstreetmap.org/search";

export async function reverseGeocode(lat, lng) {
  const url = `${REVERSE_URL}?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&accept-language=ja`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`reverse geocode failed: ${res.status}`);
  const data = await res.json();
  return extractName(data);
}

// 地名・住所から座標を検索する(順ジオコーディング)。地図移動用の候補一覧表示に使う。
export async function searchPlaces(query) {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const url = `${SEARCH_URL}?format=jsonv2&q=${encodeURIComponent(trimmed)}&accept-language=ja&limit=5`;
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return [];
    const data = await res.json();
    return data.map((item) => ({
      label: firstAltName(item.display_name || ""),
      lat: Number(item.lat),
      lng: Number(item.lon),
    }));
  } catch {
    return [];
  }
}

function extractName(data) {
  if (data.name) return firstAltName(data.name);
  const addr = data.address || {};
  const candidates = [
    addr.amenity,
    addr.shop,
    addr.tourism,
    addr.leisure,
    addr.building,
    addr.road,
    addr.neighbourhood,
    addr.suburb,
  ];
  const found = candidates.find((v) => v);
  if (found) return firstAltName(found);
  if (data.display_name) return firstAltName(data.display_name.split(",")[0]);
  return "";
}

// OSMのname タグは "名前A;名前B" のように複数名がセミコロン区切りで入ることがあるため先頭のみ使う
function firstAltName(name) {
  return name.split(";")[0].trim();
}
