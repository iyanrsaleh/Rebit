// Titik registrasi GLOBAL fitur sistem distro "Rebit" — dimuat
// SEKALI oleh templates/distro/grafis.js (shell, generik untuk semua
// distro) sebelum NXHOME/route distro/package/* mana pun diakses. File
// ini TIDAK di-import manual oleh file lain di dalam distro — sebaliknya,
// file ini yang meng-assign fungsi ke window supaya SEMUA file di distro
// ini (termasuk package/{nama}/index.js) bisa memanggilnya langsung
// TANPA import sama sekali.
//
// window.NxStorage / window.NxDirectory SUDAH global otomatis dari shell
// (di-scope dari stack trace pemanggil, lihat assets/modules/nxdom.js) —
// tidak perlu didaftarkan lagi di sini. Yang didaftarkan di sini adalah
// HASIL OLAHAN milik distro ini (traverse + render HTML, viewer isi file,
// bucket IndexedDB khusus distro ini), logicnya ada di
// system/directory/index.js, system/directory/editor.js, dan
// system/buckets/index.js (modul biasa, di-import HANYA dari sini).
import { renderDirectoryTreeHtml, attachDirectoryTreePersistence } from './directory/index.js';
import { openFileEditor, attachFileClickViewer } from './directory/editor.js';
import { initDistroBuckets, bucket } from './buckets/index.js';

window.renderDirectoryTreeHtml = renderDirectoryTreeHtml;
window.attachDirectoryTreePersistence = attachDirectoryTreePersistence;
window.openFileEditor = openFileEditor;
window.attachFileClickViewer = attachFileClickViewer;
// saveActiveEditorFile TIDAK perlu window global — dipakai HANYA oleh
// system/contextmenu/nxEditorTarget.js, yang meng-import langsung dari
// directory/editor.js (modul biasa, sama-sama di dalam system/). Beda
// dari 4 fungsi di atas yang dipanggil dari package/* (file pemakai,
// kontrak "tanpa import" — lihat komentar atas file ini).

// Bucket IndexedDB TERPISAH dari database kernel — lihat
// templates/bucketsDistro.md. Tambahkan nama store di array kedua kalau
// distro ini butuh tabel custom baru (naikkan version kalau perlu
// migrasi skema). try/catch supaya kegagalan IndexedDB (quota, private
// mode, dst) TIDAK menggagalkan NXHOME — window.DistroBuckets tetap
// terdefinisi, method-nya sendiri yang akan reject kalau init gagal.
try {
  await initDistroBuckets('Rebit', [], 1);
} catch (err) {
  console.error('[system/index.js] gagal inisialisasi DistroBuckets:', err);
}
window.DistroBuckets = bucket;
