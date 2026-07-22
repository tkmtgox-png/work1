export const POINT_TYPES = {
  start: { label: "起点", color: "#16a34a", icon: "🏠" },
  waypoint: { label: "経由地", color: "#6b7280", icon: "📍" },
  sightseeing: { label: "観光スポット", color: "#f59e0b", icon: "📷" },
  meal: { label: "食事", color: "#ef4444", icon: "🍴" },
};

export function newPoint({ type, name, memo, lat, lng, arrivalTime, order }) {
  return {
    id: crypto.randomUUID(),
    type,
    name,
    memo: memo || "",
    lat,
    lng,
    order,
    arrivalTime: arrivalTime || "",
  };
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
  const sorted = [...route.points].sort((a, b) => a.order - b.order);
  for (const point of sorted) {
    const meta = POINT_TYPES[point.type] || POINT_TYPES.waypoint;
    const li = document.createElement("li");
    li.innerHTML = `
      <span class="badge" style="background:${meta.color}">${meta.icon}</span>
      <span class="name">${escapeHtml(point.name || meta.label)}</span>
      <span class="arrival">${point.arrivalTime || ""}</span>
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
