// Modul SISTEM — pembungkus window.NxDirectory untuk distro "Rebit".
// Logic BERADA DI SINI (system/), di-registrasi jadi window global lewat
// system/index.js (titik registrasi tunggal) — lihat komentar di sana.
// File ini TIDAK di-import langsung oleh file pemakai (package/*);
// pemakai cukup panggil window.renderDirectoryTreeHtml(...).
//
// window.NxDirectory sudah GLOBAL otomatis (di-scope dari stack trace
// pemanggil, lihat assets/modules/nxdom.js) — TIDAK perlu import untuk
// window.NxDirectory itu sendiri.
//
// Icon: memakai class `.icon-*` yang SUDAH GLOBAL tersedia lewat
// assets/modules/icons/file/index.css (di-@import dari nexa.css →
// assets/css/style.css, sudah ter-<link> ke index.html shell) — TIDAK
// perlu style.css sendiri di folder ini, TIDAK perlu duplikasi CSS.
// Daftar lengkap class → lihat system/directory/icon.md (sumber acuan
// pemetaan ekstensi di bawah).

/**
 * Key localStorage untuk state expand/collapse — PER PATH folder (bukan
 * global satu flag), supaya folder A yang dibuka user tidak ikut membuka
 * folder B yang tidak pernah disentuh. `relPath` ikut jadi bagian key
 * supaya distro yang traverse subfolder berbeda tidak saling menimpa.
 */
function storageKey(relPath) {
  return `nx-directory-tree-open::Rebit::${relPath}`;
}

/** Set nama folder (path relatif dari root traverse) yang tersimpan TERBUKA. */
function loadOpenState(relPath) {
  try {
    const raw = localStorage.getItem(storageKey(relPath));
    return new Set(raw ? JSON.parse(raw) : []);
  } catch (_) {
    return new Set();
  }
}

function saveOpenState(relPath, openSet) {
  try {
    localStorage.setItem(storageKey(relPath), JSON.stringify([...openSet]));
  } catch (_) {
    // localStorage penuh/private mode — abaikan, expand/collapse tetap
    // bekerja untuk sesi ini, cuma tidak bertahan lintas refresh.
  }
}

/**
 * Traverse folder distro ini (window.NxDirectory.traverseDirectory) lalu
 * render langsung jadi HTML tree collapsible — siap ditaruh ke innerHTML.
 * PERSISTEN lintas refresh: folder yang pernah user buka/tutup diingat via
 * localStorage (per path folder), dipulihkan saat render berikutnya. Root
 * folder SELALU terbuka (titik masuk, tidak pernah disimpan sebagai
 * tertutup) — subfolder default tertutup KECUALI user pernah membukanya.
 * @param {string} [relPath] relatif terhadap root distro ini, default '.'
 * @returns {Promise<string>} HTML <details> (root tunggal)
 */
export async function renderDirectoryTreeHtml(relPath = '.') {
  const tree = await window.NxDirectory.traverseDirectory(relPath);
  const openState = loadOpenState(relPath);
  // basePath = relPath TANPA nama root (dipakai untuk data-nx-file-path,
  // yang harus cocok dengan argumen window.NxDirectory.readFile() — path
  // relatif ROOT DISTRO, BUKAN termasuk nama folder root tree ini). '.'
  // dinormalisasi jadi '' supaya join path di renderNode() tidak
  // menghasilkan awalan "./" yang janggal.
  const basePath = relPath === '.' ? '' : relPath;
  return renderNode(tree, tree?.name || '', basePath, true, openState);
}

/**
 * Dipanggil SEKALI oleh pemakai SETELAH innerHTML berisi hasil
 * renderDirectoryTreeHtml() benar-benar terpasang di DOM — memasang
 * listener `toggle` per <details> supaya buka/tutup tersimpan otomatis.
 * TIDAK dipanggil otomatis dari renderDirectoryTreeHtml() sendiri (fungsi
 * itu cuma menghasilkan STRING HTML, belum ada elemen DOM nyata untuk
 * dipasangi listener sampai string itu disisipkan ke innerHTML oleh
 * pemakai).
 * @param {HTMLElement} container elemen yang innerHTML-nya berisi hasil renderDirectoryTreeHtml()
 * @param {string} [relPath] HARUS sama dengan relPath yang dipakai saat render, supaya key localStorage cocok
 */
export function attachDirectoryTreePersistence(container, relPath = '.') {
  if (!container) return;
  const openState = loadOpenState(relPath);
  container.querySelectorAll('details.nx-directory-tree__folder[data-nx-path]').forEach((el) => {
    el.addEventListener('toggle', () => {
      const path = el.getAttribute('data-nx-path');
      if (el.open) openState.add(path);
      else openState.delete(path);
      saveOpenState(relPath, openState);
    });
  });
}

/**
 * Pemetaan ekstensi file → class icon (subset relevan dari
 * system/directory/icon.md — daftar lengkap 1150+ ada di sana kalau perlu
 * ditambah). Nama file KHUSUS (tanpa ekstensi bermakna, mis. "Dockerfile")
 * dicek lebih dulu, baru fallback ke ekstensi.
 */
