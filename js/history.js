import { escapeHtml } from "./points.js";

export function newHistoryEntry({ timestamp, memo }) {
  return {
    id: crypto.randomUUID(),
    timestamp,
    memo: memo || "",
  };
}

export function formatDateTime(timestamp) {
  return new Date(timestamp).toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function renderHistoryList(container, route, { onSelect }) {
  container.innerHTML = "";
  const history = (route && route.history) || [];
  if (history.length === 0) {
    const li = document.createElement("li");
    li.textContent = "まだ記録がありません";
    li.style.cursor = "default";
    container.appendChild(li);
    return;
  }

  const sorted = [...history].sort((a, b) => b.timestamp - a.timestamp);
  for (const entry of sorted) {
    const li = document.createElement("li");
    li.innerHTML = `
      <span class="name">${formatDateTime(entry.timestamp)}</span>
      <span class="arrival">${entry.memo ? escapeHtml(entry.memo) : ""}</span>
    `;
    li.addEventListener("click", () => onSelect(entry.id));
    container.appendChild(li);
  }
}
