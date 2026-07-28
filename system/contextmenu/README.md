# Context Menu per-target (per elemen `id`), per-extension

> Status: **DIIMPLEMENTASIKAN** (contoh: extension Rebit,
> `contes1`/`contes2`). Dokumen ini awalnya draf rencana — bagian §1-§4
> menjelaskan alur yang SUDAH ADA (baseline) dan keputusan arsitektur;
> §5-§7 sudah mencerminkan implementasi nyata (lihat status per fase di §7).
> Format mengikuti pola `templates/shortcutName.md` (fase, risiko,
> pertanyaan terbuka) — dipertahankan sebagai histori keputusan, bukan
> murni draf lagi.

## 1. Kebutuhan (dari contoh nyata `templates/distro/Rebit/index.js`)

```html
<div id="contes1">...</div>
<div id="contes2">...</div>
```

Saat user klik-kanan **di area `#contes1`**, menu yang tampil harus BEDA dari
saat klik-kanan **di area `#contes2`** — dan beda lagi dari klik-kanan di area
kosong lain (menu default/global yang sudah ada di `electronShell.js`).

Target ini murni **elemen dengan atribut `id` HTML biasa** (bukan
`data-context-id` khusus) — dicari lewat `closest('[id]')` dari titik klik ke
atas, sampai ketemu id yang "dikenal" atau mentok ke default.

## 2. Alur yang SUDAH ADA saat ini (baseline, tidak boleh rusak)

```
electron/main.js:1312  webContents.on('context-menu', (event, params))
      │  params NATIVE Electron (x, y, linkURL, srcURL, isEditable, ...)
      │  → HANYA x/y yang dipakai saat ini (untuk Inspect Element)
      ▼
electron/main.js:1318-1325  getContextMenuBuilder() → buildContextMenuTemplate(ctx)
      │  ctx = { getMainWindow, toggleDevTools, clearCacheAndNotify,
      │          showAboutDialog, contextMenuParams }
      ▼
electron/electronShell.js:23-129  buildContextMenuTemplate — MENU STATIS
      │  (sama untuk SETIAP klik kanan, di mana pun, extension apa pun)
      │  klik item → w.webContents.send('context-menu-clicked', itemInfo)
      ▼
electron/preload.js  ipcRenderer.on('context-menu-clicked') → window.electronAPI.onContextMenuClick
      ▼
App.js:92-97  onContextMenuClick(data) → components(data)
      ▼
electron/components/index.js  dynamic import(`./${route.role}.js`) → module[role](route)
      ▼
electron/components/nexaBeranda.js | nexaTerminal.js  — handler (served via /nexa-context, Express static)
```

**Gap kunci (kenapa fitur ini belum bisa dibuat tanpa perubahan arsitektur):**

1. **Menu dibangun di main process** (`electronShell.js`, CommonJS,
   `require()`-based) — bukan di renderer. Main process **tidak tahu** `id`
   extension aktif (itu murni state renderer, `distroGrafis` di IndexedDB) dan
   **tidak tahu** elemen DOM apa yang diklik kanan (native `params` Electron
   cuma kasih `x`/`y` koordinat layar, bukan elemen semantik/`id` HTML).
2. Tidak ada IPC existing yang menjembatani "renderer tahu elemen apa yang
   diklik" → "main process pakai info itu untuk memilih template menu".

Pola referensi terdekat untuk *sinkronisasi state renderer → main* adalah
`nexa-sync-shortcut-name` (`electron/main.js:796-802`): renderer panggil
`window.electronAPI.syncShortcutName(meta)` → IPC `handle` → main simpan/pakai.
Rencana di bawah memakai pola yang SAMA, bukan mekanisme baru.

## 3. Keputusan arsitektur (sudah disepakati)

- **Sinkronisasi extension aktif ke main**: lewat IPC baru, dipanggil dari
  renderer (App.js, sekali saat startup — sama titik dengan `loadTitlebar()`),
  disimpan di variabel module-level `main.js`. Main TIDAK membaca IndexedDB
  langsung (tidak bisa) dan TIDAK scan disk untuk menebak extension aktif.
- **Sumber "id target"**: atribut `id` HTML pada elemen (`#contes1`,
  `#contes2`, dst) — BUKAN native Electron `params` (`linkURL`/`srcURL`/dll)
  dan bukan berdasarkan route halaman. Karena native `context-menu` event
  Electron tidak membawa info ini, **perlu listener tambahan di renderer**
  (`contextmenu` DOM event, capture lebih awal) yang mencari
  `event.target.closest('[id]')` dan mengirim `id` itu ke main SEBELUM main
  menampilkan menu (lihat alur §4).

## 4. Alur baru yang diusulkan

```
┌─────────────────────────────────────────────────────────────────────┐
│ STARTUP (sekali, App.js — titik sama dengan loadTitlebar())          │
│   getActiveExtension() → id                                          │
│   window.electronAPI.syncActiveExtension(id)                        │
│         → IPC 'nexa-sync-active-extension' (handle, main.js)        │
│         → simpan di variabel module-level: activeExtensionId        │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ SETIAP KLIK KANAN (renderer, App.js atau listener global baru)      │
│   document.addEventListener('contextmenu', (e) => {                 │
│     const targetEl = e.target.closest('[id]');                      │
│     const targetId  = targetEl?.id || null;                          │
│     window.electronAPI.setContextMenuTarget(targetId);   ← IPC baru  │
│     // TIDAK preventDefault — biarkan Electron tetap trigger         │
│     // event native 'context-menu' seperti biasa setelah ini         │
│   }, true);  // capture:true → jalan SEBELUM event native diproses   │
└─────────────────────────────┬─────────────────────────────────────────┘
                               ▼ (dalam waktu yang sama, browser lanjut
                                  trigger native context-menu ke main)
┌─────────────────────────────────────────────────────────────────────┐
│ electron/main.js:1312  webContents.on('context-menu', ...)          │
│   ambil lastContextMenuTargetId (variabel module-level, di-set IPC  │
│   'setContextMenuTarget' barusan) + activeExtensionId                │
│   ▼                                                                   │
│   getContextMenuBuilder() → buildContextMenuTemplate(ctx)            │
│     ctx += { activeExtensionId, contextMenuTargetId }   ← BARU       │
└─────────────────────────────┬─────────────────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│ electron/electronShell.js  buildContextMenuTemplate(ctx)             │
│   if (ctx.contextMenuTargetId) {                                     │
│     coba muat override dari:                                        │
│     templates/distro/{activeExtensionId}/system/contextmenu/index.js│
│     → export function NXCONTEXTMENU(ctx) → return template[] khusus │
│       ATAU null/undefined → fallback ke menu default di bawah        │
│   }                                                                   │
│   default: template statis yang SUDAH ADA (tidak berubah)            │
└─────────────────────────────────────────────────────────────────────┘
```