const ICON_BY_FILENAME = {
  dockerfile: 'icon-docker',
  makefile: 'icon-makefile',
  'package.json': 'icon-package',
  'package-lock.json': 'icon-lock',
  'yarn.lock': 'icon-lock',
  'tsconfig.json': 'icon-tsconfig',
  '.gitignore': 'icon-gitignore',
  '.gitattributes': 'icon-gitattributes',
  '.npmignore': 'icon-npmignore',
  '.eslintrc': 'icon-eslintrc',
  '.prettierrc': 'icon-prettierrc',
  '.editorconfig': 'icon-editorconfig',
  '.env': 'icon-env',
  '.dockerignore': 'icon-dockerignore',
  '.htaccess': 'icon-htaccess',
  license: 'icon-license',
};

const ICON_BY_EXT = {
  html: 'icon-html', htm: 'icon-html', css: 'icon-css', scss: 'icon-scss', sass: 'icon-sass',
  less: 'icon-less', js: 'icon-js', mjs: 'icon-mjs', cjs: 'icon-cjs', jsx: 'icon-jsx',
  ts: 'icon-ts', tsx: 'icon-tsx', vue: 'icon-vue', svelte: 'icon-svelte', astro: 'icon-astro',
  php: 'icon-php', py: 'icon-py', rb: 'icon-rb', java: 'icon-java', kt: 'icon-kt',
  swift: 'icon-swift', go: 'icon-go', rs: 'icon-rs', c: 'icon-c', cpp: 'icon-cpp',
  h: 'icon-h', hpp: 'icon-hpp', cs: 'icon-cs', dart: 'icon-dart', lua: 'icon-lua',
  json: 'icon-json', jsonc: 'icon-jsonc', xml: 'icon-xml', yaml: 'icon-yaml', yml: 'icon-yml',
  toml: 'icon-toml', ini: 'icon-ini', sql: 'icon-sql', graphql: 'icon-graphql', gql: 'icon-gql',
  csv: 'icon-csv', sh: 'icon-sh', bash: 'icon-bash', zsh: 'icon-zsh', bat: 'icon-bat',
  cmd: 'icon-cmd', ps1: 'icon-ps1', md: 'icon-md', mdx: 'icon-mdx', txt: 'icon-txt',
  pdf: 'icon-pdf', doc: 'icon-doc', docx: 'icon-docx', xls: 'icon-xls', xlsx: 'icon-xlsx',
  jpg: 'icon-jpg', jpeg: 'icon-jpeg', png: 'icon-png', gif: 'icon-gif', webp: 'icon-webp',
  svg: 'icon-svg', ico: 'icon-ico', zip: 'icon-zip', rar: 'icon-rar', tar: 'icon-tar',
  gz: 'icon-gz', mp4: 'icon-mp4', mp3: 'icon-mp3', ttf: 'icon-ttf', otf: 'icon-otf',
  woff: 'icon-woff', woff2: 'icon-woff2', exe: 'icon-exe', dll: 'icon-dll', log: 'icon-log',
};

