// Modul SISTEM — editor baca-tulis isi file untuk distro "Rebit".
// Logic BERADA DI SINI, di-registrasi jadi window global lewat
// system/index.js (titik registrasi tunggal) — pola SAMA PERSIS dengan
// system/directory/index.js (renderDirectoryTreeHtml). File ini TIDAK
// di-import langsung oleh file pemakai (package/*).
//
// window.NxDirectory.readFile/writeFile SUDAH global otomatis (di-scope
// dari stack trace pemanggil, lihat assets/modules/nxdom.js) — TIDAK
// perlu import untuk window.NxDirectory itu sendiri.
//
// Editor: memakai window.NXUI.Codemirror (alias window.NXUI.NexaCmirror)
// yang SUDAH GLOBAL tersedia lewat assets/modules/codemirror6/NexaCmirror6.js
// (terdaftar sebagai NXUI.Codemirror di assets/modules/nxdom.js) — TIDAK
// import manual dari assets/modules/codemirror6/, sama prinsip dengan
// icon .icon-* yang sudah global.
//
// Titik masuk developer saat ada kerusakan sistem: buka file langsung dari
// browser, edit, Ctrl+S untuk simpan — tanpa file explorer/text editor
// eksternal. TIDAK ADA window.confirm() sebelum overwrite (beda dari pola
// destruktif lain di project ini, mis. Uninstall componen) — Ctrl+S adalah
// gestur eksplisit developer yang sudah menandakan niat menyimpan, sama
// seperti Ctrl+S di editor kode biasa (VS Code dkk), meminta konfirmasi
// tiap kali justru mengganggu alur edit-simpan cepat.

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Persistensi file TERAKHIR yang dibuka — SAMA pola dengan
 * storageKey()/loadOpenState()/saveOpenState() di system/directory/index.js
 * (localStorage, per-distro, try/catch untuk quota/private mode). Dipakai
 * attachFileClickViewer() untuk memulihkan editor ke file yang sama
 * setelah user refresh halaman (F5), BUKAN cuma tree expand/collapse yang
 * sudah persisten — editor kembali ke posisi kerja terakhir juga.
 */
const LAST_OPEN_FILE_KEY = 'nx-directory-tree-last-open-file::Rebit';

function loadLastOpenPath() {
  try {
    return localStorage.getItem(LAST_OPEN_FILE_KEY) || null;
  } catch (_) {
    return null;
  }
}

function saveLastOpenPath(relPath) {
  try {
    if (relPath) localStorage.setItem(LAST_OPEN_FILE_KEY, relPath);
    else localStorage.removeItem(LAST_OPEN_FILE_KEY);
  } catch (_) {
    // localStorage penuh/private mode — abaikan, editor tetap berfungsi
    // untuk sesi ini, cuma tidak bertahan lintas refresh.
  }
}

/**
 * Ekstensi file → mode CodeMirror (lihat getLanguageExtension() di
 * assets/modules/codemirror6/NexaCmirror6.js untuk daftar mode yang
 * benar-benar didukung — subset relevan disalin di sini, BUKAN daftar
 * lengkap, supaya modul ini tidak perlu import file itu hanya untuk
 * membaca nama-nama mode).
 */
const MODE_BY_EXT = {
  js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript',
  ts: 'typescript', tsx: 'typescript',
  html: 'htmlmixed', htm: 'htmlmixed',
  css: 'css', scss: 'css', less: 'css',
  json: 'javascript',
  md: 'markdown', mdx: 'markdown',
  xml: 'xml', svg: 'xml',
  php: 'php', yaml: 'yaml', yml: 'yaml',
  py: 'python', rb: 'ruby', go: 'go', rs: 'rust', java: 'java',
  kt: 'kotlin', cs: 'csharp', swift: 'swift', lua: 'lua', dart: 'dart',
  sh: 'shell', bash: 'shell', zsh: 'shell', ps1: 'powershell',
  toml: 'toml', pl: 'perl',
};
function modeForFile(name) {
  const lower = String(name || '').toLowerCase();
  if (lower === 'dockerfile') return 'dockerfile';
  const ext = lower.includes('.') ? lower.slice(lower.lastIndexOf('.') + 1) : '';
  return MODE_BY_EXT[ext] || null;
}