### Kenapa perlu listener DOM `contextmenu` tambahan (bukan cukup native `params`)

Native `context-menu` event Electron memang membawa `params.x`/`params.y`,
tapi **elemen semantik (`id` HTML) harus ditentukan di dunia DOM/renderer**,
Electron main process tidak punya akses ke DOM tree. Maka renderer HARUS
mengirim info itu ke main **sebelum** popup dibangun. Karena kedua event
(`contextmenu` DOM biasa dan `context-menu` native Electron) terpicu untuk
klik kanan yang sama secara berurutan (DOM dulu, lalu Electron), cukup simpan
`targetId` di variabel module-level main.js lewat IPC `handle` yang **sinkron
cepat** (bukan `send` async biasa — pakai `ipcRenderer.invoke` supaya
terjamin selesai sebelum popup Menu dibangun, atau alternatif lebih aman:
kirim `targetId` sebagai bagian dari `params` itu sendiri — lihat §6, Opsi B).

## 5. Kontrak file — REGISTRY eksplisit di `index.js`, BUKAN konvensi nama

> **Revisi (lihat histori di bawah)**: draf awal fitur ini memakai konvensi
> "nama file = nama fungsi = key registry = id HTML target", dan
> `electron/components/nexaContextAction.js` menebak nama file LANGSUNG
> dari `targetId` (`import(`${targetId}.js`)`). Ini terbukti rapuh saat
> target dinamis/bersarang mulai ditambahkan (§7a/§7b): id HTML bisa
> mengandung karakter yang tidak valid sebagai identifier JS (`-`), id yang
> sama secara tidak sengaja bisa dipakai ulang untuk keperluan lain, dan
> mengganti nama file diam-diam mematahkan dispatch aksi tanpa error yang
> jelas. Sejak revisi ini, `index.js` punya `REGISTRY` array yang
> MENDEKLARASIKAN eksplisit pemetaan target → modul — bukan konvensi
> penamaan implisit. Satu mekanisme yang sama menangani target statis
> (`contes1`, `nx-file-viewer-editor`) MAUPUN dinamis (tree direktori)
> tanpa tambalan per kasus.

```
templates/distro/Rebit/system/contextmenu/
  index.js                  ← REGISTRY (satu-satunya sumber kebenaran target → modul)
  contes1.js                ← modul target "contes1"
  contes2.js                ← modul target "contes2"
  nx-file-viewer-editor.js  ← modul target "nx-file-viewer-editor" (editor CM6)
  nxFileViewerMount.js      ← modul target "nx-file-viewer-mount" (viewer, di luar editor)
  nxDirectoryEntry.js       ← modul target DINAMIS (tree direktori, banyak id)
```

**Tiap modul target** — DUA jenis export, nama BEBAS (tidak lagi terikat
nama file):
1. Fungsi **buildMenu** `(targetId, helpers) => item[]` — dipanggil main
   process untuk membangun array item menu (lihat §6). Menerima `targetId`
   juga (bukan cuma `helpers`) supaya modul yang menangani BANYAK id (target
   dinamis, §7a) bisa membedakan entry mana yang sedang diklik.
2. Fungsi **aksi** (dipanggil balik dari renderer saat item menu diklik,
   lihat §5a) — nama bebas, dirujuk lewat `actionName` di `sendAction()`.

```js
// templates/distro/Rebit/system/contextmenu/contes1.js
export function contes1(targetId, helpers) {
  return [
    { label: 'Aksi khusus Contes 1', click: () => helpers.sendAction('runContes1Action') },
    { type: 'separator' },
  ];
}

export async function runContes1Action() {
  console.log('[ContextMenu] Aksi Contes 1 dijalankan');
  return { success: true };
}
```

**`index.js`** — `REGISTRY` array (bukan object keyed by id), tiap entry
mendeklarasikan `id` (match persis) ATAU `match(targetId)` (fungsi, untuk
target dinamis — SALING EKSKLUSIF dengan `id`), plus `module` (namespace
hasil `import * as X from './file.js'`) dan `buildMenu` (nama fungsi di
dalam modul itu):

```js
// templates/distro/Rebit/system/contextmenu/index.js
import * as contes1Mod from './contes1.js';
import * as contes2Mod from './contes2.js';

const REGISTRY = [
  { id: 'contes1', module: contes1Mod, buildMenu: 'contes1' },
  { id: 'contes2', module: contes2Mod, buildMenu: 'contes2' },
  // target dinamis: match() bukan id persis, lihat §7a
  // { match: (id) => id.startsWith('nxfile::'), module: nxDirectoryEntryMod, buildMenu: 'nxDirectoryEntry' },
];

// Dicari di DUA tempat: di bawah (bangun menu) dan
// electron/components/nexaContextAction.js (dispatch balik aksi klik) —
// SATU fungsi, tidak ada logic pencarian ganda yang bisa tidak sinkron.
export function resolveContextMenuEntry(targetId) {
  if (!targetId) return null;
  for (const entry of REGISTRY) {
    const matched = entry.match ? entry.match(targetId) : entry.id === targetId;
    if (matched) return entry;
  }
  return null;
}

// Dipanggil dari electronShell.js (lewat dynamic import, lihat §6).
export function NXCONTEXTMENU(targetId, helpers) {
  const entry = resolveContextMenuEntry(targetId);
  if (!entry) return null;
  const fn = entry.module[entry.buildMenu];
  return typeof fn === 'function' ? fn(targetId, helpers) : null;
}
```

