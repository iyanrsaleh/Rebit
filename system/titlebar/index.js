// Title bar custom extension "Rebit" — dipanggil dari App.js
// (loadTitlebar()), sekali di awal, dirender ke <div id="nx-titlebar">
// di index.html. Shell TIDAK punya title bar sistem sendiri
// (electron/main.js: frame: false) — NXTITLEBAR adalah konvensi baku
// nama fungsi pembuka titlebar tiap extension, sama pola dengan NXHOME.
// Style di ./style.css (sudah otomatis ter-@import ke
// templates/workspace.css saat instalasi — lihat templates/README.md).
//
// Lokasi: templates/distro/{id}/system/ — bagian SISTEM/bawaan shell
// (wajib/inti extension), BUKAN componen (fitur tambahan opsional di
// templates/distro/{id}/package/{nama}/). Pemisahan ini murni organisasi
// folder supaya jelas mana yang "mesin" extension vs mana yang "fitur
// tambahan" yang bisa diinstall/uninstall terpisah.
//
// window.NxExtension SUDAH GLOBAL otomatis (assets/modules/extension/
// NxExtension.js, dipasang kernel — TIDAK perlu import sama sekali,
// diekstrak dari templates/storage/index.js yang sebelumnya wajib
// di-import manual dengan path relatif).

export async function NXTITLEBAR(container) {
  // getActiveExtension() = distroGrafis (IndexedDB) apa adanya — detail
  // internal shell disembunyikan lewat window.NxExtension, extension
  // tidak perlu tahu soal window.NXUI.ref/IndexedDB sama sekali.
  const distro = await window.NxExtension.getActiveExtension();
  const title = distro?.title || distro?.id || 'App';
  const iconSrc = distro?.brend?.ico || distro?.brend?.icon || '';

  container.innerHTML = `
    <div class="nx-titlebar">
      <div class="nx-titlebar__brand">
        ${iconSrc ? `<img class="nx-titlebar__icon" src="/templates${iconSrc}" alt="" />` : ''}
        <span class="nx-titlebar__title">${title}</span>
      </div>
      <div class="nx-titlebar__controls">
        <button type="button" class="nx-titlebar__btn" data-nx-win="minimize" aria-label="Minimize">&#x2212;</button>
        <button type="button" class="nx-titlebar__btn" data-nx-win="maximize" aria-label="Maximize">&#x25A1;</button>
        <button type="button" class="nx-titlebar__btn nx-titlebar__btn--close" data-nx-win="close" aria-label="Close">&#x2715;</button>
      </div>
    </div>
  `;

  container.querySelector('[data-nx-win="minimize"]')?.addEventListener('click', () => {
    window.electronAPI?.windowMinimize?.();
  });
  container.querySelector('[data-nx-win="maximize"]')?.addEventListener('click', () => {
    window.electronAPI?.windowMaximizeToggle?.();
  });
  container.querySelector('[data-nx-win="close"]')?.addEventListener('click', () => {
    window.electronAPI?.windowClose?.();
  });
}