/**
 * File GAMBAR ditampilkan sebagai <img> (window.NxDirectory.readImage,
 * endpoint TERPISAH dari readFile teks) — BUKAN dibuka di CodeMirror,
 * sumber biner gambar mustahil ditampilkan sebagai teks yang berguna.
 * Daftar ekstensi HARUS SAMA dengan DIRECTORY_IMAGE_MIME_BY_EXT di
 * index.js (root) — endpoint menolak ekstensi di luar daftar itu.
 */
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'svg', 'avif']);

function fileExt(name) {
  const lower = String(name || '').toLowerCase();
  return lower.includes('.') ? lower.slice(lower.lastIndexOf('.') + 1) : '';
}

function isImageFile(name) {
  return IMAGE_EXTENSIONS.has(fileExt(name));
}

function isMarkdownFile(name) {
  const ext = fileExt(name);
  return ext === 'md' || ext === 'mdx';
}

/** Instance editor AKTIF saat ini — SATU per halaman (tab file tunggal, bukan multi-tab). */
let activeEditor = null;
let activeEditorRelPath = null;
let activeEditorKeyHandler = null;
// Fungsi simpan file yang SEDANG aktif — di-assign ulang tiap kali
// openFileEditor() berhasil sampai tahap render (lihat bawah). Diekspor
// (saveActiveFile()) supaya system/contextmenu/nxEditorTarget.js bisa
// memanggil aksi simpan yang SAMA PERSIS dengan Ctrl+S, tanpa duplikasi
// logic writeFile+setStatus di dua tempat.
let activeSaveFn = null;
// Naik SETIAP kali openFileEditor() dipanggil — dipakai sebagai guard race
// condition (lihat pemakaian di bawah): kalau user klik file lain sebelum
// loadDependencies() versi panggilan SEBELUMNYA selesai, token yang
// "dipegang" pemanggilan lama sudah tidak cocok lagi dengan yang terbaru,
// jadi hasil load yang telat itu dibatalkan, tidak menimpa editor file baru.
let openGeneration = 0;

/**
 * id "asal" viewerContainer (mis. "nx-file-viewer-mount", dari
 * package/directory/index.js) — disimpan supaya disposeActiveEditor() bisa
 * mengembalikannya persis, bukan menebak/hardcode nama id tetap.
 */
let activeEditorContainer = null;
let activeEditorContainerOriginalId = null;

/**
 * Bersihkan instance editor sebelumnya (kalau ada) sebelum membuka file
 * baru — mencegah listener/CM6 view menumpuk saat user gonta-ganti file.
 * Juga mengembalikan id viewerContainer ke id ASAL-nya (lihat openFileEditor()
 * — id container DIGANTI SEMENTARA jadi "nx-file-viewer-editor" selama file
 * terbuka, supaya context-menu tahu kapan klik-kanan sedang kena editor
 * aktif vs viewer kosong/placeholder, lihat komentar lengkap di bawah).
 */
function disposeActiveEditor() {
  if (activeEditor) {
    try { activeEditor.destroy(); } catch (_) { /* ignore */ }
    activeEditor = null;
  }
  if (activeEditorKeyHandler) {
    document.removeEventListener('keydown', activeEditorKeyHandler, true);
    activeEditorKeyHandler = null;
  }
  if (activeEditorContainer) {
    if (activeEditorContainerOriginalId) activeEditorContainer.id = activeEditorContainerOriginalId;
    else activeEditorContainer.removeAttribute('id');
  }
  activeEditorContainer = null;
  activeEditorContainerOriginalId = null;
  activeEditorRelPath = null;
  activeSaveFn = null;
}

/**
 * Simpan file yang SEDANG aktif — dipanggil dari context-menu editor
 * (system/contextmenu/nxEditorTarget.js, item "Save", lewat
 * helpers.sendAction('nxSaveActiveFile') → nexaContextAction.js → fungsi
 * ini). No-op kalau tidak ada editor aktif (mis. viewer masih placeholder,
 * belum ada file dibuka).
 */
export async function saveActiveEditorFile() {
  if (!activeSaveFn) return;
  await activeSaveFn();
}

/**
 * Baca isi file lalu render editor CodeMirror BACA-TULIS ke
 * `viewerContainer`. Ctrl+S (atau Cmd+S di macOS) memicu simpan lewat
 * window.NxDirectory.writeFile() — status simpan ditampilkan di header
 * (bukan alert/confirm, supaya tidak mengganggu alur ketik).
 * @param {string} relPath path file relatif root distro ini
 * @param {HTMLElement} viewerContainer elemen tempat editor dipasang
 */