**Prinsip penting (konsisten dengan `NXHOME`/`NXTITLEBAR`):**

- `NXCONTEXTMENU(targetId, helpers)` tetap satu-satunya fungsi yang dipanggil
  dari `electronShell.js` (kontrak eksternal tidak berubah) — di dalamnya
  cuma lookup ke `REGISTRY` lewat `resolveContextMenuEntry()`, bukan
  hand-written `if/else`. Menambah target baru = tambah 1 file + 1 entry
  `REGISTRY` di `index.js`, TIDAK menyentuh file target lain.
- `resolveContextMenuEntry()` **diekspor** dan dipakai ULANG oleh
  `electron/components/nexaContextAction.js` untuk dispatch balik aksi klik
  (§5a) — bukan ditebak lewat nama file. Ini artinya nama file modul BOLEH
  berubah kapan pun (cukup update 1 baris `module` import + `REGISTRY` di
  `index.js`), TANPA mematahkan aksi klik yang sudah berjalan — beda dari
  skema lama yang menuntut nama file selalu identik dengan `targetId`.
- Return array item **TAMBAHAN** (di-prepend ke template default) atau
  `null` untuk "tidak override" — BUKAN menggantikan seluruh menu (supaya
  item global seperti Refresh/Layar Penuh/Jendela tetap ada, konsisten).
  Extension developer boleh eksplisit override total kalau perlu (lihat
  §7 pertanyaan terbuka).
- File `index.js` (dan seluruh folder `contextmenu/`) **opsional** — kalau
  extension tidak menyediakannya, context menu = default seperti sekarang,
  sama seperti titlebar yang boleh tidak ada.
- **TIDAK boleh** memanggil API Electron langsung (`require('electron')`)
  dari sini — file-file ini secara konsep ada di `templates/` (dunia
  renderer/extension), meskipun *eksekusinya* akan di-`import()` oleh
  main process (lihat §6 soal masalah ESM vs CommonJS). Kontrak fungsi
  harus tetap "data in, data out" (terima `helpers`, kembalikan array
  descriptor plain object) — bukan pegang referensi `BrowserWindow` dsb.

## 5a. Eksekusi aksi klik — SATU handler generik, BUKAN 1 file per aksi

**Keputusan (revisi dari draf awal)**: draf pertama fitur ini memakai
`helpers.sendRole(role)` yang mengharuskan **satu file baru di
`electron/components/` per aksi** (mis. `nexaContes1Action.js`,
`nexaGotoDistroCotoh.js`, dst) — meniru pola lama `nexaBeranda.js`/
`nexaTerminal.js`. Ini SALAH ARAH: `electron/components/index.js` sudah
men-dispatch dinamis berdasar `route.role`
(`import(`./${route.role}.js`)`), tapi tetap menuntut developer bikin 1
file per role secara manual — kalau ini dipakai untuk tiap aksi context-menu,
folder `electron/components/` akan penuh file sekali-pakai yang isinya cuma
memanggil balik fungsi di `templates/distro/{id}/system/contextmenu/`.

**Fix**: SATU role generik `'nexaContextAction'`, SATU file baru selamanya
di `electron/components/nexaContextAction.js` — menangani aksi APA PUN dari
target/extension APA PUN. Developer extension TIDAK PERNAH perlu menyentuh
`electron/components/` untuk menambah aksi context-menu baru.

```
click item menu (main process, electronShell.js)
  helpers.sendAction('runContes1Action')
        │
        ▼
  w.webContents.send('context-menu-clicked', {
    role: 'nexaContextAction',       ← SELALU sama, untuk SEMUA aksi
    extensionId, targetId, actionName, payload
  })
        │
        ▼ (App.js → components(data), TIDAK BERUBAH dari alur lama)
  electron/components/nexaContextAction.js
        │  import(`/templates/distro/${extensionId}/system/contextmenu/index.js`)
        │  registry.resolveContextMenuEntry(targetId) → { module, buildMenu }
        │  panggil entry.module[actionName](payload)
        ▼
  templates/distro/Rebit/system/contextmenu/contes1.js
        export async function runContes1Action() { ... }   ← dieksekusi di sini
```

`helpers.sendAction(actionName, payload?)` (bukan `sendRole`) — dikirim dari
`getDistroContextMenuItems()` (`electronShell.js`) sebagai bagian dari
`helpers` yang sama yang diterima `NXCONTEXTMENU(targetId, helpers)`. Payload
`context-menu-clicked` membawa `extensionId`+`targetId` (sudah diketahui main
process saat itu, lihat §3/§4) supaya `nexaContextAction.js` tahu target mana
yang dimaksud — **BUKAN diterjemahkan langsung jadi nama file** (skema lama,
lihat revisi §5), tapi dicari lewat `resolveContextMenuEntry(targetId)` yang
diimpor dari `system/contextmenu/index.js` milik extension itu sendiri, SAMA
PERSIS fungsi yang dipakai `NXCONTEXTMENU()` untuk membangun menu — satu
sumber kebenaran, tidak ada dua logic pencarian yang bisa tidak sinkron.

