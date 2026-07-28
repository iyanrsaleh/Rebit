// Target DINAMIS untuk tree direktori (system/directory/index.js) — BEDA
// dari contes1.js/contes2.js (satu id statis = satu target tetap). Tiap
// file/folder di tree punya id="nxfile::<path-encoded>" sendiri (lihat
// renderNode() di system/directory/index.js), jadi SATU file ini menangani
// SEMUA entry lewat decode targetId, bukan didaftarkan satu-satu di
// registry index.js.
//
// Target KEDUA: id="nx-directory-tree-mount" (container tree, dari
// package/directory/index.js) — klik-kanan di AREA KOSONG tree (bukan kena
// file/folder manapun) berarti "root folder distro ini" (path '.').
//
// Clipboard copy/cut: variabel module-level DI RENDERER (bukan clipboard
// OS — path bukan teks yang berguna di luar app ini, dan clipboard OS akan
// bocor ke aplikasi lain tanpa alasan). Hilang saat halaman di-reload —
// cukup untuk alur copy→paste dalam satu sesi kerja, sama seperti clipboard
// file-manager desktop biasa yang juga in-memory per proses.
let clipboard = null; // { path: string, mode: 'copy' | 'cut' }

function decodeTargetPath(targetId) {
  if (targetId === 'nx-directory-tree-mount') return '.';
  if (typeof targetId === 'string' && targetId.startsWith('nxfile::')) {
    return decodeURIComponent(targetId.slice('nxfile::'.length));
  }
  return null;
}

/**
 * Refresh tree + viewer setelah operasi berhasil — dipanggil dari
 * runDirectoryOpAction() (renderer, lewat nexaContextAction.js). Re-render
 * PENUH (bukan patch DOM parsial) supaya konsisten dengan cara tree pertama
 * kali dirender (package/directory/index.js) — biaya re-render tree kecil
 * (traverse + string HTML), tidak perlu optimisasi tambahan.
 */
async function refreshDirectoryTree() {
  const mount = document.getElementById('nx-directory-tree-mount');
  if (!mount || !window.renderDirectoryTreeHtml) return;
  mount.innerHTML = await window.renderDirectoryTreeHtml();
  window.attachDirectoryTreePersistence?.(mount);
  const viewerMount = document.getElementById('nx-file-viewer-mount');
  window.attachFileClickViewer?.(mount, viewerMount);
}

/**
 * Dipanggil oleh electron/components/nexaContextAction.js (dynamic import
 * balik ke file ini) untuk SETIAP aksi di bawah — nama fungsi HARUS sama
 * dengan actionName di sendAction(). payload selalu { path } (path target
 * yang diklik-kanan saat menu dibangun, dikirim helpers.sendAction di
 * bawah — BUKAN dibaca ulang dari DOM di sini, karena main process yang
 * membangun payload sudah tahu targetId-nya).
 */
export async function nxCopyEntry({ path: p }) {
  clipboard = { path: p, mode: 'copy' };
}

export async function nxCutEntry({ path: p }) {
  clipboard = { path: p, mode: 'cut' };
}

export async function nxPasteEntry({ path: destPath }) {
  if (!clipboard) return { success: false, message: 'Clipboard kosong — Copy/Cut sesuatu dulu.' };
  try {
    const action = clipboard.mode === 'cut' ? 'move' : 'copy';
    await window.NxDirectory.op(action, { path: clipboard.path, destPath: destPath === '.' ? '' : destPath });
    if (clipboard.mode === 'cut') clipboard = null; // cut = sekali pakai, copy boleh paste berkali-kali
    await refreshDirectoryTree();
  } catch (err) {
    window.alert('Gagal paste: ' + (err && err.message ? err.message : String(err)));
  }
}

export async function nxDuplicateEntry({ path: p }) {
  try {
    await window.NxDirectory.op('duplicate', { path: p });
    await refreshDirectoryTree();
  } catch (err) {
    window.alert('Gagal duplicate: ' + (err && err.message ? err.message : String(err)));
  }
}

export async function nxRenameEntry({ path: p }) {
  const oldName = p.split('/').pop();
  const name = window.prompt('Nama baru:', oldName);
  if (!name || name === oldName) return;
  try {
    await window.NxDirectory.op('rename', { path: p, name });
    await refreshDirectoryTree();
  } catch (err) {
    window.alert('Gagal rename: ' + (err && err.message ? err.message : String(err)));
  }
}

export async function nxDeleteEntry({ path: p }) {
  if (!window.confirm(`Hapus "${p}"? Tindakan ini tidak bisa dibatalkan.`)) return;
  try {
    await window.NxDirectory.op('delete', { path: p });
    await refreshDirectoryTree();
  } catch (err) {
    window.alert('Gagal hapus: ' + (err && err.message ? err.message : String(err)));
  }
}

export async function nxNewFileEntry({ path: parentPath }) {
  const name = window.prompt('Nama file baru:');
  if (!name) return;
  try {
    await window.NxDirectory.op('mkfile', { path: parentPath === '.' ? '' : parentPath, name });
    await refreshDirectoryTree();
  } catch (err) {
    window.alert('Gagal membuat file: ' + (err && err.message ? err.message : String(err)));
  }
}

export async function nxNewFolderEntry({ path: parentPath }) {
  const name = window.prompt('Nama folder baru:');
  if (!name) return;
  try {
    await window.NxDirectory.op('mkdir', { path: parentPath === '.' ? '' : parentPath, name });
    await refreshDirectoryTree();
  } catch (err) {
    window.alert('Gagal membuat folder: ' + (err && err.message ? err.message : String(err)));
  }
}

/**
 * Dipanggil dari system/contextmenu/index.js untuk KEDUA target dinamis
 * (nxfile::* dan nx-directory-tree-mount). isRoot=true untuk container
 * (tidak ada Cut/Duplicate/Rename/Delete — tidak ada "diri sendiri" untuk
 * root folder distro, cuma New File/New Folder/Paste).
 * @param {string} targetId id mentah dari klik-kanan (belum di-decode)
 * @param {object} helpers sendAction/icon, sama seperti contes1.js/contes2.js
 */
export function nxDirectoryEntry(targetId, helpers) {
  const p = decodeTargetPath(targetId);
  if (p === null) return null;
  const isRoot = p === '.';

  const items = [];
  if (!isRoot) {
    items.push(
      { label: 'Copy', click: () => helpers.sendAction('nxCopyEntry', { path: p }) },
      { label: 'Cut', click: () => helpers.sendAction('nxCutEntry', { path: p }) },
    );
  }
  items.push({ label: 'Paste', click: () => helpers.sendAction('nxPasteEntry', { path: p }) });
  if (!isRoot) {
    items.push(
      { label: 'Duplicate', click: () => helpers.sendAction('nxDuplicateEntry', { path: p }) },
      { type: 'separator' },
      { label: 'Rename', click: () => helpers.sendAction('nxRenameEntry', { path: p }) },
      { label: 'Delete', click: () => helpers.sendAction('nxDeleteEntry', { path: p }) },
    );
  }
  items.push(
    { type: 'separator' },
    { label: 'New File', click: () => helpers.sendAction('nxNewFileEntry', { path: p }) },
    { label: 'New Folder', click: () => helpers.sendAction('nxNewFolderEntry', { path: p }) },
  );
  return items;
}
