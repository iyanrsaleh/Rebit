// Export function untuk route 'contact/data' (menjadi 'contact_data.js')
//
// TIDAK ADA import di file ini. window.renderDirectoryTreeHtml,
// window.attachDirectoryTreePersistence, window.attachFileClickViewer
// sudah didaftarkan GLOBAL oleh templates/distro/Rebit/system/index.js
// (dimuat otomatis oleh templates/distro/grafis.js sebelum route ini bisa
// diakses) — logic traverse + render HTML + persistensi expand/collapse +
// viewer isi file ada di system/directory/index.js dan
// system/directory/editor.js, bukan di sini. File ini murni PEMAKAI hasil jadi.
export async function index(page, route) {
  route.register(page, async (routeName, container, routeMeta = {
    title: "Contact Data | App",
    description: "Data kontak.",
  }, style, nav = {}) => {
    route.routeMetaByRoute.set(page, routeMeta);
    const data = await window.NxStorage('tabel');
    const treeHtml = await window.renderDirectoryTreeHtml();

    console.log("📍 NxStorage to:", data);
    container.innerHTML = `
        <article class="nx-page">
          <h1 class="nx-page__title">gallery Data Page</h1>
          <p class="nx-page__lead">Ini adalah halaman Contact Data.</p>
          <h2>Struktur folder distro</h2>
<div class="nx-directory-layout" id="nx-directory-layout">
    <div class="nx-directory-layout__tree" id="nx-directory-tree-mount">${treeHtml}</div>
    <div class="nx-directory-layout__resize-handle" id="nx-directory-resize-handle"></div>
    <div class="nx-directory-layout__viewer" id="editor">
      <div id="nx-file-viewer-mount"><p class="nx-file-viewer__placeholder">Klik salah satu file di daftar untuk melihat isinya.</p></div>
    </div>
</div>
        </article>
      `;

    // Pasang SETELAH innerHTML terpasang di DOM — attachDirectoryTreePersistence/
    // attachFileClickViewer butuh elemen nyata (<details>, <div data-nx-file-path>)
    // untuk dipasangi listener, bukan string HTML. relPath default '.' harus
    // SAMA dengan yang dipakai renderDirectoryTreeHtml() di atas (keduanya
    // default '.') supaya key localStorage & path file yang diklik cocok.
    const treeMount = document.getElementById('nx-directory-tree-mount');
    window.attachDirectoryTreePersistence(treeMount);
    window.attachFileClickViewer(treeMount, document.getElementById('nx-file-viewer-mount'));

    // Kolom tree bisa ditarik lebarnya (drag handle di antara tree dan
    // viewer) — beberapa nama file panjang terpotong di lebar tetap
    // col-2 (grid persentase) lama, TIDAK ada cara memperlebar sebelum ini.
    // window.NxResize (assets/modules/resize/NexaResize.js) — modul kernel
    // GENERIK (bukan spesifik distro ini), lebar tersimpan localStorage
    // (key di-scope per-distro) supaya bertahan lintas refresh, sama
    // prinsip persistensi dengan expand/collapse tree & file terakhir
    // dibuka (lihat system/directory/README.md).
    window.NxResize(document.getElementById('nx-directory-resize-handle'), {
      target: treeMount,
      axis: 'x',
      min: 160,
      max: 640,
      key: 'nx-resize::Rebit::directory-tree-width',
    });
  });
}