**Kenapa import baliknya lewat `/templates/distro/{id}/...` (absolut dari
root), bukan relatif**: `nexaContextAction.js` di-serve dari
`/nexa-context/nexaContextAction.js` (lihat §2, `express.static` mount
`/nexa-context` → `electron/components/`), base URL modulnya BUKAN root —
path relatif `./templates/...` akan salah resolve (mencoba
`/nexa-context/templates/...`, 404). `express.static(path.join(__dirname))`
di `index.js` (root, tanpa prefix) membuat seluruh project termasuk
`templates/` bisa diakses lewat path absolut `/templates/...` dari domain
manapun — pola yang sama dipakai `App.js` (`./templates/distro/${id}/...`,
relatif karena `App.js` SENDIRI di-serve dari root).

**Untuk aksi navigasi** (`NXUI.load(route)`, mis. `gotoDistroCotoh` di
`contes2.js`): fungsi aksi berjalan di **renderer** (dipanggil
`nexaContextAction.js`, yang juga jalan di renderer via `components()`), jadi
BISA panggil `NXUI.load` langsung — beda dari `click` handler di
`electronShell.js` sendiri yang jalan di **main process** dan TIDAK bisa
akses `NXUI`/DOM sama sekali (makanya harus lewat `sendAction` → IPC →
renderer, bukan `NXUI.load` dipanggil langsung dari dalam `click`).

## 5b. Icon item menu — WAJIB PNG, SVG tidak didukung (diverifikasi)

**Pertanyaan yang diuji langsung**: apakah item context-menu bisa diberi
icon SVG? **Jawaban: tidak secara langsung** — dua pendekatan "tanpa
dependency baru" DICOBA dan GAGAL, dibuktikan lewat skrip Electron nyata
(bukan asumsi dari dokumentasi):

- `nativeImage.createFromDataURL('data:image/svg+xml;base64,...')` →
  **gagal total**: `img.isEmpty()` = `true`, `img.getSize()` =
  `{width:0,height:0}`. `nativeImage` Electron memang cuma decode
  PNG/JPEG/GIF, tidak pernah SVG.
- Render SVG lewat `BrowserWindow` offscreen tersembunyi + `capturePage()`
  (trik render manual tanpa library) → **gagal juga**: `GPU state invalid
  after WaitForGetOffsetInRange`, hasil `isEmpty()` = `true`. Sebabnya:
  `electron/main.js` (baris ~1333) sudah `app.disableHardwareAcceleration()`
  + `--disable-gpu`/`--disable-gpu-sandbox` secara GLOBAL untuk seluruh
  aplikasi (kemungkinan untuk kompatibilitas VM/RDP) — `capturePage()`
  butuh compositing GPU yang stabil, jadi pendekatan ini TIDAK reliable
  di project ini.

**Opsi yang tersisa untuk SVG-di-kode** (dicatat, TIDAK diimplementasikan):
tambah dependency render CPU murni (mis. `@resvg/resvg-js`) untuk
convert SVG string → PNG buffer saat runtime, tanpa butuh GPU. Ditolak
untuk implementasi awal ini — dipilih pendekatan PNG statis (lebih
sederhana, nol dependency baru).

**Keputusan final: icon HARUS file PNG statis, ukuran WAJIB persis 16×16
px** (`ICON_SIZE` di `electronShell.js`) — ATURAN KERAS, bukan rekomendasi
yang bisa dilonggarkan. Alasan ukuran ditegakkan ketat (bukan cuma
didokumentasikan): native menu context Windows merender icon di slot kecil
tetap, Electron **tidak** auto-resize icon menu — PNG ukuran lain (mis.
512×512 ditaruh apa adanya) akan tampil gepeng/terpotong tergantung OS,
bukan diperkecil rapi secara otomatis. Supaya developer extension tidak
"asal buat ukuran" lalu baru sadar salah setelah lihat menu-nya aneh,
validasi ukuran dilakukan SEBELUM icon dipakai, dengan pesan error jelas.

Disimpan di folder `contextmenu/` extension itu sendiri (mis.
`icon-contes1.png`), di-load lewat `helpers.icon(filename)` — BUKAN
`nativeImage` dipanggil langsung oleh file target (kontrak §5 melarang
file target `require('electron')` sendiri). `helpers.icon()`
(`electronShell.js`, di dalam `getDistroContextMenuItems()`) resolve path
relatif ke folder `contextmenu/` extension aktif, lalu TIGA pengecekan
berurutan — file tidak ada, gagal decode, ATAU ukuran ≠ 16×16 — semuanya
`console.error` dengan pesan spesifik + `return undefined` (Electron
mengabaikan `icon: undefined` dengan aman, item tetap tampil tanpa icon,
TIDAK crash):

```js
// electronShell.js, di dalam helpers (ICON_SIZE = 16, module-level):
icon(filename) {
  try {
    const abs = path.join(contextmenuDir, filename);
    if (!fsExistsSafe(abs)) {
      console.error(`[ContextMenu] Icon "${filename}" tidak ditemukan di ${contextmenuDir}`);
      return undefined;
    }
    const img = require('electron').nativeImage.createFromPath(abs);
    if (img.isEmpty()) {
      console.error(`[ContextMenu] Icon "${filename}" gagal di-decode (bukan PNG/JPEG/GIF valid?)`);
      return undefined;
    }
    const { width, height } = img.getSize();
    if (width !== ICON_SIZE || height !== ICON_SIZE) {
      console.error(
        `[ContextMenu] Icon "${filename}" berukuran ${width}x${height}, HARUS ${ICON_SIZE}x${ICON_SIZE} — icon diabaikan.`,
      );
      return undefined;
    }
    return img;
  } catch {
    return undefined;
  }
},
```

```js
// contes1.js — pemakaian
{
  label: 'Aksi khusus Contes 1',
  icon: helpers.icon('icon-contes1.png'),
  click: () => helpers.sendAction('runContes1Action'),
},
```

