// Bucket IndexedDB TERPISAH milik distro "Rebit" — TIDAK PERNAH
// lewat NXUI.Storage()/IndexedDBManager (itu SINGLETON milik kernel,
// lihat assets/modules/Buckets/NexaStorage.js: init(dbName) mengganti
// this.db, memanggilnya lagi dengan dbName lain akan menimpa koneksi
// yang sedang dipakai NXUI.ref — distroGrafis/distroComponen bisa
// diam-diam membaca DB salah). Rencana lengkap: templates/bucketsDistro.md.
//
// Solusi: indexedDB.open() Web API asli (pola sama dengan
// openNexaApiCacheDatabase() di NexaStorage.js), database FISIK
// terpisah per-distro (nexaui-distro-{id}), dbVersion independen dari
// kernel (mulai dari 1). Koneksi disimpan di variabel module-level LOKAL
// (bukan window, bukan NXUI.ref) — scoped ke modul ini saja.

let dbPromise = null;
let cachedDbName = null;

/**
 * Buka (atau reuse) koneksi IndexedDB khusus distro ini. Dipanggil SEKALI
 * dari system/index.js (titik registrasi, dimuat grafis.js sebelum
 * NXHOME) — bukan oleh tiap file pemakai satu-satu.
 * @param {string} distroId — id distro (mis. "Rebit"), dipakai
 *   sebagai bagian nama database fisik: `nexaui-distro-{distroId}`.
 * @param {string[]} stores — nama object store yang didaftarkan developer
 *   distro ini. Store yang sudah ada di database TIDAK dibuat ulang.
 * @param {number} [version=1] — versi database KHUSUS distro ini,
 *   independen dari dbVersion kernel (NexaDb.js). Naikkan angka ini
 *   sendiri kalau distro perlu migrasi skema (tambah store baru dst).
 * @returns {Promise<IDBDatabase>}
 */
export function initDistroBuckets(distroId, stores, version = 1) {
  const dbName = `nexaui-distro-${distroId}`;
  // Reuse promise yang sama kalau dipanggil ulang dengan dbName yang sama
  // (mis. system/index.js sempat dimuat lebih dari sekali) — bukan buka
  // koneksi baru tiap panggilan.
  if (dbPromise && cachedDbName === dbName) return dbPromise;
  cachedDbName = dbName;

  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('initDistroBuckets: indexedDB tidak tersedia di lingkungan ini'));
      return;
    }
    const req = indexedDB.open(dbName, version);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (event) => {
      const db = event.target.result;
      for (const storeName of Array.isArray(stores) ? stores : []) {
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName, { keyPath: 'id', autoIncrement: true });
        }
      }
    };
  });

  return dbPromise;
}

/**
 * Accessor generik SATU store — mirip gaya `NXUI.ref[storeName](key)`
 * tapi menunjuk ke database distro ini, BUKAN database kernel.
 * WAJIB `initDistroBuckets()` sudah pernah dipanggil (lihat system/index.js)
 * sebelum fungsi ini dipakai — kalau belum, setiap method melempar error
 * jelas (bukan diam-diam gagal).
 * @param {string} storeName
 */
export function bucket(storeName) {
  const withStore = (mode, fn) =>
    (dbPromise || Promise.reject(new Error('bucket: initDistroBuckets() belum dipanggil')))
      .then(
        (db) =>
          new Promise((resolve, reject) => {
            try {
              const tx = db.transaction(storeName, mode);
              const store = tx.objectStore(storeName);
              fn(store, resolve, reject);
            } catch (err) {
              reject(err);
            }
          }),
      );

  return {
    /** @param {IDBValidKey} key */
    get: (key) =>
      withStore('readonly', (store, resolve, reject) => {
        const r = store.get(key);
        r.onsuccess = () => resolve(r.result ?? null);
        r.onerror = () => reject(r.error);
      }),
    /** @param {object} data — kalau tidak ada `id`, autoIncrement mengisi otomatis. */
    set: (data) =>
      withStore('readwrite', (store, resolve, reject) => {
        const r = store.put(data);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      }),
    /** @param {IDBValidKey} key */
    delete: (key) =>
      withStore('readwrite', (store, resolve, reject) => {
        const r = store.delete(key);
        r.onsuccess = () => resolve(true);
        r.onerror = () => reject(r.error);
      }),
    getAll: () =>
      withStore('readonly', (store, resolve, reject) => {
        const r = store.getAll();
        r.onsuccess = () => resolve(r.result || []);
        r.onerror = () => reject(r.error);
      }),
  };
}
