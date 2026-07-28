// Target "nx-file-viewer-mount" — dipanggil dari index.js (REGISTRY) saat
// user klik-kanan di area VIEWER (package/directory/index.js,
// id="nx-file-viewer-mount") TAPI DI LUAR editor CM6 — yaitu saat viewer
// masih placeholder ("Klik salah satu file...") atau di margin/scroll area
// viewer, BUKAN persis di dalam teks yang sedang diedit. Target itu beda
// (id="nx-file-viewer-editor", nxFileViewerEditor di nx-file-viewer-editor.js)
// — closest('[id]') otomatis memilih id TERDEKAT dari titik klik, jadi klik
// di dalam editor tetap kena target editor, klik di luar editor (tapi masih
// dalam mount) jatuh ke target ini.
//
// Menu di sini murni navigasi cepat — tidak ada state file aktif untuk
// diproses (beda dari nxFileViewerEditor yang punya Save/Undo/dst).
export function nxFileViewerMount(targetId, helpers) {
  return [
    { label: 'Refresh Tree', click: () => helpers.sendAction('nxRefreshTreeFromViewer') },
  ];
}

// Dipanggil oleh electron/components/nexaContextAction.js (dispatch balik
// lewat REGISTRY index.js, lihat resolveContextMenuEntry()).
export async function nxRefreshTreeFromViewer() {
  const mount = document.getElementById('nx-directory-tree-mount');
  if (!mount || !window.renderDirectoryTreeHtml) return { success: false };
  mount.innerHTML = await window.renderDirectoryTreeHtml();
  window.attachDirectoryTreePersistence?.(mount);
  window.attachFileClickViewer?.(mount, document.getElementById('nx-file-viewer-mount'));
  return { success: true };
}