**Diverifikasi end-to-end** (bukan cuma baca kode) — DUA skenario:
1. Panggil `buildContextMenuTemplate()` langsung dengan `activeExtensionId:
   'Rebit'`, `contextMenuTargetId: 'contes1'` — item pertama hasil
   akhir punya `icon` berupa `nativeImage` valid (`isEmpty(): false`, size
   `16x16`) dari `icon-contes1.png`.
2. PNG uji 64×64 dibuat sengaja — `nativeImage.getSize()` mengembalikan
   `{width:64,height:64}`, logic `width !== ICON_SIZE || height !== ICON_SIZE`
   mengembalikan `true` (ditolak), sama seperti yang seharusnya terjadi di
   `helpers.icon()` nyata.

PNG contoh (`icon-contes1.png`, `icon-contes2.png`) di-generate lewat PNG
encoder minimal tulisan sendiri (Node `zlib.deflateSync` + chunk
IHDR/IDAT/IEND manual) — TANPA dependency baru sama sekali, cukup untuk
bukti-konsep 16×16 RGBA sederhana. Developer extension nyata bebas
menyediakan PNG apa pun (hasil export dari SVG lewat tool desain
eksternal, mis. Figma/Inkscape/Illustrator export-as-PNG) — batasannya
cuma format akhir dan UKURAN AKHIR: PNG/JPEG/GIF, persis 16×16, tidak ada
pengecualian.

## 6. Masalah teknis yang HARUS diputuskan sebelum implementasi

### 6a. ESM vs CommonJS — SUDAH DIIMPLEMENTASIKAN + DIVERIFIKASI

`templates/distro/{id}/system/contextmenu/index.js` ditulis sebagai ES module
(`export function`, sama seperti `titlebar/index.js`), tapi `electronShell.js`
adalah CommonJS (`require`/`module.exports`). Main process pakai dynamic
`import()` (tersedia di CommonJS Node modern) untuk memuat file ESM — ini I/O
**async**, sedangkan `webContents.on('context-menu', ...)` handler sudah
`async` (`main.js:1312`), jadi `await import(...)` valid tanpa perubahan pola.

**Bug ditemukan+diperbaiki (lewat uji nyata, bukan asumsi):**

- **Percobaan pertama gagal**: `import(path.resolve(...))` mentah (path
  Windows biasa, bukan `file://` URL) → `ERR_UNSUPPORTED_ESM_URL_SCHEME`
  ("On Windows, absolute paths must be valid file:// URLs"). **Fix**: bungkus
  `require('url').pathToFileURL(abs).href`.
- **Percobaan kedua gagal**: `import()` ke path Windows/`file://` biasa tanpa
  `pathToFileURL` konteks module type → Node menafsirkan file sebagai
  **CommonJS** (mengikuti `package.json` ROOT project yang tidak punya
  `"type": "module"`), sehingga `import { contes1 } from './contes1.js'` DI
  DALAM `index.js` extension gagal parse: `SyntaxError: Cannot use import
  statement outside a module`. **Fix**: `templates/distro/{id}/system/contextmenu/`
  WAJIB punya `package.json` SENDIRI berisi `{"type":"module"}` — Node
  me-resolve `package.json` **terdekat** ke atas folder, jadi yang di folder
  ini menang atas yang di root, membuat SEMUA file `.js` di dalam folder ini
  (dan sub-importnya) ditafsirkan sebagai ESM.
- **Alternatif yang DICOBA dan GAGAL** (dicatat supaya tidak diulang): pakai
  `data:text/javascript;base64,...` URL (tanpa perlu `package.json` tambahan
  sama sekali, Node selalu menafsirkan `data:` JS sebagai ESM). Ini **gagal**
  karena `import { contes1 } from './contes1.js'` di dalam kode yang dimuat
  dari `data:` URL me-resolve import relatif terhadap `data:` URL itu sendiri
  (bukan lokasi file asli) — error: `Invalid relative URL or base scheme is
  not hierarchical`. Kombinasi yang terbukti jalan HANYA `pathToFileURL()` +
  `package.json` lokal `{"type":"module"}`.

Implementasi: `loadDistroContextMenuModule()` di `electronShell.js` — path
absolut `path.join(appRoot, 'templates', 'distro', extensionId, 'system',
'contextmenu', 'index.js')` (`appRoot` dikirim dari `main.js` via `ctx.appRoot
= APP_ROOT`, sudah menghitung dev vs packaged dengan benar), dibungkus
`try/catch` di pemanggilnya (`getDistroContextMenuItems`) — file/folder boleh
tidak ada sama sekali (extension tidak menyediakan override), sama toleran
seperti `App.js` untuk titlebar.

**Dev-mode cache**: pola `requireElectronShellFresh()` (`main.js:203-212`)
menghapus `require.cache` supaya edit langsung terasa tanpa restart. Dynamic
`import()` pakai cache module ESM sendiri — diatasi dengan query-string
cache-busting (`fileUrl + '?t=' + Date.now()`) saat `!app.isPackaged`, **DIUJI
langsung**: `import(url + '?t=' + Date.now())` mengembalikan module baru tanpa
error, konsisten dengan semangat `requireElectronShellFresh()` yang sudah ada.

### 6b. Bagaimana `targetId` benar-benar sampai ke main SEBELUM menu dibangun

Dua opsi:

- **Opsi A — IPC terpisah duluan (`invoke`)**: listener `contextmenu` DOM di
  renderer (capture phase) memanggil `await window.electronAPI.setContextMenuTarget(id)`
  yang merupakan `ipcRenderer.invoke` (menunggu balasan main sebelum lanjut).
  Risiko: event DOM `contextmenu` dan native Electron `context-menu` bisa
  balapan (race) kalau renderer lambat balas invoke — perlu diverifikasi
  empiris apakah Electron menjamin urutan event terjadi setelah semua
  synchronous handler renderer selesai.
