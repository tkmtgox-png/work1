import { getAllRoutes, saveRoute, deleteRoute, createEmptyRoute } from "./storage.js";
import { newPoint, makeDivIcon, renderPointList } from "./points.js";
import { initMap, createLocationTracker } from "./map.js";
import { drawRoute, clearRoute } from "./routing.js";
import { reverseGeocode } from "./geocode.js";

const els = {
  panel: document.getElementById("panel"),
  panelToggle: document.getElementById("panel-toggle"),
  panelClose: document.getElementById("panel-close"),
  routeSelect: document.getElementById("route-select"),
  newRouteBtn: document.getElementById("new-route-btn"),
  renameRouteBtn: document.getElementById("rename-route-btn"),
  deleteRouteBtn: document.getElementById("delete-route-btn"),
  transportMode: document.getElementById("transport-mode"),
  pointList: document.getElementById("point-list"),
  trackToggle: document.getElementById("track-location-toggle"),
  locationStatus: document.getElementById("location-status"),
  modal: document.getElementById("point-modal"),
  modalTitle: document.getElementById("point-modal-title"),
  form: document.getElementById("point-form"),
  typeSelect: document.getElementById("point-type"),
  nameInput: document.getElementById("point-name"),
  memoInput: document.getElementById("point-memo"),
  arrivalInput: document.getElementById("point-arrival"),
  deleteBtn: document.getElementById("point-delete-btn"),
  cancelBtn: document.getElementById("point-cancel-btn"),
};

let map;
let routes = [];
let currentRoute = null;
let markers = new Map();
let pendingLatLng = null;
let editingPointId = null;
let locationTracker;
let geocodeToken = 0;

async function init() {
  map = initMap("map");
  locationTracker = createLocationTracker(map);

  routes = await getAllRoutes();
  if (routes.length === 0) {
    const route = createEmptyRoute("ルート1");
    await saveRoute(route);
    routes = [route];
  }
  currentRoute = routes[0];

  bindUI();
  refreshRouteSelect();
  renderAll();
  registerServiceWorker();
}

function bindUI() {
  els.panelToggle.addEventListener("click", () => els.panel.classList.add("open"));
  els.panelClose.addEventListener("click", () => els.panel.classList.remove("open"));

  map.on("click", (e) => openPointModal({ mode: "add", latlng: e.latlng }));

  els.routeSelect.addEventListener("change", () => {
    currentRoute = routes.find((r) => r.id === els.routeSelect.value);
    renderAll();
  });

  els.newRouteBtn.addEventListener("click", async () => {
    const name = prompt("新しいルート名を入力してください", `ルート${routes.length + 1}`);
    if (!name) return;
    const route = createEmptyRoute(name);
    await saveRoute(route);
    routes.push(route);
    currentRoute = route;
    refreshRouteSelect();
    renderAll();
  });

  els.renameRouteBtn.addEventListener("click", async () => {
    const name = prompt("ルート名を入力してください", currentRoute.name);
    if (!name) return;
    currentRoute.name = name;
    await saveRoute(currentRoute);
    refreshRouteSelect();
  });

  els.deleteRouteBtn.addEventListener("click", async () => {
    if (routes.length <= 1) {
      alert("最後の1件のルートは削除できません");
      return;
    }
    if (!confirm(`「${currentRoute.name}」を削除しますか？`)) return;
    await deleteRoute(currentRoute.id);
    routes = routes.filter((r) => r.id !== currentRoute.id);
    currentRoute = routes[0];
    refreshRouteSelect();
    renderAll();
  });

  els.transportMode.addEventListener("change", async () => {
    currentRoute.transportMode = els.transportMode.value;
    await saveRoute(currentRoute);
    renderRoute();
  });

  els.typeSelect.addEventListener("change", () => {
    if (els.typeSelect.value === "start") {
      els.nameInput.value = "起点";
    }
  });

  els.form.addEventListener("submit", handlePointFormSubmit);
  els.cancelBtn.addEventListener("click", closePointModal);
  els.deleteBtn.addEventListener("click", handlePointDelete);

  els.trackToggle.addEventListener("change", () => {
    if (els.trackToggle.checked) {
      locationTracker.start((msg) => (els.locationStatus.textContent = msg));
    } else {
      locationTracker.stop();
      els.locationStatus.textContent = "";
    }
  });
}

