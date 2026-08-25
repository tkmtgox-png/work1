import { travelMinutes } from "./route-search.js";
import { buildOrderedPoints } from "./routing.js";

export const POINT_TYPES = {
  start: { label: "起点", color: "#16a34a", icon: "🏠", defaultStayMinutes: 0 },
  waypoint: { label: "経由地", color: "#6b7280", icon: "📍", defaultStayMinutes: 0 },
  sightseeing: { label: "観光スポット", color: "#f59e0b", icon: "📷", defaultStayMinutes: 30 },
  meal: { label: "食事", color: "#ef4444", icon: "🍴", defaultStayMinutes: 60 },
};

export function newPoint({ type, name, memo, lat, lng, arrivalTime, order, stayMinutes, included, popularity, genre, locked }) {
  const meta = POINT_TYPES[type] || POINT_TYPES.waypoint;
  return {
    id: crypto.randomUUID(),
    type,
    name,
    memo: memo || "",
    lat,
    lng,
    order,
    arrivalTime: arrivalTime || "",
    stayMinutes: stayMinutes ?? meta.defaultStayMinutes,
    included: included ?? true,
    popularity: popularity ?? 3,
    genre: genre || "",
    locked: locked ?? false,
  };
}

export function starString(popularity) {
  const n = Math.min(5, Math.max(1, Number(popularity) || 3));
  return "★".repeat(n) + "☆".repeat(5 - n);
}

export function makeDivIcon(type) {
  const meta = POINT_TYPES[type] || POINT_TYPES.waypoint;
  return L.divIcon({
    className: "",
    html: `<div class="leaflet-div-icon-marker" style="background:${meta.color}">${meta.icon}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -15],
  });
}

export function renderPointList(container, route, { onSelect }) {
  container.innerHTML = "";
  if (!route || route.points.length === 0) {
    const li = document.createElement("li");
    li.textContent = "まだポイントがありません";
    li.style.cursor = "default";
    container.appendChild(li);
    return;
  }
  // buildOrderedPointsは起点がある場合、配列の先頭と末尾に同じ起点を重複させて返す(戻りの経路のため)。
  // 一覧の各行には「そこへ向かう」移動時間だけを表示したいので、末尾の戻り起点は計算対象から除く。
  const ordered = buildOrderedPoints(route);
  const hasStartWrap = ordered.length > 1 && ordered[0] === ordered[ordered.length - 1];
  const lastIndex = hasStartWrap ? ordered.length - 2 : ordered.length - 1;
  const travelByPointId = new Map();
  for (let i = 1; i <= lastIndex; i++) {
    const point = ordered[i];
    travelByPointId.set(point.id, travelMinutes(ordered[i - 1], point, route.transportMode));
  }

  const sorted = [...route.points].sort((a, b) => a.order - b.order);
  for (const point of sorted) {
    const meta = POINT_TYPES[point.type] || POINT_TYPES.waypoint;
    const included = point.included !== false;
    const li = document.createElement("li");
    li.className = included ? "" : "excluded";
    const travelMin = travelByPointId.get(point.id);
    const travelLabel = travelMin != null ? `移動約${Math.round(travelMin)}分` : "";
    const popularity = point.type === "sightseeing" ? starString(point.popularity) : "";
    const genreLabel = point.genre ? ` ・ ${escapeHtml(point.genre)}` : "";
    li.innerHTML = `
      <span class="badge" style="background:${meta.color}">${meta.icon}</span>
      <span class="name">${escapeHtml(point.name || meta.label)}${popularity ? ` <span class="popularity">${popularity}${genreLabel}</span>` : ""}</span>
      <span class="arrival">${[point.arrivalTime, travelLabel].filter(Boolean).join(" / ")}</span>
    `;
    li.addEventListener("click", () => onSelect(point.id));
    container.appendChild(li);
  }
}

export function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}