- **Opsi B — titip di `params` sendiri, tanpa IPC baru** (LEBIH SEDERHANA,
  DISARANKAN): Electron punya API `webContents.on('before-input-event')` atau
  cukup pertahankan `targetId` di variabel module-level RENDERER yang
  di-update oleh listener `contextmenu` (bukan `mousedown`/`click`) —
  lalu SEBELUM event native `context-menu` sampai ke main, kirim lewat
  IPC `send` (bukan `invoke`, fire-and-forget lebih cepat) tepat di listener
  yang sama. Karena DOM `contextmenu` event terjadi tepat sebelum Electron
  memunculkan native menu (mereka event yang sama, DOM dulu baru Electron
  popup), `send` yang non-blocking kemungkinan besar sudah sampai ke main
  process (proses terpisah tapi IPC lokal sangat cepat, <1ms) sebelum
  `Menu.buildFromTemplate(...).popup()` dipanggil beberapa microtask
  kemudian. **Perlu dites empiris** — kalau ternyata tidak reliable, fallback
  ke Opsi A.

### 6c. Variabel module-level main.js yang perlu ditambahkan

- `activeExtensionId` (string|null) — diisi oleh IPC baru `nexa-sync-active-extension`.
- `lastContextMenuTargetId` (string|null) — diisi oleh IPC baru
  `nexa-context-menu-target` (dipanggil dari listener `contextmenu` renderer).
  Di-reset ke `null` SETELAH dipakai sekali (supaya tidak "nyangkut" ke klik
  kanan berikutnya yang tidak kena elemen ber-id apa pun).

## 7. Fase implementasi — STATUS: DIIMPLEMENTASIKAN (contoh Rebit)

1. **IPC sinkronisasi extension aktif** — DONE. `electron/preload.js` expose
   `syncActiveExtension(id)`, `main.js` (`registerContextMenuTargetIpc()`)
   `ipcMain.handle('nexa-sync-active-extension', ...)` simpan ke variabel
   module-level `activeExtensionId`. Dipanggil dari `App.js`
   (`syncActiveExtensionToMain()`) di titik yang sama dengan `loadTitlebar()`.
2. **IPC target elemen** — DONE. Preload expose `notifyContextMenuTarget(id)`,
   main handler simpan `lastContextMenuTargetId` (di-reset ke `null` setelah
   dipakai sekali, lihat §6c). Listener
   `document.addEventListener('contextmenu', ..., true)` di `App.js` (global,
   bukan per-extension — cari `closest('[id]')` generik).
3. **`buildContextMenuTemplate` di `electronShell.js`** — DONE. Fungsi jadi
   `async`, terima `ctx.activeExtensionId` + `ctx.contextMenuTargetId` +
   `ctx.appRoot`, dynamic `import()` (`pathToFileURL` + `package.json` lokal
   `{"type":"module"}`, lihat §6a) `templates/distro/{id}/system/contextmenu/index.js`
   (try/catch di `getDistroContextMenuItems()`), panggil
   `NXCONTEXTMENU(targetId, helpers)`, hasil (kalau bukan null) di-`unshift`
   + separator ke template default sebelum `Menu.buildFromTemplate`.
4. **Kontrak `helpers`** — DONE, **direvisi dari draf awal**: bukan
   `sendRole(role)` (1 file per aksi di `electron/components/`), tapi
   `sendAction(actionName, payload?)` — SATU role generik
   `'nexaContextAction'` untuk SEMUA aksi, dispatch balik ke fungsi bernama
   `actionName` di file target (`contes1.js`/`contes2.js`) itu sendiri. Lihat
   §5a untuk alasan revisi dan alur lengkapnya.
5. **Contoh nyata** — DONE. `contes1.js` (aksi klik + role bawaan Electron
   Undo/Redo/Cut/Copy/Paste/Select All), `contes2.js` (aksi klik + submenu
   bertingkat dua "Navigasi" yang memanggil `NXUI.load()` ke route yang sama
   dengan link `<a>` di `index.js` extension: `distro/cotoh`,
   `boot/componen`, `instal`), `index.js` (registrasi). SATU file generik
   `electron/components/nexaContextAction.js` — TIDAK ada file tambahan lain
   di `electron/components/` untuk aksi-aksi ini.
6. **Dokumentasi**: README ini (self-updating). `templates/README.md`/
   `templates/FLOW.md` BELUM disentuh — lihat §9 (belum dilakukan, opsional
   menyusul kalau fitur ini dianggap stabil/final).

## 7a. Target DINAMIS — tree direktori (`nxDirectoryEntry.js`), beda pola dari §5

**Status: DIIMPLEMENTASIKAN.** §5 mengasumsikan "satu target = satu id HTML
statis, tetap sepanjang hidup halaman" (`#contes1`, `#contes2`, ditulis
manual di `index.js` extension). Tree direktori (`system/directory/index.js`,
`renderDirectoryTreeHtml()`) TIDAK cocok pola itu — jumlah file/folder
berubah-ubah, tiap entry butuh menu klik-kanan sendiri (Copy/Cut/Paste/
Duplicate/Rename/Delete/New File/New Folder), menulis 1 file target manual
per file di disk jelas mustahil.

**Solusi — id di-generate, BUKAN ditulis manual:**
- Tiap elemen file/folder di tree diberi `id="nxfile::<path-encoded>"` saat
  render (`encodeURIComponent(filePathSoFar)`), lihat `renderNode()` di
  `system/directory/index.js`. Folder ROOT dan entry yang kena
  `isProtectedPath()` (§ file itu sendiri, lihat `system/directory/README`
  terkait) sengaja TIDAK diberi id ini — konsisten dengan tidak-bisa-diklik
  di editor.