export async function openFileEditor(relPath, viewerContainer) {
  disposeActiveEditor();
  if (!viewerContainer) return;
  const myGeneration = ++openGeneration;

  const fileName = relPath.split('/').pop();
  const safePath = escapeHtml(relPath);

  // Gambar: JALUR TERPISAH SEPENUHNYA — TIDAK memanggil readFile()/CodeMirror
  // sama sekali (sumber biner gambar via readFile() teks UTF-8 akan korup).
  // Lihat openImagePreview() di bawah — id viewerContainer TIDAK diganti
  // (beda dari jalur teks di bawah), gambar tidak punya Save/Undo yang
  // relevan, jadi target context-menu tetap "nx-file-viewer-mount" (§7c).
  if (isImageFile(fileName)) {
    return openImagePreview(relPath, fileName, safePath, viewerContainer, myGeneration);
  }

  let initial;
  try {
    initial = await window.NxDirectory.readFile(relPath);
  } catch (err) {
    if (myGeneration !== openGeneration) return; // file lain sudah diklik selagi ini masih loading
    // Hapus dari persistensi — kalau TIDAK dihapus, refresh berikutnya akan
    // mencoba memulihkan file yang sama (mis. sudah dihapus/dipindah lewat
    // context-menu tree di tab lain) dan gagal lagi selamanya, loop error
    // diam-diam setiap kali halaman dibuka.
    saveLastOpenPath(null);
    viewerContainer.innerHTML = `<div class="nx-file-viewer nx-file-viewer--error">
      <div class="nx-file-viewer__header">
        <span class="icon icon-delete"></span>
        <span class="nx-file-viewer__name">${safePath}</span>
      </div>
      <p class="nx-file-viewer__error-message">${escapeHtml(err && err.message ? err.message : String(err))}</p>
    </div>`;
    return;
  }
  if (myGeneration !== openGeneration) return; // file lain sudah diklik selagi readFile() masih berjalan

  // Simpan SEBELUM render editor (bukan di akhir fungsi) — path ini sudah
  // pasti valid (readFile() sukses), dan kalau proses render CM6 di bawah
  // gagal/lambat, path yang mau dipulihkan tetap benar untuk refresh
  // berikutnya (lebih baik daripada tidak tersimpan sama sekali).
  saveLastOpenPath(relPath);

  // id viewerContainer DIGANTI SEMENTARA jadi "nx-file-viewer-editor" —
  // BUKAN dipasang di elemen internal CM6. NexaCmirror6._init() TIDAK
  // merender CM6 ke dalam elemen yang diberikan ke konstruktor: ia membuat
  // <div class="nexacmirror6-wrap"> BARU sebagai SIBLING elemen itu, lalu
  // menyembunyikan elemen aslinya (display:none) — lihat _init() di
  // assets/modules/codemirror6/NexaCmirror6.js. Kalau id context-menu
  // dipasang di elemen mount biasa, klik di teks yang terlihat (yang jatuh
  // di .nexacmirror6-wrap, TANPA id) tidak pernah closest() sampai ke situ
  // — inilah bug yang SEMPAT terjadi (klik-kanan di editor selalu jatuh ke
  // menu default). Mengganti id CONTAINER LUAR (viewerContainer, id asalnya
  // "nx-file-viewer-mount" dari package/directory/index.js) menghindari
  // masalah ini sepenuhnya — tidak perlu tahu struktur DOM internal CM6
  // sama sekali, closest('[id]') dari titik mana pun di dalam viewerContainer
  // (termasuk di dalam .nexacmirror6-wrap) akan selalu sampai ke id ini.
  // disposeActiveEditor() mengembalikan id ke ASAL-nya saat editor ditutup
  // (viewer balik ke placeholder → id balik ke "nx-file-viewer-mount",
  // target nxFileViewerMount §7c — lihat system/contextmenu/README.md).
  activeEditorContainer = viewerContainer;
  activeEditorContainerOriginalId = viewerContainer.id || null;
  viewerContainer.id = 'nx-file-viewer-editor';

  viewerContainer.innerHTML = `<div class="nx-file-viewer">
    <div class="nx-file-viewer__header">
      <span class="icon ${modeForFile(fileName) ? 'icon-' + fileName.toLowerCase().split('.').pop() : 'icon'}"></span>
      <span class="nx-file-viewer__name">${escapeHtml(fileName)}</span>
      <span class="nx-file-viewer__status" id="nx-file-viewer-status">memuat editor…</span>
      <span class="nx-file-viewer__meta">Ctrl+S untuk simpan</span>
    </div>
    <div class="nx-file-viewer__editor" id="nx-file-viewer-editor-mount"></div>
  </div>`;

  const editorEl = viewerContainer.querySelector('#nx-file-viewer-editor-mount');
  const statusEl = viewerContainer.querySelector('#nx-file-viewer-status');

  // WAJIB di-await SEBELUM instansiasi — NexaCmirror6 lazy-load bundle CM6
  // terpisah (codemirror6.bundle.js) secara async. Konstruktor HANYA
  // memanggil _init() (yang benar-benar merender editor + isi awal) kalau
  // dependency ini SUDAH selesai dimuat saat konstruktor dipanggil —
  // tanpa await ini, `new NXUI.Codemirror(...)` membuat instance "kosong"
  // (elemen DOM ada, tapi CM6 belum pernah _init() sama sekali, sehingga
  // isi file tidak pernah tampil). Ini bug yang SEMPAT terjadi sebelum
  // baris await ini ditambahkan — dicatat supaya tidak terulang.
  await window.NXUI.Codemirror.loadDependencies();

  // Guard: kalau user sempat klik file LAIN sebelum loadDependencies()
  // selesai (async, race condition), batalkan — jangan render editor file
  // lama ke atas file baru yang sudah diklik user. Dicek via openGeneration
  // (BUKAN activeEditorRelPath — itu sudah di-reset null oleh
  // disposeActiveEditor() di awal fungsi setiap panggilan baru, jadi tidak
  // bisa dipakai membedakan "panggilan lama" dari "panggilan baru").
  if (myGeneration !== openGeneration) return;

  activeEditor = new window.NXUI.Codemirror(editorEl, {
    value: initial.content,
    mode: modeForFile(fileName) || undefined,
    theme: 'dracula',
    lineNumbers: true,
    tabSize: 2,
  });
  activeEditorRelPath = relPath;
  if (statusEl) statusEl.textContent = '';

  const setStatus = (text, cls) => {
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.className = 'nx-file-viewer__status' + (cls ? ` nx-file-viewer__status--${cls}` : '');
  };

  activeEditor.on('change', () => setStatus('belum disimpan', 'dirty'));

  async function saveActiveEditor() {
    if (!activeEditor || activeEditorRelPath !== relPath) return;
    setStatus('menyimpan…', 'saving');
    try {
      await window.NxDirectory.writeFile(relPath, activeEditor.getValue());
      setStatus('tersimpan', 'saved');
    } catch (err) {
      setStatus('gagal simpan: ' + (err && err.message ? err.message : String(err)), 'error');
    }
  }
  activeSaveFn = saveActiveEditor;

  // Ctrl+S/Cmd+S — capture di document (bukan cuma di editor) supaya tetap
  // tertangkap walau fokus keyboard ada di elemen CM6 internal. preventDefault
  // WAJIB (tanpa ini browser membuka dialog "Save Page As" bawaan).
  activeEditorKeyHandler = (event) => {
    const isSaveCombo = (event.ctrlKey || event.metaKey) && !event.altKey && String(event.key || '').toLowerCase() === 's';
    if (!isSaveCombo) return;
    event.preventDefault();
    saveActiveEditor();
  };
  document.addEventListener('keydown', activeEditorKeyHandler, true);

  // File Markdown — tab [Markdown | Preview] di atas editor CM6. Preview
  // dirender lewat NexaMarkdown (assets/modules/markdown/NexaMarkdown.js,
  // sudah GLOBAL via window.NXUI.Markdown/NexaMarkdown) — fromContent(md)
  // dipakai (BUKAN fromFile()/load() biasa, yang butuh
  // window.electronAPI.discoveryReadFile — API khusus project lain, TIDAK
  // ada di kernel ini) karena isi file SUDAH ada di tangan (initial.content,
  // dibaca lewat window.NxDirectory.readFile() di atas).
  if (isMarkdownFile(fileName)) {
    wireMarkdownPreviewToggle(viewerContainer, () => activeEditor?.getValue() ?? initial.content);
  }
}

