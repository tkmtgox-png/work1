import { getAllRoutes, saveRoute, deleteRoute, createEmptyRoute } from "./storage.js";
import { POINT_TYPES, newPoint, makeDivIcon, renderPointList, starString, escapeHtml } from "./points.js";
import { initMap, createLocationTracker, locateOnce } from "./map.js";
import { drawRoute, clearRoute } from "./routing.js";
import { reverseGeocode, searchPlaces } from "./geocode.js";
import { getFeasibleCandidates, estimateSearchRadiusKm, travelMinutes, haversineKm, optimizeVisitOrder } from "./route-search.js";
import { searchNearby } from "./nearby-search.js";

const els = {
  panel: document.getElementById("panel"),
  panelToggle: document.getElementById("panel-toggle"),
  panelClose: document.getElementById("panel-close"),
  placeSearchForm: document.getElementById("place-search"),
  placeSearchInput: document.getElementById("place-search-input"),
  placeSearchResults: document.getElementById("place-search-results"),
  locateBtn: document.getElementById("locate-btn"),
  routeSelect: document.getElementById("route-select"),
  newRouteBtn: document.getElementById("new-route-btn"),
  renameRouteBtn: document.getElementById("rename-route-btn"),
  deleteRouteBtn: document.getElementById("delete-route-btn"),
  transportMode: document.getElementById("transport-mode"),
  desiredMinutes: document.getElementById("desired-minutes"),
  routeSearchBtn: document.getElementById("route-search-btn"),
  routeSearchModal: document.getElementById("route-search-modal"),
  routeSearchCloseBtn: document.getElementById("route-search-close"),
  routeSearchGenreFilter: document.getElementById("route-search-genre-filter"),
  routeSearchProgress: document.getElementById("route-search-progress"),
  routeSearchCandidates: document.getElementById("route-search-candidates"),
  routeSearchEmpty: document.getElementById("route-search-empty"),
  routeSearchFinishBtn: document.getElementById("route-search-finish"),
  pointList: document.getElementById("point-list"),
  optimizeOrderBtn: document.getElementById("optimize-order-btn"),
  trackToggle: document.getElementById("track-location-toggle"),
  locationStatus: document.getElementById("location-status"),
  modal: document.getElementById("point-modal"),
  modalTitle: document.getElementById("point-modal-title"),
  form: document.getElementById("point-form"),
  typeSelect: document.getElementById("point-type"),
  nameInput: document.getElementById("point-name"),
  memoInput: document.getElementById("point-memo"),
  arrivalInput: document.getElementById("point-arrival"),
  arrivalDisplay: document.getElementById("point-arrival-display"),
  arrivalClockBtn: document.getElementById("point-arrival-clock"),
  stayInput: document.getElementById("point-stay"),
  includedInput: document.getElementById("point-included"),
  lockedInput: document.getElementById("point-locked"),
  popularityInput: document.getElementById("point-popularity"),
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
let stayTouched = false;
let routeSearch = null; // { currentPos: {lat,lng}, usedMinutes: number, nextOrder: number }
let candidateToken = 0;
let searchResultMarker = null;
let placeSearchToken = 0;

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

  if (els.trackToggle.checked) {
    locationTracker.start((msg) => (els.locationStatus.textContent = msg));
  }
}

function focusOnRouteStart(route) {
  const start = route.points.find((p) => p.type === "start");
  if (start) map.setView([start.lat, start.lng], 15);
}