- Container tree (`#nx-directory-tree-mount`, dari
  `package/directory/index.js`) dipakai sebagai target KEDUA: klik-kanan di
  area kosong tree (tidak kena file/folder mana pun) = "folder root distro
  ini" (`path: '.'`) — untuk New File/New Folder/Paste di root.
- SATU file `nxDirectoryEntry.js` menangani KEDUA pola id ini sekaligus
  (`decodeTargetPath()` cek prefix `nxfile::` atau id container persis) —
  BUKAN 1 file per path seperti §5.
- Didaftarkan di `REGISTRY` (`system/contextmenu/index.js`) lewat entry
  `match(targetId)` (bukan `id` persis) — dicek dalam urutan array, lihat
  §5. Entry ini SENGAJA diletakkan PALING TERAKHIR di `REGISTRY` (target
  statis dicek dulu, baru fallback ke pola dinamis).

**`electron/components/nexaContextAction.js` (kernel, bukan `templates/`)**
TIDAK LAGI menebak modul dari `targetId` sama sekali (lihat revisi §5) —
untuk target statis MAUPUN dinamis, dispatch balik aksi klik selalu lewat
`resolveContextMenuEntry(targetId)` yang diimpor dari `system/contextmenu/
index.js` extension aktif. Satu mekanisme uniform, tidak ada cabang
kode terpisah untuk kasus dinamis.

**Operasi file (Copy/Cut/Paste/Duplicate/Rename/Delete/New File/New
Folder)** dieksekusi lewat `window.NxDirectory.op(action, params)` (method
ke-7, endpoint `POST /nexa-directory-op/:extension`, `index.js` root
`handleDirectoryOp()`) — SATU endpoint dengan `action` di body, bukan 6
endpoint terpisah. Proteksi `system/`+`package/directory/` DIULANG di sisi
server (`isProtectedRelPath()`, terpisah dari `isProtectedPath()` di
`system/directory/index.js` yang cuma cegah tampilan editor) — source
MAUPUN destination path sama-sama dicek, supaya Paste/Rename/Delete lewat
context-menu tidak bisa merusak modul yang menjalankan fitur ini sendiri.

Clipboard (Copy/Cut) disimpan di variabel module-level RENDERER
(`nxDirectoryEntry.js`) — BUKAN clipboard OS (path bukan teks yang berguna
di luar app, dan clipboard OS bocor ke aplikasi lain tanpa alasan). Hilang
saat halaman reload, cukup untuk satu sesi kerja (sama seperti file-manager
desktop pada umumnya). Setelah operasi berhasil, tree DAN viewer file
di-refresh penuh (`refreshDirectoryTree()`, re-render dari
`window.renderDirectoryTreeHtml()`) — bukan patch DOM parsial.

## 7b. Target editor CodeMirror (`nx-file-viewer-editor.js`) — id DINAMIS pada container, bukan elemen internal CM6

**Status: DIIMPLEMENTASIKAN, direvisi setelah bug nyata ditemukan.** Area
editor teks (`system/directory/editor.js`, `openFileEditor()`) cuma punya
SATU instance aktif per halaman (desain tab-tunggal) — target ini pakai
entry `id` biasa di `REGISTRY` (`{ id: 'nx-file-viewer-editor', module:
nxFileViewerEditorMod, buildMenu: 'nxFileViewerEditor' }`, lihat §5),
BUKAN `match()` seperti §7a.

**Bug yang ditemukan (klik-kanan di editor selalu jatuh ke menu default)**:
percobaan pertama memasang `id="nx-file-viewer-editor"` pada `<div>` KOSONG
yang dibuat `editor.js` lalu diserahkan ke `new NXUI.Codemirror(editorEl,
...)`. Ternyata `NexaCmirror6._init()`
(`assets/modules/codemirror6/NexaCmirror6.js`) **TIDAK** merender CM6 ke
DALAM elemen yang diberikan konstruktor — ia membuat
`<div class="nexacmirror6-wrap">` **BARU sebagai SIBLING** elemen itu
(`this._element.parentNode.insertBefore(container, this._element.nextSibling)`),
lalu MENYEMBUNYIKAN elemen aslinya (`display:none`). Klik di teks kode yang
benar-benar terlihat jatuh di `.nexacmirror6-wrap` — elemen itu TIDAK
punya `id` apa pun, jadi `closest('[id]')` (App.js) naik terus melewati
`id` yang saya pasang (di elemen tersembunyi) sampai tidak ketemu apa-apa
→ `targetId = null` → menu default.

**Fix — ganti id CONTAINER LUAR (`viewerContainer`) secara dinamis, bukan
kejar struktur internal CM6**: `viewerContainer` yang diterima
`openFileEditor(relPath, viewerContainer)` adalah elemen yang dikontrol
PEMAKAI (`package/directory/index.js`, id asalnya `nx-file-viewer-mount`,
lihat §7c) — `.nexacmirror6-wrap` SELALU berada DI DALAM elemen ini, apa
pun perubahan struktur internal CM6 di masa depan. Solusinya: saat file
BERHASIL dibuka (setelah `readFile()` sukses), `editor.js` mengganti
`viewerContainer.id` jadi `'nx-file-viewer-editor'`, dan
`disposeActiveEditor()` mengembalikannya ke id ASAL (disimpan di
`activeEditorContainerOriginalId`) saat editor ditutup/diganti file lain
ATAU saat `readFile()` gagal (viewer menampilkan pesan error, BUKAN
editor — id tidak boleh nyangkut di `nx-file-viewer-editor`). Konsekuensi:
target context-menu untuk area yang SAMA (`#nx-file-viewer-mount` di HTML)
berubah makna sesuai state — `nx-file-viewer-mount` (§7c, "Refresh Tree")
saat kosong/placeholder/error, `nx-file-viewer-editor` (Save+Undo/dst) saat
file sungguhan sedang terbuka.

