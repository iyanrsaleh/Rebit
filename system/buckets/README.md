# `system/buckets/` — IndexedDB terpisah milik distro ini

Bucket (tabel/object store) IndexedDB **khusus distro ini**, terpisah
total dari database kernel (`NXUI.ref`, dipakai `distroGrafis`,
`distroComponen`, dst). Dipakai kalau distro butuh menyimpan data sendiri
(draft, cache, pengaturan custom) tanpa menyentuh atau bergantung pada
skema kernel (`assets/modules/Buckets/NexaDb.js`).

Rencana teknis lengkap (alasan desain, kenapa harus terpisah dari
kernel): `templates/bucketsDistro.md`.

## Kenapa terpisah, bukan nambah ke `getDefaultStores()` kernel

- `assets/modules/Buckets/NexaDb.js` adalah file **shell/kernel** — kalau
  diedit langsung, perubahan hilang begitu shell di-reinstall/di-update
  dari repo `nxdom`, dan distro jadi tidak portable ke shell lain.
- `NXUI.Storage().indexedDB` adalah **singleton** — memanggilnya lagi
  dengan nama database berbeda akan MENGGANTI koneksi yang sedang dipakai
  kernel, bukan membuka koneksi kedua. Bug ini sudah pernah ditemukan dan
  dihindari di kode kernel sendiri (`NexaStorage.js`,
  `openNexaApiCacheDatabase()`) — `system/buckets/index.js` mengikuti
  pola aman yang sama: `indexedDB.open()` Web API asli, database fisik
  sendiri (`nexaui-distro-{id}`), sama sekali tidak lewat `NXUI.ref`.

## Cara pakai — TANPA import di file pemakai

`window.DistroBuckets` sudah didaftarkan otomatis oleh
`system/index.js` (dimuat `templates/distro/grafis.js` sebelum `NXHOME`)
— file mana pun di dalam distro ini (`package/{nama}/index.js`, sub-route
lain) bisa langsung memanggilnya, **tidak perlu `import` apa pun**:

```js
// package/{nama}/index.js — TIDAK ADA import

// Simpan satu baris (kalau data tidak punya field "id", autoIncrement mengisi otomatis)
await window.DistroBuckets('tabelKhusus').set({ judul: 'Draft artikel', isi: '...' });

// Baca semua baris
const rows = await window.DistroBuckets('tabelKhusus').getAll();

// Baca satu baris by key -> null kalau tidak ada (bukan undefined/error)
const satu = await window.DistroBuckets('tabelKhusus').get(rows[0].id);

// Hapus satu baris by key
await window.DistroBuckets('tabelKhusus').delete(rows[0].id);
```

## Menambah store (tabel) baru

Edit **satu tempat saja** — `system/index.js` (BUKAN
`system/buckets/index.js`, itu logic generik yang tidak berubah antar
distro):

```js
// templates/distro/Rebit/system/index.js
try {
  await initDistroBuckets('Rebit', ['tabelKhusus', 'draftArtikel'], 1);
  //                       ^ id distro    ^ daftar nama store            ^ version
} catch (err) {
  console.error('[system/index.js] gagal inisialisasi DistroBuckets:', err);
}
```

Tambahkan nama store baru ke array kedua. Store yang sudah ada di
database **tidak dibuat ulang** (`db.objectStoreNames.contains()` dicek
dulu) — aman dipanggil ulang.

## Kapan perlu menaikkan `version`

`version` (argumen ketiga `initDistroBuckets`) **independen dari
`dbVersion` kernel** (`NexaDb.js`, saat ini `41`) — jangan disamakan atau
dikoordinasikan dengan angka itu. Naikkan `version` distro ini sendiri
HANYA saat menambah store baru ke array kedua:

```js
// Sebelum: initDistroBuckets('Rebit', ['tabelKhusus'], 1);
// Nambah "draftArtikel" -> WAJIB naikkan version, kalau tidak
// onupgradeneeded TIDAK terpicu dan store baru tidak pernah dibuat
// (persis pola bug dbVersion kernel yang didokumentasikan di README.md).
await initDistroBuckets('Rebit', ['tabelKhusus', 'draftArtikel'], 2);
```

Kalau lupa naikkan `version` setelah menambah nama store, gejalanya:
`bucket('draftArtikel').getAll()` akan **reject** dengan error
`NotFoundError` (store belum pernah benar-benar dibuat) — bukan gagal
diam-diam.

## API lengkap

### `initDistroBuckets(distroId, stores, version = 1)`

Dipanggil **sekali** dari `system/index.js` (sudah ada, jangan dipanggil
manual dari file lain). Membuka/membuat database `nexaui-distro-{distroId}`.

- `distroId` — string, biasanya sama dengan `id` di `package.json` distro.
- `stores` — array nama store (string) yang mau didaftarkan.
- `version` — angka, default `1`. Naikkan saat menambah store baru (lihat
  bagian di atas).
- Return: `Promise<IDBDatabase>` — biasanya tidak perlu dipakai langsung,
  cukup pakai `bucket(...)` untuk baca/tulis.

### `bucket(storeName)` → `window.DistroBuckets(storeName)`

Return objek dengan 4 method, semua `async`:

| Method | Parameter | Return | Catatan |
|---|---|---|---|
| `.get(key)` | `key` (id baris) | baris atau `null` | `null` kalau key tidak ditemukan, bukan `undefined`/error |
| `.set(data)` | `data` (object) | key baris (id) | `put()` — timpa kalau `data.id` sudah ada, kalau tidak ada `id` maka autoIncrement mengisi otomatis |
| `.delete(key)` | `key` (id baris) | `true` | tidak error walau key tidak ada |
| `.getAll()` | — | array semua baris | array kosong `[]` kalau store belum ada isinya |

**Kegagalan struktural reject eksplisit** (bukan diam-diam gagal):
- Panggil `bucket(...)` sebelum `initDistroBuckets()` pernah dipanggil →
  reject `"bucket: initDistroBuckets() belum dipanggil"`.
- Panggil dengan nama store yang tidak pernah didaftarkan di
  `initDistroBuckets()` → reject `NotFoundError`.

## Batasan yang perlu diketahui

- **Isolasi per-distro** — dua distro berbeda punya database fisik
  terpisah total (`nexaui-distro-{id}` masing-masing), tidak mungkin
  bentrok nama store meski sama persis.
- **Uninstall distro TIDAK menghapus database ini** — `POST
  /nexa-uninstall-extension` (endpoint hapus folder distro) murni
  operasi filesystem server-side, tidak menyentuh IndexedDB
  (browser-side). Kalau distro yang sama diinstal ulang nanti, data lama
  di `nexaui-distro-{id}` masih ada. Kalau ingin membersihkan manual saat
  Rebit: DevTools browser → tab Application → IndexedDB →
  `nexaui-distro-{id}` → Delete database.
- **Bukan untuk data yang dipakai lintas-distro** — kalau butuh data yang
  harus terbaca sama oleh SEMUA distro (bukan cuma satu), ini bukan
  tempatnya (pakai `distroGrafis`/store kernel via `templates/storage/index.js`,
  atau `window.NxStorage`/`window.NxDirectory` untuk file-based).
- **Tidak ada migrasi skema otomatis** — kalau perlu ubah struktur data
  (bukan cuma tambah store baru, tapi ubah bentuk baris yang sudah ada),
  developer distro tulis logic migrasinya sendiri di dalam
  `onupgradeneeded` (`system/buckets/index.js`, fungsi `initDistroBuckets`),
  sama seperti kernel (`NexaDb.js`, `createObjectStores()`) juga manual.
