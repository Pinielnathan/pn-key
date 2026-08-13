/**
 * Persists uploaded/recorded File objects across page refreshes.
 * localStorage can't hold binary blobs at any real size, so this uses IndexedDB,
 * which stores File/Blob objects natively via the structured clone algorithm.
 */
import { stamp, unstamp } from "./workingState";

const DB_NAME = "pnkey-files";
const DB_VERSION = 1;
const STORE_NAME = "files";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE_NAME)) {
        req.result.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveFiles(key: string, files: File[]): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(stamp(files), key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function remove(key: string): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
  db.close();
}

export async function loadFiles(key: string): Promise<File[]> {
  const db = await openDB();
  const raw = await new Promise<unknown>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  db.close();

  const files = unstamp<File[]>(raw);
  if (files === null) {
    // Expired, or written before these entries carried a timestamp. Drop it so
    // the blobs stop occupying the user's disk quota as well as their screen.
    if (raw !== undefined) void remove(key).catch(() => {});
    return [];
  }
  return files;
}

export async function saveFile(key: string, file: File | null): Promise<void> {
  return saveFiles(key, file ? [file] : []);
}

export async function loadFile(key: string): Promise<File | null> {
  const files = await loadFiles(key);
  return files[0] ?? null;
}