**Menu**: item "Save" (memanggil `nxSaveActiveFile()` → `saveActiveEditorFile()`
di `editor.js`, fungsi SAMA PERSIS dengan yang dipicu Ctrl+S — bukan logic
simpan terpisah/duplikat) + role bawaan Electron Undo/Redo/Cut/Copy/Paste/
Select All (sama pola `contes1.js`, bekerja otomatis pada seleksi CM6
aktif, tidak perlu handler `click` custom).

`saveActiveEditorFile()` diekspor dari `editor.js` dan di-assign ulang
(`activeSaveFn`) setiap kali `openFileEditor()` berhasil sampai tahap
render — no-op aman kalau dipanggil sebelum ada file dibuka. `system/
contextmenu/nx-file-viewer-editor.js` meng-import langsung dari
`../directory/editor.js` (modul biasa, sesama `system/`) — TIDAK lewat
`window.*` (beda dari 4 fungsi lain di `system/index.js` yang memang harus
global untuk dipanggil `package/*` tanpa import).

## 7c. Target viewer di luar editor (`nxFileViewerMount.js`) — id "asal" container yang sama dengan §7b

**Status: DIIMPLEMENTASIKAN.** `#nx-file-viewer-mount` (dari
`package/directory/index.js`, elemen `viewerContainer` yang sama dipakai
§7b) adalah id ASAL container viewer — aktif sebagai target SELAMA belum
ada file terbuka (placeholder awal "Klik salah satu file...") ATAU setelah
editor ditutup/gagal load. Begitu file berhasil dibuka, id elemen yang SAMA
berubah jadi `nx-file-viewer-editor` (§7b) — TIDAK ada dua elemen berbeda,
satu elemen yang id-nya berubah sesuai state, dikelola sepenuhnya oleh
`editor.js` (`disposeActiveEditor()`/`openFileEditor()`), pemakai
(`package/directory/index.js`) tidak perlu tahu soal pertukaran ini sama
sekali — cukup beri id awal `nx-file-viewer-mount` seperti biasa.

Menu di sini murni navigasi cepat (`Refresh Tree` — re-render tree tanpa
reload halaman) karena TIDAK ada state file aktif untuk diproses (beda
dari §7b yang punya Save/Undo/dst terikat instance editor aktif).

**Prinsip umum yang terkonfirmasi lewat §7a/§7b/§7c**: file pemakai
(`package/*`) bebas mendefinisikan id sebanyak apa pun di layout-nya
sendiri (lihat juga `id="editor"` pada wadah `.col-10` di
`package/directory/index.js`, membungkus `#nx-file-viewer-mount` — fallback
kalau suatu saat dibutuhkan target di level lebih luar) — `system/
contextmenu/index.js` (`REGISTRY`) yang menentukan target mana yang punya
context-menu kustom. Elemen boleh bahkan MENGGANTI id-nya sendiri secara
dinamis sesuai state runtime (§7b) — `REGISTRY`/`closest('[id]')` tidak
peduli id itu statis dari HTML awal atau di-set lewat JS, keduanya sama
validnya.

## 8. Pertanyaan terbuka (perlu keputusan sebelum/selama implementasi)

- **Override total vs tambahan**: apakah `NXCONTEXTMENU` HARUS selalu berupa
  tambahan (prepend ke default), atau perlu opsi eksplisit "ganti total menu
  untuk id ini" (mis. return `{ replace: true, items: [...] }`)? Contoh
  `#contes1`/`#contes2` yang diberikan user belum menentukan ini.
- ~~Nested/skala banyak id~~ **SUDAH DIPUTUSKAN** (lihat §5): satu file per
  target (`contes1.js`, `contes2.js`, dst), `index.js` cuma peta registrasi
  (`{ contes1, contes2 }`) — bukan `if/else` monolitik. Menambah target baru
  = tambah file + 1 baris map, tidak menyentuh file lain.
- **Scoping pencarian `id`**: listener global `document.addEventListener('contextmenu', ...)`
  di `App.js` akan menangkap SEMUA elemen ber-`id` di seluruh halaman,
  termasuk elemen milik SHELL sendiri (mis. `#nx-titlebar`, `#main`,
  `#nxhome`) — perlu whitelist/prefix konvensi (mis. hanya `id` yang
  terdaftar lewat `NXCONTEXTMENU`, bukan sembarang `id` HTML) supaya tidak
  tidak sengaja override menu global saat klik kanan di elemen shell.
- **Performa dynamic import per klik-kanan**: memuat ulang module extension
  setiap kali klik kanan (bukan cache) menghindari masalah 6a (cache-busting)
  tapi menambah I/O tiap klik. Perlu diverifikasi apakah overhead ini terasa
  (`import()` module kecil biasanya sub-milidetik, tapi tetap perlu dites).
- **Package (componen) juga butuh context-menu sendiri?** Saat ini rencana
  hanya mencakup `system/contextmenu/` (bawaan extension). Kalau componen
  di `package/{nama}/` juga perlu context-menu sendiri, perlu pola resolusi
  tambahan (mirip shorthand routing `distro/package/{nama}/{file}`) — DI LUAR
  cakupan draf ini, dicatat sebagai potensi perluasan.

---

> Rujukan alur existing: `templates/README.md` (histori bug/fix pola
> `system/`, `distroGrafis`, shorthand routing) dan `templates/FLOW.md`
> (ringkasan diagram). Referensi kode: `electron/electronShell.js`
> (`buildContextMenuTemplate`), `electron/main.js` (`attachPageContextMenu`,
> `getContextMenuBuilder`, `registerShortcutIpc` sebagai pola IPC sinkronisasi),
> `templates/distro/Rebit/system/titlebar/index.js` (pola konvensi
> fungsi baku `NXTITLEBAR`/`NXHOME` yang diikuti `NXCONTEXTMENU`).
