# Panduan Developer Distro "Rebit"

> Dokumen ini untuk developer yang bekerja **DI DALAM** distro ini —
> menambah halaman, fitur, storage, dst. Untuk arsitektur KERNEL (kalau
> perlu mengubah `assets/modules/nxdom.js` atau menambah API global baru
> yang dipakai SEMUA distro), baca `templates/Karnel.md` dulu.

## 1. Apa itu "distro" di sini

Distro = satu extension/tema aplikasi. **Hanya SATU distro aktif** dalam
satu instalasi (dicatat di IndexedDB store `distroGrafis`, dibaca lewat
`window.NxExtension.getActiveExtension()`). `Rebit` adalah distro
**contoh/referensi** — pola-polanya (file browser, editor, context-menu,
resize kolom) dibangun di sini sebagai bukti-konsep yang bisa ditiru
distro lain.

## 2. Struktur folder distro ini

```
templates/distro/Rebit/
  index.js          ← WAJIB, export async function NXHOME(container, routeMeta)
  home.js            ← route default (dimuat otomatis kalau App.js config "home")
  cotoh.js           ← contoh route tambahan
  style.css          ← CSS khusus distro ini (auto-@import, lihat §5)
  package.json       ← manifest distro (id, title, gitrepo, dll — lihat §7)
  assets/
    fonts/            ← font khusus distro (lihat §5, contoh: Fluent Icons)
    brend/            ← favicon.ico, icon.png (dirujuk package.json "brend")
  storage/            ← data JSON per-nama (window.NxStorage, lihat §4)
  package/
    manifest.json      ← { "componen": ["news","gallery","directory"] }
    {nama}/
      index.js          ← export async function index(page, route) — SATU route
      package.json       ← manifest componen (id, title, description, dll)
      style.css           ← opsional, auto-@import juga
  system/
    index.js           ← titik registrasi TUNGGAL (lihat §3 — WAJIB paham ini duluan)
    titlebar/           ← custom titlebar (opsional, konvensi NXTITLEBAR)
    contextmenu/         ← context-menu klik-kanan (lihat §6)
    buckets/              ← IndexedDB terpisah khusus distro ini
    directory/             ← contoh fitur: file browser + editor (lihat §6)
```

**Aturan penamaan fungsi entry** (konvensi baku, JANGAN diubah namanya):
- `index.js` root distro → `export async function NXHOME(container, routeMeta)`
- `system/titlebar/index.js` → `export async function NXTITLEBAR(container)`
- `package/{nama}/index.js` → `export async function {nama}(page, route)`
  (nama fungsi = nama folder, lihat `package/gallery/index.js`/`news/index.js`)

## 3. `system/index.js` — WAJIB dipahami sebelum menambah fitur apa pun

`templates/distro/grafis.js` (shell, generik untuk semua distro) memuat
`system/index.js` **SEKALI**, **SEBELUM** `NXHOME`/route `package/*` mana
pun bisa diakses. File ini adalah **satu-satunya** titik registrasi fitur
turunan milik distro ini — hasilnya di-assign ke `window.*` sebagai
side-effect.

**Kontrak yang SELALU dijaga**: `package/{nama}/index.js` (pemakai) TIDAK
PERNAH `import` apa pun dari `system/` — cukup panggil `window.fungsiItu(...)`
langsung. Lihat komentar di puncak tiap `package/*/index.js` yang menegaskan
ini ("TIDAK ADA import di file ini").

```js
// system/index.js — pola nyata yang sudah ada
import { renderDirectoryTreeHtml, attachDirectoryTreePersistence } from './directory/index.js';
import { openFileEditor, attachFileClickViewer } from './directory/editor.js';
import { initDistroBuckets, bucket } from './buckets/index.js';

window.renderDirectoryTreeHtml = renderDirectoryTreeHtml;
window.attachDirectoryTreePersistence = attachDirectoryTreePersistence;
window.openFileEditor = openFileEditor;
window.attachFileClickViewer = attachFileClickViewer;

try {
  await initDistroBuckets('Rebit', [], 1);
} catch (err) {
  console.error('[system/index.js] gagal inisialisasi DistroBuckets:', err);
}
window.DistroBuckets = bucket;
```