/**
 * Pasang tab toggle [Markdown | Preview] di header viewer (disisipkan
 * SETELAH header yang sudah ada, sebelum area editor) — klik "Preview"
 * merender markdown TERKINI (isi editor SAAT diklik, lewat getCurrentMd(),
 * bukan snapshot awal file) ke HTML pakai NexaMarkdown, klik "Markdown"
 * balik menampilkan CodeMirror. Area editor CM6 disembunyikan (BUKAN
 * dilepas dari DOM) saat mode Preview aktif — instance CM6 tetap hidup,
 * tidak perlu destroy+rebuild saat toggle balik ke Markdown.
 * @param {HTMLElement} viewerContainer
 * @param {() => string} getCurrentMd
 */
function wireMarkdownPreviewToggle(viewerContainer, getCurrentMd) {
  const header = viewerContainer.querySelector('.nx-file-viewer__header');
  const editorEl = viewerContainer.querySelector('#nx-file-viewer-editor-mount');
  if (!header || !editorEl) return;

  const tabs = document.createElement('div');
  tabs.className = 'nx-file-viewer__md-tabs';
  tabs.innerHTML = `
    <button type="button" class="nx-file-viewer__md-tab is-active" data-md-view="source">Markdown</button>
    <button type="button" class="nx-file-viewer__md-tab" data-md-view="preview">Preview</button>
  `;
  header.insertAdjacentElement('afterend', tabs);

  const previewEl = document.createElement('div');
  previewEl.className = 'nx-file-viewer__md-preview';
  previewEl.hidden = true;
  editorEl.insertAdjacentElement('afterend', previewEl);

  const tabSource = tabs.querySelector('[data-md-view="source"]');
  const tabPreview = tabs.querySelector('[data-md-view="preview"]');

  tabSource.addEventListener('click', () => {
    tabSource.classList.add('is-active');
    tabPreview.classList.remove('is-active');
    editorEl.hidden = false;
    previewEl.hidden = true;
  });

  tabPreview.addEventListener('click', async () => {
    tabPreview.classList.add('is-active');
    tabSource.classList.remove('is-active');
    editorEl.hidden = true;
    previewEl.hidden = false;
    // window.NXUI.Markdown BUKAN NexaMarkdown — itu fungsi lain (nxdom.js,
    // beda API sama sekali). Alias kelas NexaMarkdown yang benar adalah
    // NXUI.NexaMarkdown (atau NXUI.md, alias pendek) — lihat nxdom.js
    // `const NexaMarkdown = _nxDefault(_mMarkdown); ... NexaMarkdown, md:NexaMarkdown,`.
    const Markdown = window.NXUI?.NexaMarkdown || window.NXUI?.md;
    if (typeof Markdown?.fromContent !== 'function') {
      previewEl.innerHTML = '<p class="nx-file-viewer__error-message">NexaMarkdown tidak tersedia (modul "markdown" belum terinstal).</p>';
      return;
    }
    previewEl.innerHTML = '<p class="nx-file-viewer__loading">Merender preview…</p>';
    try {
      const html = await Markdown.fromContent(getCurrentMd()).html();
      previewEl.innerHTML = html;
    } catch (err) {
      previewEl.innerHTML = `<p class="nx-file-viewer__error-message">${escapeHtml(err && err.message ? err.message : String(err))}</p>`;
    }
  });
}