/** Class icon (tanpa prefix "icon") sesuai nama/ekstensi file — fallback `.icon` (document.svg). */
function fileIconClass(name) {
  const lower = String(name || '').toLowerCase();
  if (ICON_BY_FILENAME[lower]) return ICON_BY_FILENAME[lower];
  const ext = lower.includes('.') ? lower.slice(lower.lastIndexOf('.') + 1) : '';
  return ICON_BY_EXT[ext] || 'icon';
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * File di dalam folder ini TIDAK BOLEH bisa diedit lewat editor sendiri —
 * kalau developer tidak sengaja menimpa/merusak modul yang SEDANG
 * menjalankan fitur browse+edit ini, satu-satunya jalan perbaikan (fitur
 * ini sendiri) ikut rusak, developer terjebak tanpa jalan mundur lewat
 * browser (harus balik ke text editor eksternal/CLI manual). Dicek
 * terhadap filePathSoFar (relatif root distro, TANPA nama root — sama
 * format dengan data-nx-file-path/argumen readFile()).
 * - "system/" — SELURUH isi folder ini terkunci (bukan cuma
 *   system/directory/), karena modul lain di system/ (buckets/, titlebar/,
 *   contextmenu/) juga bagian infrastruktur inti distro, bukan konten
 *   biasa yang aman diedit sembarangan lewat editor developer cepat ini.
 * - "package/directory/" — folder KHUSUS yang jadi PEMAKAI fitur ini
 *   (package/directory/index.js memanggil window.attachFileClickViewer
 *   dkk) — kalau file ini sendiri ditimpa lewat editornya sendiri, halaman
 *   yang menampilkan editor bisa rusak SAAT SEDANG DIBUKA. Folder
 *   package/ LAIN (mis. package/gallery/) TETAP bisa diedit — hanya
 *   package/directory/ yang dikecualikan.
 */
function isProtectedPath(filePathSoFar) {
  if (!filePathSoFar) return false;
  return (
    filePathSoFar === 'system' ||
    filePathSoFar.startsWith('system/') ||
    filePathSoFar === 'package/directory' ||
    filePathSoFar.startsWith('package/directory/')
  );
}

/**
 * Render satu node hasil traverseDirectory() jadi HTML. Folder →
 * <details><summary> (klik untuk buka/tutup, NATIVE browser). File →
 * <span> dengan icon class sesuai ekstensi + data-nx-file-path (dipakai
 * editor.js untuk tahu file mana yang diklik).
 * @param {{name:string,type:'directory'|'file',children?:Array,truncated?:boolean}} node
 * @param {string} pathSoFar path folder ini TERMASUK nama root (dipakai
 *   sebagai key openState/localStorage — HARUS stabil antar-render,
 *   dibangun dari nama folder berurutan, bukan index array).
 * @param {string} filePathSoFar path folder ini RELATIF ROOT DISTRO, TANPA
 *   nama root tree (dipakai sebagai data-nx-file-path — HARUS cocok
 *   persis dengan argumen yang diterima window.NxDirectory.readFile()).
 *   Dua path ini SENGAJA terpisah: openState di-key dari path tree lokal
 *   (termasuk nama root, konsisten sejak awal), readFile() butuh path
 *   relatif shell/backend (TANPA nama root — resolveDirectoryPath() di
 *   index.js akan salah kalau nama root ikut terbawa, lihat bug yang
 *   ditemukan+diperbaiki sebelum kode ini final: folder ganda
 *   "Rebit/Rebit/..." kalau dua path ini disatukan).
 * @param {boolean} isRoot root folder SELALU terbuka (titik masuk).
 * @param {Set<string>} openState path folder yang tersimpan TERBUKA (dari loadOpenState()).
 */
function renderNode(node, pathSoFar, filePathSoFar, isRoot, openState) {
  if (!node) return '';
  const safeName = escapeHtml(node.name);
  const truncatedNote = node.truncated ? ' <em class="nx-directory-tree__truncated">(…batas kedalaman tercapai)</em>' : '';

  if (node.type !== 'directory') {
    const safeFilePath = escapeHtml(filePathSoFar);
    if (isProtectedPath(filePathSoFar)) {
      return `<div class="nx-directory-tree__file nx-directory-tree__file--protected" title="File sistem — tidak bisa diedit dari editor ini (lihat isProtectedPath() di system/directory/index.js)"><span class="icon ${fileIconClass(node.name)}"></span> ${safeName} <span class="icon icon-key nx-directory-tree__lock"></span></div>`;
    }
    // id="nxfile::<path-encoded>" — dipakai context-menu (system/contextmenu/
    // nxDirectoryEntry.js) untuk tahu file mana yang diklik-kanan. Mekanisme
    // deteksi target context-menu existing (App.js) mencari elemen ber-id
    // TERDEKAT dari titik klik (closest('[id]')) — path di-encode jadi id
    // karena setiap file di tree butuh id UNIK (bukan satu id statis per
    // target seperti contes1/contes2), lihat README.md §"Target dinamis".
    const entryId = `nxfile::${encodeURIComponent(filePathSoFar)}`;
    return `<div class="nx-directory-tree__file" id="${entryId}" data-nx-file-path="${safeFilePath}"><span class="icon ${fileIconClass(node.name)}"></span> ${safeName}</div>`;
  }

  const children = Array.isArray(node.children) ? node.children : [];
  const childrenHtml = children
    .map((child) =>
      renderNode(
        child,
        `${pathSoFar}/${child.name}`,
        filePathSoFar ? `${filePathSoFar}/${child.name}` : child.name,
        false,
        openState,
      ),
    )
    .join('');
  const isOpen = isRoot || openState.has(pathSoFar);
  const openAttr = isOpen ? ' open' : '';
  const safePath = escapeHtml(pathSoFar);
  // Folder (non-root, tidak protected) juga dapat id="nxfile::<path>" pada
  // <summary> — supaya klik-kanan PERSIS di label folder (bukan di anak2nya)
  // bisa kena menu New File/New Folder/Paste/Rename/Delete folder itu
  // sendiri. Root folder TIDAK diberi id (isRoot=true) — root = seluruh
  // distro, tidak relevan untuk Rename/Delete/Duplicate/Cut.
  const isFolderProtected = isProtectedPath(filePathSoFar);
  const folderEntryId = !isRoot && !isFolderProtected ? `nxfile::${encodeURIComponent(filePathSoFar)}` : '';
  const summaryIdAttr = folderEntryId ? ` id="${folderEntryId}"` : '';
  return `<details class="nx-directory-tree__folder" data-nx-path="${safePath}"${openAttr}>
    <summary${summaryIdAttr}><span class="icon icon-folder"></span> ${safeName}${truncatedNote}</summary>
    <div class="nx-directory-tree__children">${childrenHtml || '<em class="nx-directory-tree__empty">(kosong)</em>'}</div>
  </details>`;
}