function bindUI() {
  els.panelToggle.addEventListener("click", () => {
    els.panel.classList.add("open");
    els.placeSearchForm.classList.add("hidden");
    els.placeSearchResults.classList.add("hidden");
  });
  els.panelClose.addEventListener("click", () => {
    els.panel.classList.remove("open");
    els.placeSearchForm.classList.remove("hidden");
  });

  map.on("click", (e) => {
    clearSearchResultMarker();
    openPointModal({ mode: "add", latlng: e.latlng });
  });

  els.placeSearchForm.addEventListener("submit", handlePlaceSearch);
  document.addEventListener("click", (e) => {
    if (els.placeSearchResults.classList.contains("hidden")) return;
    if (els.placeSearchForm.contains(e.target) || els.placeSearchResults.contains(e.target)) return;
    els.placeSearchResults.classList.add("hidden");
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") els.placeSearchResults.classList.add("hidden");
  });

  els.routeSelect.addEventListener("change", () => {
    currentRoute = routes.find((r) => r.id === els.routeSelect.value);
    renderAll();
    focusOnRouteStart(currentRoute);
  });

  els.newRouteBtn.addEventListener("click", async () => {
    const name = prompt("新しいルート名を入力してください", `ルート${routes.length + 1}`);
    if (!name) return;
    await createAndSwitchToNewRoute(name);
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
    focusOnRouteStart(currentRoute);
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
    if (!stayTouched) {
      const meta = POINT_TYPES[els.typeSelect.value];
      els.stayInput.value = meta ? meta.defaultStayMinutes : 0;
    }
  });
  els.stayInput.addEventListener("input", () => {
    stayTouched = true;
  });

  els.arrivalDisplay.addEventListener("click", () => {
    els.arrivalInput.value = nowHHMM();
    updateArrivalDisplay();
  });
  els.arrivalClockBtn.addEventListener("click", () => {
    if (typeof els.arrivalInput.showPicker === "function") {
      els.arrivalInput.showPicker();
    } else {
      els.arrivalInput.focus();
    }
  });
  els.arrivalInput.addEventListener("input", updateArrivalDisplay);
  els.arrivalInput.addEventListener("change", updateArrivalDisplay);

  els.form.addEventListener("submit", handlePointFormSubmit);
  els.cancelBtn.addEventListener("click", closePointModal);
  els.deleteBtn.addEventListener("click", handlePointDelete);

  els.desiredMinutes.addEventListener("change", async () => {
    const value = Number(els.desiredMinutes.value);
    currentRoute.desiredMinutes = value > 0 ? value : null;
    await saveRoute(currentRoute);
  });

  els.routeSearchBtn.addEventListener("click", openRouteSearch);
  els.routeSearchFinishBtn.addEventListener("click", closeRouteSearch);
  els.routeSearchCloseBtn.addEventListener("click", closeRouteSearch);
  els.routeSearchGenreFilter.addEventListener("change", renderFilteredCandidates);
  els.optimizeOrderBtn.addEventListener("click", handleOptimizeOrder);

  els.trackToggle.addEventListener("change", () => {
    if (els.trackToggle.checked) {
      locationTracker.start((msg) => (els.locationStatus.textContent = msg));
    } else {
      locationTracker.stop();
      els.locationStatus.textContent = "";
    }
  });

  els.locateBtn.addEventListener("click", () => {
    locateOnce(map, (msg) => (els.locationStatus.textContent = msg));
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
  els.desiredMinutes.value = currentRoute.desiredMinutes || "";
}

async function createAndSwitchToNewRoute(name) {
  const route = createEmptyRoute(name);
  await saveRoute(route);
  routes.push(route);
  currentRoute = route;
  refreshRouteSelect();
  renderAll();
  focusOnRouteStart(currentRoute);
}

function renderAll() {
  renderMarkers();
  renderRoute();
  renderPointList(els.pointList, currentRoute, {
    onSelect: (pointId) => {
      const point = currentRoute.points.find((p) => p.id === pointId);
      if (!point) return;
      map.setView([point.lat, point.lng], 17);
      markers.get(point.id)?.bindPopup(escapeHtml(point.name || "")).openPopup();
    },
  });
}

function renderMarkers() {
  for (const marker of markers.values()) map.removeLayer(marker);
  markers.clear();

  for (const point of currentRoute.points) {
    const marker = L.marker([point.lat, point.lng], { icon: makeDivIcon(point.type) }).addTo(map);
    if (point.included === false) {
      marker.getElement()?.classList.add("marker-excluded");
    }
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

function openPointModal({ mode, point, latlng, defaultType, defaultName }) {
  editingPointId = mode === "edit" ? point.id : null;
  pendingLatLng = mode === "add" ? latlng : null;
  stayTouched = false;

  els.modalTitle.textContent = mode === "add" ? "ポイントを追加" : "ポイントの詳細";
  els.typeSelect.value = mode === "edit" ? point.type : defaultType || "waypoint";
  els.nameInput.value = mode === "edit" ? point.name : defaultName || "";
  els.memoInput.value = mode === "edit" ? point.memo : "";
  els.arrivalInput.value = mode === "edit" ? point.arrivalTime : "";
  updateArrivalDisplay();
  els.stayInput.value = mode === "edit" ? point.stayMinutes : POINT_TYPES[els.typeSelect.value].defaultStayMinutes;
  els.includedInput.checked = mode === "edit" ? point.included !== false : true;
  els.lockedInput.checked = mode === "edit" ? point.locked === true : false;
  els.popularityInput.value = mode === "edit" ? point.popularity : 3;
  els.deleteBtn.classList.toggle("hidden", mode !== "edit");

  els.modal.classList.remove("hidden");
  els.nameInput.focus();

  if (mode === "add" && !defaultName) {
    fillNameFromMap(latlng);
  }
}

function nowHHMM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function updateArrivalDisplay() {
  els.arrivalDisplay.textContent = els.arrivalInput.value || "未設定";
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

async function handlePlaceSearch(e) {
  e.preventDefault();
  const query = els.placeSearchInput.value.trim();
  if (!query) return;

  const token = ++placeSearchToken;
  els.placeSearchResults.classList.remove("hidden");
  els.placeSearchResults.innerHTML = '<li class="search-status">検索中…</li>';

  const results = await searchPlaces(query);
  if (token !== placeSearchToken) return;

  els.placeSearchResults.innerHTML = "";
  if (results.length === 0) {
    els.placeSearchResults.innerHTML = '<li class="search-status">見つかりませんでした</li>';
    return;
  }
  for (const result of results) {
    const li = document.createElement("li");
    li.textContent = result.label;
    li.addEventListener("click", () => selectPlaceResult(result));
    els.placeSearchResults.appendChild(li);
  }
}

function selectPlaceResult(result) {
  map.setView([result.lat, result.lng], 17);
  clearSearchResultMarker();
  searchResultMarker = L.marker([result.lat, result.lng])
    .addTo(map)
    .bindPopup(buildSearchResultPopup(result))
    .openPopup();
  els.placeSearchResults.classList.add("hidden");
  els.placeSearchInput.value = "";
}

function buildSearchResultPopup(result) {
  const container = document.createElement("div");
  const label = document.createElement("div");
  label.textContent = result.label;
  container.appendChild(label);

  const hasStart = currentRoute.points.some((p) => p.type === "start");

  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "popup-add-point-btn";
  addBtn.textContent = hasStart ? "観光スポットとして追加" : "ポイントとして追加";
  addBtn.addEventListener("click", () => {
    openPointModal({
      mode: "add",
      latlng: { lat: result.lat, lng: result.lng },
      defaultType: hasStart ? "sightseeing" : "start",
      defaultName: result.name,
    });
  });
  container.appendChild(addBtn);

  if (hasStart) {
    const newRouteBtn = document.createElement("button");
    newRouteBtn.type = "button";
    newRouteBtn.className = "popup-add-point-btn";
    newRouteBtn.textContent = "新しいルートの起点として追加";
    newRouteBtn.addEventListener("click", async () => {
      await createAndSwitchToNewRoute(`ルート${routes.length + 1}`);
      openPointModal({
        mode: "add",
        latlng: { lat: result.lat, lng: result.lng },
        defaultType: "start",
        defaultName: result.name,
      });
    });
    container.appendChild(newRouteBtn);
  }

  return container;
}

function clearSearchResultMarker() {
  if (searchResultMarker) {
    map.removeLayer(searchResultMarker);
    searchResultMarker = null;
  }
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
  const stayMinutes = Number(els.stayInput.value) || 0;
  const included = els.includedInput.checked;
  const locked = els.lockedInput.checked;
  const popularity = Number(els.popularityInput.value) || 3;

  if (type === "start" && currentRoute.points.some((p) => p.type === "start" && p.id !== editingPointId)) {
    alert("起点は1ルートにつき1つまでです。既存の起点の種類を変更してから追加してください。");
    return;
  }

  if (editingPointId) {
    const point = currentRoute.points.find((p) => p.id === editingPointId);
    Object.assign(point, { type, name, memo, arrivalTime, stayMinutes, included, locked, popularity });
  } else {
    const order = currentRoute.points.length;
    const point = newPoint({
      type,
      name,
      memo,
      lat: pendingLatLng.lat,
      lng: pendingLatLng.lng,
      arrivalTime,
      order,
      stayMinutes,
      included,
      locked,
      popularity,
    });
    currentRoute.points.push(point);
  }

  await saveRoute(currentRoute);
  closePointModal();
  clearSearchResultMarker();
  renderAll();
}

async function openRouteSearch() {
  const minutes = Number(els.desiredMinutes.value);
  if (!minutes || minutes <= 0) {
    alert("希望時間(分)を入力してください");
    return;
  }
  const start = currentRoute.points.find((p) => p.type === "start");
  if (!start) {
    alert("先に起点を登録してください");
    return;
  }

  currentRoute.desiredMinutes = minutes;
  for (const p of currentRoute.points) {
    if (p.type === "sightseeing") p.included = p.locked === true;
  }

  const mandatoryOrders = currentRoute.points
    .filter((p) => p.type === "waypoint" || p.type === "meal")
    .map((p) => p.order);
  let nextOrder = (mandatoryOrders.length ? Math.max(...mandatoryOrders) : -1) + 1;

  // 固定ポイントは時間判定・リセットの対象外で必ずルートに残る。起点からの巡回順を
  // optimizeVisitOrderで概算し、そのぶんの移動時間・現在地を対話式検索の初期値にする。
  const lockedPoints = currentRoute.points.filter((p) => p.type === "sightseeing" && p.locked);
  const lockedOrder = optimizeVisitOrder(start, lockedPoints);
  let currentPos = { lat: start.lat, lng: start.lng };
  let usedMinutes = 0;
  for (const point of lockedOrder) {
    usedMinutes += travelMinutes(currentPos, point, currentRoute.transportMode);
    point.order = nextOrder++;
    currentPos = { lat: point.lat, lng: point.lng };
  }

  await saveRoute(currentRoute);
  renderAll();

  routeSearch = {
    currentPos,
    usedMinutes,
    nextOrder,
    lastMerged: [],
  };

  els.routeSearchGenreFilter.value = "";
  els.routeSearchModal.classList.remove("hidden");
  renderCandidateList();
}

function isNearExistingPoint(candidate, points) {
  return points.some((p) => haversineKm(candidate, p) < 0.03);
}

async function renderCandidateList() {
  if (!routeSearch) return;
  const token = ++candidateToken;

  const remaining = Math.max(0, currentRoute.desiredMinutes - routeSearch.usedMinutes);
  els.routeSearchProgress.textContent = `使用時間 約${Math.round(routeSearch.usedMinutes)}分 / 希望${currentRoute.desiredMinutes}分(残り約${Math.round(remaining)}分、起点への戻り時間を含みます)`;

  els.routeSearchEmpty.classList.add("hidden");
  els.routeSearchCandidates.innerHTML = '<li class="candidate-loading">周辺を検索中…</li>';

  const registered = getFeasibleCandidates(currentRoute, routeSearch.currentPos, routeSearch.usedMinutes).map(
    (c) => ({
      source: "registered",
      point: c.point,
      name: c.point.name,
      popularity: c.point.popularity,
      genre: c.point.genre,
      travelFromCurrent: c.travelFromCurrent,
    })
  );

  const start = currentRoute.points.find((p) => p.type === "start");
  const radiusKm = estimateSearchRadiusKm(remaining, currentRoute.transportMode);
  const nearby = await searchNearby(routeSearch.currentPos, radiusKm);

  if (token !== candidateToken) return; // 別の操作(候補選択・検索終了など)が割り込んだ

  const osmCandidates = nearby
    .filter((n) => !isNearExistingPoint(n, currentRoute.points))
    .map((n) => {
      const travelFromCurrent = travelMinutes(routeSearch.currentPos, n, currentRoute.transportMode);
      const backToStart = travelMinutes(n, start, currentRoute.transportMode);
      return {
        source: "osm",
        name: n.name,
        lat: n.lat,
        lng: n.lng,
        genre: n.genre,
        travelFromCurrent,
        totalIfChosen: routeSearch.usedMinutes + travelFromCurrent + backToStart,
      };
    })
    .filter((c) => c.totalIfChosen <= currentRoute.desiredMinutes);

  const merged = [...registered, ...osmCandidates].sort((a, b) => a.travelFromCurrent - b.travelFromCurrent);
  routeSearch.lastMerged = merged;

  updateGenreFilterOptions(merged);
  renderFilteredCandidates();
}

function updateGenreFilterOptions(merged) {
  const previous = els.routeSearchGenreFilter.value;
  const genres = [...new Set(merged.map((c) => c.genre).filter(Boolean))];

  els.routeSearchGenreFilter.innerHTML = '<option value="">すべて</option>';
  for (const genre of genres) {
    const opt = document.createElement("option");
    opt.value = genre;
    opt.textContent = genre;
    els.routeSearchGenreFilter.appendChild(opt);
  }
  els.routeSearchGenreFilter.value = genres.includes(previous) ? previous : "";
}

function renderFilteredCandidates() {
  if (!routeSearch) return;
  const merged = routeSearch.lastMerged;
  const genre = els.routeSearchGenreFilter.value;
  const filtered = genre ? merged.filter((c) => c.genre === genre) : merged;

  els.routeSearchCandidates.innerHTML = "";
  els.routeSearchEmpty.classList.toggle("hidden", filtered.length > 0);
  els.routeSearchEmpty.textContent =
    merged.length === 0
      ? "希望時間内で追加できる観光スポットがなくなりました。"
      : "選択したジャンルに一致する候補がありません。";

  for (const c of filtered) {
    const meta =
      c.source === "registered"
        ? `${starString(c.popularity)} ・ 移動約${Math.round(c.travelFromCurrent)}分`
        : `${escapeHtml(c.genre)} ・ 移動約${Math.round(c.travelFromCurrent)}分`;
    const li = document.createElement("li");
    li.innerHTML = `
      <div class="candidate-info">
        <div class="candidate-name">${escapeHtml(c.name)}</div>
        <div class="candidate-meta">${meta}</div>
      </div>
      <button type="button" class="select-btn">選択</button>
    `;
    li.querySelector(".select-btn").addEventListener("click", () => selectCandidate(c));
    els.routeSearchCandidates.appendChild(li);
  }
}

async function selectCandidate(candidate) {
  if (!routeSearch) return;

  let point;
  if (candidate.source === "registered") {
    point = candidate.point;
    point.included = true;
    point.order = routeSearch.nextOrder++;
  } else {
    point = newPoint({
      type: "sightseeing",
      name: candidate.name,
      memo: "",
      lat: candidate.lat,
      lng: candidate.lng,
      order: routeSearch.nextOrder++,
      included: true,
      popularity: 3,
      genre: candidate.genre,
    });
    currentRoute.points.push(point);
  }
  await saveRoute(currentRoute);

  routeSearch.currentPos = { lat: point.lat, lng: point.lng };
  routeSearch.usedMinutes += candidate.travelFromCurrent;

  renderAll();
  renderCandidateList();
}

function closeRouteSearch() {
  candidateToken++;
  els.routeSearchModal.classList.add("hidden");
  routeSearch = null;
}

async function handlePointDelete() {
  if (!editingPointId) return;
  if (!confirm("このポイントを削除しますか？")) return;
  currentRoute.points = currentRoute.points.filter((p) => p.id !== editingPointId);
  await saveRoute(currentRoute);
  closePointModal();
  renderAll();
}

async function handleOptimizeOrder() {
  const start = currentRoute.points.find((p) => p.type === "start");
  if (!start) {
    alert("先に起点を登録してください");
    return;
  }
  const toOptimize = currentRoute.points.filter((p) => p.type === "sightseeing" && p.included !== false);
  if (toOptimize.length < 2) {
    alert("最適化できる観光スポットが2件以上ありません");
    return;
  }

  const mandatoryOrders = currentRoute.points
    .filter((p) => p.type === "waypoint" || p.type === "meal")
    .map((p) => p.order);
  let nextOrder = (mandatoryOrders.length ? Math.max(...mandatoryOrders) : -1) + 1;

  const ordered = optimizeVisitOrder(start, toOptimize);
  for (const point of ordered) {
    point.order = nextOrder++;
  }

  await saveRoute(currentRoute);
  renderAll();
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

init();
