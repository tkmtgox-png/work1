const DB_NAME = "course-map-db";
const DB_VERSION = 1;
const STORE = "routes";

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function runRequest(mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    const req = fn(store);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function newId() {
  return crypto.randomUUID();
}

export async function getAllRoutes() {
  const routes = await runRequest("readonly", (store) => store.getAll());
  return routes.sort((a, b) => a.createdAt - b.createdAt);
}

export async function saveRoute(route) {
  route.updatedAt = Date.now();
  await runRequest("readwrite", (store) => store.put(route));
  return route;
}

export async function deleteRoute(id) {
  await runRequest("readwrite", (store) => store.delete(id));
}

export function createEmptyRoute(name) {
  const now = Date.now();
  return {
    id: newId(),
    name,
    transportMode: "walk",
    createdAt: now,
    updatedAt: now,
    points: [],
  };
}
