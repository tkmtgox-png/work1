const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

const TOURISM_TAGS = "attraction|museum|zoo|aquarium|gallery|theme_park|viewpoint|artwork";
const HISTORIC_TAGS = "castle|monument|memorial|shrine|temple|ruins";

const RESULT_LIMIT = 60;
const FETCH_TIMEOUT_MS = 15000;

function buildQuery(lat, lng, radiusKm) {
  const radiusMeters = Math.round(radiusKm * 1000);
  const around = `around:${radiusMeters},${lat},${lng}`;
  return `[out:json][timeout:12];(
    node["tourism"~"${TOURISM_TAGS}"](${around});
    way["tourism"~"${TOURISM_TAGS}"](${around});
    node["historic"~"${HISTORIC_TAGS}"](${around});
    way["historic"~"${HISTORIC_TAGS}"](${around});
    node["amenity"="place_of_worship"](${around});
    way["amenity"="place_of_worship"](${around});
  );out center tags ${RESULT_LIMIT};`;
}

export function genreFromTags(tags) {
  if (!tags) return "観光スポット";
  if (tags.tourism === "museum") return "博物館";
  if (tags.tourism === "zoo") return "動物園";
  if (tags.tourism === "aquarium") return "水族館";
  if (tags.tourism === "gallery") return "美術館";
  if (tags.tourism === "theme_park") return "テーマパーク";
  if (tags.tourism === "viewpoint") return "展望スポット";
  if (tags.tourism === "artwork") return "アート・記念碑";
  if (tags.historic === "castle") return "城";
  if (tags.historic === "monument" || tags.historic === "memorial") return "記念碑";
  if (tags.historic === "ruins") return "史跡";
  if (tags.historic === "shrine") return "神社";
  if (tags.historic === "temple") return "寺";
  if (tags.amenity === "place_of_worship") {
    if (tags.religion === "shinto") return "神社";
    if (tags.religion === "buddhist") return "寺";
    return "宗教施設";
  }
  if (tags.tourism === "attraction") return "観光名所";
  return "観光スポット";
}

export async function searchNearby(centerLatLng, radiusKm) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(OVERPASS_URL, {
      method: "POST",
      body: `data=${encodeURIComponent(buildQuery(centerLatLng.lat, centerLatLng.lng, radiusKm))}`,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      signal: controller.signal,
    });
    if (!res.ok) return [];
    const data = await res.json();
    const results = [];
    for (const el of data.elements || []) {
      const name = el.tags && el.tags.name;
      if (!name) continue;
      const lat = el.type === "node" ? el.lat : el.center && el.center.lat;
      const lng = el.type === "node" ? el.lon : el.center && el.center.lon;
      if (lat == null || lng == null) continue;
      results.push({ name, lat, lng, genre: genreFromTags(el.tags) });
    }
    return results;
  } catch {
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
}
