// Target "contes1" — dipanggil dari index.js (registry) saat user klik-kanan
// di dalam elemen <div id="contes1"> (templates/distro/Rebit/index.js).
// Nama fungsi HARUS sama dengan nama file dan key registry (lihat README.md §5).
//
// Aksi klik ("Aksi khusus Contes 1") dieksekusi lewat SATU role generik
// (electron/components/nexaContextAction.js, dispatch dinamis) — bukan file
// terpisah per aksi. helpers.sendAction(actionName) mengirim
// { extensionId, targetId, actionName } ke main → renderer →
// nexaContextAction.js dynamic-import file INI LAGI, panggil fungsi
// bernama actionName yang di-export di bawah. Lihat README.md §5/§6.
export function terminal(helpers) {
  return [
    {
      label: 'Aksi khusus Contes 1',
      // icon HARUS PNG — nativeImage Electron tidak bisa decode SVG
      // (diverifikasi langsung, lihat README.md §5b). File dicari relatif
      // ke folder contextmenu/ ini sendiri.
      icon: helpers.icon('icon-contes1.png'),
      click: () => helpers.sendAction('runContes1Action'),
    },
    { type: 'separator' },
    // role bawaan Electron — otomatis bekerja pada seleksi teks/input aktif
    // di window ini, tidak perlu handler click custom.
    { role: 'undo', label: 'Undo' },
    { role: 'redo', label: 'Redo' },
    { type: 'separator' },
    { role: 'cut', label: 'Cut' },
    { role: 'copy', label: 'Copy' },
    { role: 'paste', label: 'Paste' },
    { role: 'selectAll', label: 'Select All' },
    { type: 'separator' },
  ];
}

// Dipanggil oleh electron/components/nexaContextAction.js (dynamic import
// balik ke file ini). Nama HARUS sama dengan actionName di sendAction() atas.
export async function runContes1Action() {
  console.log('[ContextMenu] Aksi Contes 1 dijalankan');
  return { success: true };
}