/**
 * File GAMBAR — jalur TERPISAH dari openFileEditor() teks: baca via
 * window.NxDirectory.readImage() (base64 data URL, endpoint TERPISAH dari
 * readFile teks), render <img>. TIDAK ada CodeMirror/Ctrl+S/aksi Save sama
 * sekali — gambar murni pratinjau baca-saja (mengubah isi biner gambar
 * lewat editor teks tidak masuk akal). id viewerContainer TIDAK diganti
 * (BEDA dari openFileEditor() teks) — tanpa instance editor aktif, target
 * context-menu yang relevan tetap "nx-file-viewer-mount" (§7c, menu
 * Refresh Tree), bukan §7b (Save/Undo/dst yang tidak relevan untuk gambar).
 * @param {string} relPath
 * @param {string} fileName
 * @param {string} safePath fileName ter-escape HTML (dipakai pesan error)
 * @param {HTMLElement} viewerContainer
 * @param {number} myGeneration token race-condition, sama pola dengan openFileEditor()
 */
async function openImagePreview(relPath, fileName, safePath, viewerContainer, myGeneration) {
  saveLastOpenPath(relPath);
  let result;
  try {
    result = await window.NxDirectory.readImage(relPath);
  } catch (err) {
    if (myGeneration !== openGeneration) return; // file lain sudah diklik selagi ini masih loading
    saveLastOpenPath(null);
    viewerContainer.innerHTML = `<div class="nx-file-viewer nx-file-viewer--error">
      <div class="nx-file-viewer__header">
        <span class="icon icon-delete"></span>
        <span class="nx-file-viewer__name">${safePath}</span>
      </div>
      <p class="nx-file-viewer__error-message">${escapeHtml(err && err.message ? err.message : String(err))}</p>
    </div>`;
    return;
  }
  if (myGeneration !== openGeneration) return; // file lain sudah diklik selagi readImage() masih berjalan

  viewerContainer.innerHTML = `<div class="nx-file-viewer nx-file-viewer--image">
    <div class="nx-file-viewer__header">
      <span class="icon ${fileExt(fileName) === 'svg' ? 'icon-svg' : 'icon-png'}"></span>
      <span class="nx-file-viewer__name">${escapeHtml(fileName)}</span>
      <span class="nx-file-viewer__meta">${escapeHtml(formatFileSizeBrief(result.size))} · ${escapeHtml(result.mime || 'image')} · hanya pratinjau</span>
    </div>
    <div class="nx-file-viewer__image-stage">
      <img class="nx-file-viewer__image" src="${escapeHtml(result.dataUrl)}" alt="${escapeHtml(fileName)}" draggable="false" decoding="async" />
    </div>
  </div>`;
}

