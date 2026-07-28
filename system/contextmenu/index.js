// Titik registrasi context-menu per-target extension "Rebit".
// Dipanggil dari electron/electronShell.js (main process, dynamic import())
// saat event native 'context-menu' terjadi dan targetId (id elemen HTML yang
// diklik-kanan) sudah diketahui — lihat README.md di folder ini.
//
// TIDAK berisi logic menu sendiri — cuma import tiap file target + peta
// registrasi.
//
// REGISTRY = SATU-SATUNYA sumber kebenaran pemetaan target → modul (dipakai
// DUA arah: membangun menu di sini, DAN dispatch balik aksi klik di
// electron/components/nexaContextAction.js — lihat resolveContextMenuEntry()
// di bawah, diimpor LANGSUNG oleh nexaContextAction.js, BUKAN ditebak dari
// targetId). Sebelumnya nama file target DITEBAK dari targetId (targetId
// dipakai apa adanya sebagai nama file, atau lewat pola prefix khusus untuk
// target dinamis) — rapuh: id HTML dan nama file jadi terikat implisit,
// developer bisa mengganti salah satunya tanpa sadar mematahkan yang lain,
// dan id yang sama bisa saja dipakai ulang untuk keperluan lain di masa
// depan tanpa ada yang memperingatkan. Sekarang setiap entry MENDEKLARASI
// eksplisit modul mana yang menanganinya — mengganti nama file cukup ubah
// satu baris `module` di sini, tidak perlu id HTML ikut berubah, dan
// sebaliknya.
//
// Menambah target BARU (id HTML statis) = 1 file (isi bebas nama fungsi) +
// 1 entry REGISTRY di bawah, tanpa menyentuh entry lain.
import * as contes1Mod from './contes1.js';
import * as contes2Mod from './contes2.js';
// nxDirectoryEntry — target DINAMIS (tree direktori, system/directory/
// index.js): banyak id (nxfile::<path-encoded>, satu per file/folder) + id
// container (nx-directory-tree-mount) SEMUA ditangani SATU modul ini, lewat
// entry match() (bukan id persis) — lihat REGISTRY di bawah.
import * as nxDirectoryEntryMod from './nxDirectoryEntry.js';
// nxFileViewerEditor — target STATIS id="nx-file-viewer-editor" (area
// editor CodeMirror, system/directory/editor.js).
import * as nxFileViewerEditorMod from './nx-file-viewer-editor.js';
// nxFileViewerMount — target STATIS id="nx-file-viewer-mount" (container
// viewer, package/directory/index.js) — klik-kanan DI LUAR editor CM6 (mis.
// masih placeholder, belum ada file dibuka). BEDA dari
// nx-file-viewer-editor (di DALAM editor, saat file sedang terbuka) —
// closest('[id]') otomatis memilih target terdekat dari titik klik.
import * as nxFileViewerMountMod from './nxFileViewerMount.js';

// Saklar MATIKAN SEMUA context-menu kustom extension ini sekaligus (semua
// target) — set false untuk mematikan total, semua klik-kanan balik ke
// menu default polos (Refresh/Beranda/Terminal/dll, itu terpisah di
// electron/electronShell.js, TIDAK ikut mati). REGISTRY di bawah TIDAK
// disentuh saat dimatikan — tidak perlu hapus entry satu-satu.
const ENABLED = true;

/**
 * REGISTRY — array (BUKAN object keyed by id), urutan menentukan prioritas
 * pencarian (entry match dinamis dicek dalam urutan array, entry pertama
 * yang cocok menang). Tiap entry:
 *   - id: string, cocok kalau targetId === id PERSIS (target statis, mis.
 *     contes1/contes2/nx-file-viewer-editor). SALING EKSKLUSIF dengan match.
 *   - match: (targetId) => boolean, cocok kalau fungsi ini true (target
 *     dinamis, mis. tree direktori — banyak id mentah berbeda ditangani
 *     satu modul). SALING EKSKLUSIF dengan id.
 *   - module: namespace object hasil `import * as X from './file.js'` —
 *     modul SEBENARNYA yang menangani target ini, dipakai baik untuk
 *     membangun menu (buildMenu) MAUPUN dispatch balik aksi klik
 *     (nexaContextAction.js baca module ini lewat resolveContextMenuEntry(),
 *     BUKAN import(`${targetId}.js`) hasil tebakan).
 *   - buildMenu: nama fungsi di dalam `module` yang dipanggil untuk
 *     membangun array item menu (menggantikan konvensi lama "nama fungsi =
 *     nama file" — sekarang dieksplisitkan di sini, fungsi boleh dinamai
 *     bebas).
 *
 * Untuk MEMATIKAN/MENYEMBUNYIKAN satu target saja (target lain tetap
 * aktif) — hapus/comment entry-nya di array ini, TIDAK perlu hapus
 * file/import. Target yang dihapus otomatis balik ke menu default polos.
 */
const REGISTRY = [
  { id: 'contes1', module: contes1Mod, buildMenu: 'contes1' },
  { id: 'contes2', module: contes2Mod, buildMenu: 'contes2' },
  { id: 'nx-file-viewer-editor', module: nxFileViewerEditorMod, buildMenu: 'nxFileViewerEditor' },
  { id: 'nx-file-viewer-mount', module: nxFileViewerMountMod, buildMenu: 'nxFileViewerMount' },
  {
    match: (targetId) => targetId.startsWith('nxfile::') || targetId === 'nx-directory-tree-mount',
    module: nxDirectoryEntryMod,
    buildMenu: 'nxDirectoryEntry',
  },
];

/**
 * Cari entry REGISTRY yang cocok untuk targetId — dipakai DUA tempat: di
 * bawah (NXCONTEXTMENU, bangun menu) dan electron/components/
 * nexaContextAction.js (dispatch balik aksi klik, lewat dynamic import file
 * INI sendiri lalu panggil fungsi ini — bukan duplikasi logic pencarian di
 * dua tempat berbeda yang bisa saling tidak sinkron).
 * @param {string} targetId
 * @returns {{module: object, buildMenu: string} | null}
 */
export function resolveContextMenuEntry(targetId) {
  if (!targetId) return null;
  for (const entry of REGISTRY) {
    const matched = entry.match ? entry.match(targetId) : entry.id === targetId;
    if (matched) return entry;
  }
  return null;
}

// targetId: id elemen HTML yang diklik-kanan, atau null. helpers: subset
// aman API main.js (mis. { sendRole(role) } — lihat electronShell.js).
// Return array item menu TAMBAHAN (di-prepend ke menu default), atau
// null/undefined kalau targetId tidak terdaftar (pakai menu default saja).
export function NXCONTEXTMENU(targetId, helpers) {
  if (!ENABLED) return null;
  const entry = resolveContextMenuEntry(targetId);
  if (!entry) return null;
  const fn = entry.module[entry.buildMenu];
  return typeof fn === 'function' ? fn(targetId, helpers) : null;
}
