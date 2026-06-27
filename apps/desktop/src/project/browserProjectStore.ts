/**
 * IndexedDB project store for browser dev mode.
 * localStorage (~5 MB) cannot hold large MusicXML scores (e.g. Chan Cil ~900 KB).
 */

import type { ProjectHandle } from "./types";

const DB_NAME = "stockhausen-projects";
const STORE = "projects";
const DB_VERSION = 1;
const LS_PREFIX = "stockhausen:project:";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
    });
  }
  return dbPromise;
}

function idbRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
  });
}

function readLegacyLocalStorage(path: string): ProjectHandle | null {
  try {
    const raw = localStorage.getItem(`${LS_PREFIX}${path}`);
    return raw ? (JSON.parse(raw) as ProjectHandle) : null;
  } catch {
    return null;
  }
}

function dropLegacyLocalStorage(path: string): void {
  try {
    localStorage.removeItem(`${LS_PREFIX}${path}`);
  } catch {
    /* ignore */
  }
}

export async function getBrowserProject(path: string): Promise<ProjectHandle | null> {
  const db = await openDb();
  const fromIdb = await idbRequest(
    db.transaction(STORE, "readonly").objectStore(STORE).get(path),
  );
  if (fromIdb) return fromIdb as ProjectHandle;

  const legacy = readLegacyLocalStorage(path);
  if (legacy) {
    await putBrowserProject(legacy);
    dropLegacyLocalStorage(path);
    return legacy;
  }
  return null;
}

export async function putBrowserProject(handle: ProjectHandle): Promise<void> {
  const db = await openDb();
  await idbRequest(
    db.transaction(STORE, "readwrite").objectStore(STORE).put(handle, handle.path),
  );
  dropLegacyLocalStorage(handle.path);
}

export async function deleteBrowserProject(path: string): Promise<void> {
  const db = await openDb();
  await idbRequest(db.transaction(STORE, "readwrite").objectStore(STORE).delete(path));
  dropLegacyLocalStorage(path);
}