function refreshRouteSelect() {
  els.routeSelect.innerHTML = "";
  for (const route of routes) {
    const opt = document.createElement("option");
    opt.value = route.id;
    opt.textContent = route.name;
    if (route.id === currentRoute.id) opt.selected = true;
    els.routeSelect.appendChild(opt);
  }
  els.transportMode.value = currentRoute.transportMode;
}

function renderAll() {
  renderMarkers();
  renderRoute();
  renderPointList(els.pointList, currentRoute, {
    onSelect: (pointId) => {
      const point = currentRoute.points.find((p) => p.id === pointId);
      if (point) openPointModal({ mode: "edit", point });
    },
  });
}

function renderMarkers() {
  for (const marker of markers.values()) map.removeLayer(marker);
  markers.clear();

  for (const point of currentRoute.points) {
    const marker = L.marker([point.lat, point.lng], { icon: makeDivIcon(point.type) }).addTo(map);
    marker.on("click", () => openPointModal({ mode: "edit", point }));
    markers.set(point.id, marker);
  }
}

function renderRoute() {
  if (currentRoute.points.length < 2) {
    clearRoute(map);
    return;
  }
  drawRoute(map, currentRoute);
}

function openPointModal({ mode, point, latlng }) {
  editingPointId = mode === "edit" ? point.id : null;
  pendingLatLng = mode === "add" ? latlng : null;

  els.modalTitle.textContent = mode === "add" ? "ポイントを追加" : "ポイントの詳細";
  els.typeSelect.value = mode === "edit" ? point.type : "waypoint";
  els.nameInput.value = mode === "edit" ? point.name : "";
  els.memoInput.value = mode === "edit" ? point.memo : "";
  els.arrivalInput.value = mode === "edit" ? point.arrivalTime : "";
  els.deleteBtn.classList.toggle("hidden", mode !== "edit");

  els.modal.classList.remove("hidden");
  els.nameInput.focus();

  if (mode === "add") {
    fillNameFromMap(latlng);
  }
}

async function fillNameFromMap(latlng) {
  const token = ++geocodeToken;
  let name = "";
  try {
    name = await reverseGeocode(latlng.lat, latlng.lng);
  } catch {
    return;
  }
  if (!name || token !== geocodeToken) return;
  if (els.modal.classList.contains("hidden")) return;
  if (els.nameInput.value.trim() !== "") return;
  els.nameInput.value = name;
}

function closePointModal() {
  els.modal.classList.add("hidden");
  els.form.reset();
  editingPointId = null;
  pendingLatLng = null;
}

async function handlePointFormSubmit(e) {
  e.preventDefault();
  const type = els.typeSelect.value;
  const name = els.nameInput.value.trim();
  const memo = els.memoInput.value.trim();
  const arrivalTime = els.arrivalInput.value;

  if (type === "start" && currentRoute.points.some((p) => p.type === "start" && p.id !== editingPointId)) {
    alert("起点は1ルートにつき1つまでです。既存の起点の種類を変更してから追加してください。");
    return;
  }

  if (editingPointId) {
    const point = currentRoute.points.find((p) => p.id === editingPointId);
    Object.assign(point, { type, name, memo, arrivalTime });
  } else {
    const order = currentRoute.points.length;
    const point = newPoint({ type, name, memo, lat: pendingLatLng.lat, lng: pendingLatLng.lng, arrivalTime, order });
    currentRoute.points.push(point);
  }

  await saveRoute(currentRoute);
  closePointModal();
  renderAll();
}

async function handlePointDelete() {
  if (!editingPointId) return;
  if (!confirm("このポイントを削除しますか？")) return;
  currentRoute.points = currentRoute.points.filter((p) => p.id !== editingPointId);
  await saveRoute(currentRoute);
  closePointModal();
  renderAll();
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

init();
