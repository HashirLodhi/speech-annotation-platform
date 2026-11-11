/** Tiny promise wrapper around IndexedDB. Audio blobs live in their own store, keyed by item id. */
const DB_NAME = 'speech-annotation-platform';
const VERSION = 1;
export type StoreName = 'projects' | 'items' | 'audio';

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        db.createObjectStore('projects', { keyPath: 'id' });
        db.createObjectStore('items', { keyPath: 'id' });
        db.createObjectStore('audio');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function run<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(req.result as T);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export const idb = {
  getAll: <T>(store: StoreName) => run<T[]>(store, 'readonly', (s) => s.getAll()),
  get: <T>(store: StoreName, key: string) => run<T | undefined>(store, 'readonly', (s) => s.get(key)),
  put: (store: StoreName, value: unknown, key?: string) => run<void>(store, 'readwrite', (s) => s.put(value, key)),
  del: (store: StoreName, key: string) => run<void>(store, 'readwrite', (s) => s.delete(key)),
  clear: (store: StoreName) => run<void>(store, 'readwrite', (s) => s.clear()),
};
