// Target "nx-file-viewer-editor" — dipanggil dari index.js (REGISTRY) saat
// user klik-kanan DI DALAM area editor CodeMirror (system/directory/
// editor.js, elemen id="nx-file-viewer-editor"). id STATIS (satu editor
// aktif per halaman, pola sama dengan #contes1/#contes2, README.md §5) —
// BEDA dari nxDirectoryEntry.js (§7a, target dinamis tree direktori).
//
// Nama file/fungsi BEBAS — index.js (REGISTRY) men-deklarasikan eksplisit
// modul+fungsi mana yang menangani id ini, TIDAK lagi ditebak dari targetId
// (revisi dari konvensi lama "nama file harus sama dengan id", lihat
// README.md §5/§7b) — nama file boleh berubah kapan pun tanpa mematahkan
// dispatch aksi klik, cukup ubah satu baris REGISTRY di index.js.
import { saveActiveEditorFile } from '../directory/editor.js';

export function nxFileViewerEditor(targetId, helpers) {
  return [
    {
      label: 'Save',
      click: () => helpers.sendAction('nxSaveActiveFile'),
    },
    { type: 'separator' },
    // role bawaan Electron — otomatis bekerja pada seleksi teks/kursor
    // aktif di textarea/contenteditable CM6, tidak perlu handler click
    // custom (sama pola dengan contes1.js).
    { role: 'undo', label: 'Undo' },
    { role: 'redo', label: 'Redo' },
    { type: 'separator' },
    { role: 'cut', label: 'Cut' },
    { role: 'copy', label: 'Copy' },
    { role: 'paste', label: 'Paste' },
    { role: 'selectAll', label: 'Select All' },
  ];
}

// Dipanggil oleh electron/components/nexaContextAction.js (dynamic import
// balik ke file INI — lihat catatan di atas soal nama file = targetId).
export async function nxSaveActiveFile() {
  await saveActiveEditorFile();
  return { success: true };
}