**Menambah fitur baru milik distro ini** = 3 langkah:
1. Tulis logic sebagai modul biasa di `system/{fitur baru}/index.js`
   (`export function ...`), TIDAK menyentuh `window` di file itu sendiri.
2. `import` modul itu di `system/index.js`, assign ke `window.namaFungsi`.
3. Pakai `window.namaFungsi(...)` dari `package/{nama}/index.js` mana pun
   — tanpa import.

## 4. API kernel yang SUDAH GLOBAL — TIDAK PERLU import sama sekali

Empat modul ini dipasang kernel (`assets/modules/nxdom.js`) sebelum
`NXHOME` bisa diakses — panggil langsung `window.NxX.method(...)`, TANPA
`import`, dari file mana pun di distro ini (termasuk dari dalam
`system/index.js` sendiri):

| | Kegunaan | Detail lengkap |
|---|---|---|
| `window.NxDirectory` | Baca/tulis file & folder di dalam distro ini (sandbox, tidak bisa keluar) — `readFile`, `writeFile`, `traverseDirectory`, `readImage`, `op` (copy/move/rename/delete/mkdir/mkfile), dll | `assets/modules/directory/README.md` |
| `window.NxStorage` | Baca/tulis JSON per-nama di `storage/{nama}.json` — `NxStorage('nama')`, `.save(data)`, `.list()` | `assets/modules/storage/README.md` |
| `window.NxResize` | Drag-to-resize panel dengan persistensi localStorage | `assets/modules/resize/README.md` |
| `window.NxExtension` | Data distro aktif & componen terinstal — `getActiveExtension()`, `listInstalledComponenFor()`, dll | `assets/modules/extension/README.md` |

**PENTING — jangan tertebak salah**: keempat modul di atas TIDAK PERNAH
dicari lewat `import`. Kalau butuh salah satu fungsi di atas, cukup
panggil `window.NxX.method(...)` — kalau ternyata "belum ada", cek dulu
apakah namanya benar (lihat README modul terkait), JANGAN langsung tulis
`import` manual ke path relatif (rawan 404 kalau folder sumber dipindah —
lihat histori kasus `templates/storage/index.js`, yang sempat wajib
di-import manual di banyak file lalu foldernya dipindah/dihapus dan
membuat SEMUA pemakai 404, sebelum akhirnya diekstrak jadi
`window.NxExtension`, lihat `templates/Karnel.md` §7a).

Contoh pakai `NxStorage` (dari `package/directory/index.js`):
```js
const data = await window.NxStorage('tabel');       // GET
await window.NxStorage('tabel').save({ foo: 1 });   // POST, replace penuh
```

## 5. CSS & aset distro — auto-import, bukan manual `<link>`

`templates/distro/Rebit/style.css` (dan `package/{nama}/style.css`
kalau ada) **otomatis** ter-`@import` ke `templates/workspace.css` saat
instalasi — TIDAK perlu tambah `<link>` manual di HTML mana pun. Detail
mekanisme di `templates/README.md` bagian "workspace.css auto-import".

Font/aset statis khusus distro ini ditaruh di `assets/` (contoh nyata:
`assets/fonts/FluentSystemIcons-Regular.{css,ttf,woff,woff2}`, didaftarkan
lewat `@import url("./assets/fonts/FluentSystemIcons-Regular.css")` di
`style.css` root distro). **Hapus file yang tidak dipakai** — file demo
(`.html`) dan metadata mentah (`.json`) dari tool generator font TIDAK
pernah di-load runtime, jangan disertakan (lihat histori: folder
`assets/fonts/` awalnya 4 varian + demo + metadata, ~20MB, dipangkas jadi
1 varian dipakai (`.css`+`.ttf`+`.woff`+`.woff2` saja), ~5.3MB).

## 6. Fitur contoh yang sudah dibangun di `system/directory/`

Referensi lengkap kalau mau membuat fitur sejenis (file browser, editor,
context-menu klik-kanan) di distro lain:

- **Tree file** (`system/directory/index.js`,
  `window.renderDirectoryTreeHtml()`) — persisten expand/collapse via
  localStorage, icon per-tipe file (`.icon-*`, class global sudah ada, TIDAK
  perlu dicari tahu posisinya), file di `system/`+`package/directory/`
  ditandai `--protected` (redup, tidak bisa diklik — modul yang menjalankan
  fitur ini sendiri, mencegah developer menimpanya lewat editornya sendiri).
