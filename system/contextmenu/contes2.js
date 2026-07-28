// Target "contes2" — dipanggil dari index.js (REGISTRY) saat user klik-kanan
// di dalam elemen <div id="contes2"> (templates/distro/Rebit/index.js).
// Nama fungsi/file BEBAS — index.js men-deklarasikan eksplisit modul+fungsi
// mana yang menangani id ini (lihat REGISTRY di index.js, direvisi dari
// konvensi lama "nama fungsi = nama file", README.md §5).
//
// Submenu di sini SENGAJA dihubungkan ke route yang SAMA dengan link <a> di
// index.js (Cotoh 2 → #distro/cotoh, componen → /boot/componen, instal →
// /instal) — contoh bahwa context-menu bisa jadi jalan pintas navigasi,
// bukan cuma aksi custom.
//
// Aksi klik dieksekusi lewat SATU role generik
// (electron/components/nexaContextAction.js, dispatch dinamis) — bukan file
// terpisah per aksi. helpers.sendAction(actionName) mengirim
// { extensionId, targetId, actionName } ke main → renderer →
// nexaContextAction.js baca REGISTRY index.js untuk tahu modul mana yang
// menangani targetId ini, panggil fungsi bernama actionName yang
// di-export di bawah (mis. NXUI.load(route) untuk navigasi — fungsi
// renderer, TIDAK bisa dipanggil langsung dari main process, harus lewat
// jalur ini). Lihat README.md §5/§6.
export function contes2(targetId, helpers) {
  return [
    {
      label: 'Aksi khusus Contes 2',
      // icon HARUS PNG — nativeImage Electron tidak bisa decode SVG
      // (diverifikasi langsung, lihat README.md §5b).
      icon: helpers.icon('icon-contes2.png'),
      click: () => helpers.sendAction('runContes2Action'),
    },
    { type: 'separator' },
    {
      label: 'Navigasi',
      submenu: [
        { label: 'Cotoh 2 (distro/cotoh)', click: () => helpers.sendAction('gotoDistroCotoh') },
        { label: 'Componen (boot/componen)', click: () => helpers.sendAction('gotoBootComponen') },
        { type: 'separator' },
        {
          label: 'Lainnya',
          submenu: [
            { label: 'Instal (instal)', click: () => helpers.sendAction('gotoInstal') },
          ],
        },
      ],
    },
  ];
}

// Dipanggil oleh electron/components/nexaContextAction.js (dynamic import
// balik ke file ini). Nama tiap fungsi HARUS sama dengan actionName di
// sendAction() di atas.
export async function runContes2Action() {
  console.log('[ContextMenu] Aksi Contes 2 dijalankan');
  return { success: true };
}

export async function gotoDistroCotoh() {
  return NXUI.load('distro/cotoh');
}

export async function gotoBootComponen() {
  return NXUI.load('boot/componen');
}

export async function gotoInstal() {
  return NXUI.load('instal');
}