function formatFileSizeBrief(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

/** Tandai SATU elemen file di tree sebagai aktif (highlight), lepas dari elemen lain — dipakai klik manual MAUPUN restore otomatis (lihat attachFileClickViewer()). */
function markActiveTreeEntry(treeContainer, el) {
  treeContainer.querySelectorAll('.nx-directory-tree__file--active').forEach((n) => n.classList.remove('nx-directory-tree__file--active'));
  if (el) el.classList.add('nx-directory-tree__file--active');
}

/**
 * Pasang listener klik pada elemen file di dalam tree hasil
 * renderDirectoryTreeHtml() (lihat system/directory/index.js,
 * `data-nx-file-path`) — begitu diklik, buka editor baca-tulis untuk file
 * itu di `viewerContainer`. Dipanggil pemakai SETELAH tree DAN viewer
 * container sama-sama ada di DOM.
 *
 * PERSISTENSI: setelah listener klik terpasang, kalau ada file yang
 * TERAKHIR dibuka tersimpan (localStorage, lihat saveLastOpenPath()) DAN
 * file itu masih ada di tree yang baru saja dirender (elemen
 * `[data-nx-file-path="..."]` ditemukan), editor otomatis dibuka kembali
 * ke file itu — supaya refresh halaman (F5) mengembalikan user ke posisi
 * kerja yang sama, bukan ke placeholder kosong. Kalau file sudah tidak ada
 * lagi di tree (dihapus/dipindah), TIDAK ada error — cukup dibiarkan
 * kosong (placeholder awal tetap tampil).
 * @param {HTMLElement} treeContainer elemen yang berisi hasil renderDirectoryTreeHtml()
 * @param {HTMLElement} viewerContainer elemen tempat editor ditampilkan
 */
export function attachFileClickViewer(treeContainer, viewerContainer) {
  if (!treeContainer || !viewerContainer) return;
  treeContainer.querySelectorAll('.nx-directory-tree__file[data-nx-file-path]').forEach((el) => {
    el.addEventListener('click', () => {
      const relPath = el.getAttribute('data-nx-file-path');
      markActiveTreeEntry(treeContainer, el);
      openFileEditor(relPath, viewerContainer);
    });
  });

  const lastPath = loadLastOpenPath();
  if (lastPath) {
    const el = treeContainer.querySelector(`.nx-directory-tree__file[data-nx-file-path="${CSS.escape(lastPath)}"]`);
    if (el) {
      markActiveTreeEntry(treeContainer, el);
      openFileEditor(lastPath, viewerContainer);
    }
  }
}