- **Editor baca-tulis** (`system/directory/editor.js`,
  `window.openFileEditor()`/`window.attachFileClickViewer()`) — CodeMirror6
  dari kernel (`window.NXUI.Codemirror`, WAJIB `await loadDependencies()`
  sebelum instansiasi), Ctrl+S untuk simpan, persisten file terakhir dibuka
  (localStorage). File **gambar** dibuka sebagai `<img>` (bukan CodeMirror,
  `window.NxDirectory.readImage()`), file **`.md`** dapat tab toggle
  [Markdown | Preview] (`window.NXUI.NexaMarkdown` — **BUKAN**
  `window.NXUI.Markdown`, itu fungsi lain, lihat catatan di kode).
- **Context-menu klik-kanan** (`system/contextmenu/`) — `REGISTRY` array +
  `resolveContextMenuEntry()` di `index.js`, target statis (`id` tetap) atau
  dinamis (`match(targetId)` untuk elemen yang jumlahnya berubah-ubah, mis.
  file di tree). Baca `system/contextmenu/README.md` SEBELUM menambah
  target baru — jangan menebak nama file dari `targetId`.
- **Kolom resizable** (`package/directory/index.js`) — layout flexbox +
  `window.NxResize()`, GANTI dari grid persentase tetap (`row`/`col-*`)
  yang tidak bisa ditarik user.

## 7. `package.json` distro & componen — field yang dipakai shell

```json
{
  "id": "Rebit",
  "title": "Rebit",
  "description": "...",
  "version": "1.0.0",
  "author": "...",
  "brend": { "ico": "/distro/Rebit/assets/brend/favicon.ico", "icon": "..." },
  "endpoint": "http://...",
  "gitrepo": "https://github.com/.../Rebit.git",
  "package": "https://github.com/.../Rebit/tree/main/package",
  "repodev": "D:/Extensions/Rebit"
}
```

`gitrepo`+`package` dipakai `templates/boot/componen.js` untuk daftar
componen yang bisa di-install (endpoint `/nexa-list-componen`). Tiap
`package/{nama}/package.json` (format lebih sederhana: `id`, `title`,
`description`, `version`, `author`, `brend`, `endpoint`) dibaca saat
listing componen tersedia. `package/manifest.json` (`{ "componen": [...] }`)
mencatat componen yang SUDAH ada secara fisik di folder ini.

## 8. Menambah halaman/route baru — checklist

1. Buat folder `package/{namaBaru}/` — `index.js` (export
   `async function {namaBaru}(page, route)`), `package.json` (format §7).
2. Di dalam `index.js`, panggil `route.register(page, async (routeName,
   container, routeMeta, style, nav) => { ... })` — lihat
   `package/directory/index.js` sebagai contoh lengkap (termasuk cara
   pasang tree file, resize, dan viewer sekaligus).
3. **TIDAK ADA import** dari `system/` — kalau butuh fungsi turunan
   distro, pastikan sudah didaftarkan di `system/index.js` (§3) dulu.
4. Tambahkan `{namaBaru}` ke array `componen` di `package/manifest.json`
   kalau memang mau tercatat sebagai componen resmi.
5. Link ke halaman baru bisa ditambah di `index.js` (NXHOME) — lihat
   pola link yang sudah ada (`#distro/package/{nama}/index`).

## 9. Sebelum menganggap perubahan di distro ini "selesai"

- [ ] `node --check --input-type=module` pada semua `.js` yang diubah.
- [ ] TIDAK ADA `import` baru dari `package/*/index.js` ke `system/*` —
      kalau butuh, daftarkan dulu di `system/index.js` (§3).
- [ ] TIDAK ADA `import` manual ke fungsi yang sudah punya versi
      `window.NxX.*` (§4) — cek README modul terkait dulu.
- [ ] File sisa eksperimen/test **tidak** ditinggalkan di folder ini
      (folder distro contoh nyata harus bersih) — test sekali-pakai
      ditaruh di scratchpad sesi, dihapus setelah lolos.
- [ ] Kalau menambah target context-menu baru: baca
      `system/contextmenu/README.md` dulu, daftarkan lewat `REGISTRY`
      (§6), bukan menebak nama file.
