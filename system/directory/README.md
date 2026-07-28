# `system/directory/` — olahan `window.NxDirectory` khusus distro ini

Modul logic distro "Rebit" yang membungkus `window.NxDirectory`
(fitur bawaan shell — baca struktur folder, MURNI BACA) jadi bentuk siap
pakai: HTML `<ul>` nested, siap ditaruh langsung ke `container.innerHTML`
tanpa file pemakai perlu tahu bentuk data mentahnya.

> Dokumentasi lengkap `window.NxDirectory` sendiri (4 method, keamanan,
> endpoint backend, histori keputusan) ada di
> `templates/system/directory/README.md` (folder SHELL, beda dari file
> ini yang khusus distro "Rebit"). Dokumen ini fokus ke satu
> lapisan di atasnya: fungsi olahan spesifik distro ini.

## Cara pakai — TANPA import di file pemakai

`window.renderDirectoryTreeHtml` sudah didaftarkan otomatis oleh
`system/index.js` (dimuat `templates/distro/grafis.js` sebelum `NXHOME`)
— file mana pun di dalam distro ini bisa langsung memanggilnya:

```js
// package/{nama}/index.js — TIDAK ADA import
const treeHtml = await window.renderDirectoryTreeHtml();
container.innerHTML = `<h2>Struktur folder distro</h2>${treeHtml}`;
```

Contoh nyata yang sudah jalan:
`templates/distro/Rebit/package/directory/index.js`.

### Dengan `relPath` — traverse subfolder tertentu

```js
// Cuma tampilkan struktur folder package/ saja, bukan seluruh distro
const treeHtml = await window.renderDirectoryTreeHtml('package');
```

`relPath` opsional, default `'.'` (root distro ini sendiri) — parameter
diteruskan apa adanya ke `window.NxDirectory.traverseDirectory(relPath)`,
jadi berlaku aturan yang sama (scoped ke folder distro ini, tidak bisa
`../` keluar — lihat dokumen shell untuk detail validasi).

## Apa yang terjadi di baliknya

```
window.renderDirectoryTreeHtml(relPath)
  └─ window.NxDirectory.traverseDirectory(relPath)   ← fitur bawaan shell,
       │                                                 data MENTAH:
       │                                                 { name, type,
       │                                                   children?,
       │                                                   truncated? }
       └─ renderNode(tree)                            ← olah rekursif jadi
            (helper internal, TIDAK di-export)            HTML <li>/<ul>
                 │
                 ▼
       "<ul class=\"nx-directory-tree\">...</ul>"      ← HTML string, siap innerHTML
```

- Folder → `📁 nama-folder` + `<ul>` berisi anak-anaknya (rekursif).
- File → `📄 nama-file`, tanpa anak.
- Kalau `traverseDirectory` memotong hasil karena batas kedalaman
  (`truncated: true` dari backend, lihat dokumen shell §7) — label
  menampilkan tambahan teks `(…batas kedalaman tercapai)`.

## API

### `renderDirectoryTreeHtml(relPath = '.')`

- **Parameter**: `relPath` (string, opsional) — sama seperti
  `window.NxDirectory.traverseDirectory()`.
- **Return**: `Promise<string>` — HTML `<ul class="nx-directory-tree">`
  lengkap dengan seluruh isi nested di dalamnya. Siap langsung disisipkan
  ke template string / `innerHTML`, tidak perlu diproses lagi.
- Fungsi ini **satu-satunya export** dari `system/directory/index.js`.
  `renderNode()` (helper rekursif di file yang sama) sengaja **tidak**
  di-export — bukan API publik, murni detail implementasi.

## Kalau distro ini butuh olahan `window.NxDirectory` yang lain

`system/directory/index.js` cuma berisi SATU fungsi olahan
(`renderDirectoryTreeHtml`). Kalau butuh bentuk lain (mis. flat list nama
file saja tanpa nesting, atau filter tipe file tertentu sebelum
dirender) — tambahkan fungsi `export` baru di file yang sama, lalu
daftarkan di `system/index.js` dengan pola yang sama:

```js
// system/directory/index.js — tambah fungsi baru
export async function renderJsFileListHtml() {
  const files = await window.NxDirectory.enumerateFiles('.', { extensions: ['.js'], recursive: true });
  return `<ul>${files.map((f) => `<li>${f}</li>`).join('')}</ul>`;
}
```

```js
// system/index.js — daftarkan
import { renderDirectoryTreeHtml, renderJsFileListHtml } from './directory/index.js';
window.renderDirectoryTreeHtml = renderDirectoryTreeHtml;
window.renderJsFileListHtml = renderJsFileListHtml;
```

Logic tetap terpusat di `system/directory/index.js` (satu tempat, bukan
ditulis ulang di tiap file pemakai) — hanya `system/index.js` yang perlu
disentuh untuk meregistrasi fungsi baru sebagai `window.*`.

## Persistensi file terakhir dibuka (`editor.js`)

`system/directory/editor.js` (viewer isi file baca-tulis, dipanggil via
`window.attachFileClickViewer`/`window.openFileEditor`) menyimpan path file
yang TERAKHIR dibuka ke `localStorage`
(`nx-directory-tree-last-open-file::Rebit`) setiap kali file berhasil
dibaca — pola SAMA PERSIS dengan `storageKey()`/`loadOpenState()` di file
ini (`index.js`) untuk expand/collapse folder.

`attachFileClickViewer(treeContainer, viewerContainer)` memulihkan editor
ke file itu secara OTOMATIS setelah dipanggil — jadi refresh halaman (F5)
mengembalikan user ke posisi kerja terakhir (file yang sama terbuka lagi,
elemen tree yang sesuai ikut ter-highlight), bukan ke placeholder kosong.
Kalau file yang tersimpan sudah tidak ada lagi di tree (dihapus/dipindah
lewat context-menu, lihat `system/contextmenu/README.md` §7a) — pemulihan
dilewati diam-diam, tidak error, viewer tetap menampilkan placeholder awal.
Kalau file masih terdaftar di tree tapi gagal dibaca (mis. dihapus persis
di antara render tree dan restore) — riwayat dihapus dari `localStorage`
supaya refresh berikutnya tidak mengulang percobaan gagal selamanya.

## Pratinjau gambar & Markdown (`editor.js`)

Klik file **gambar** (`.png`/`.jpg`/`.jpeg`/`.gif`/`.webp`/`.bmp`/`.ico`/
`.svg`/`.avif`) di tree TIDAK membuka CodeMirror — `openFileEditor()`
mendeteksi ekstensi (`isImageFile()`) dan mengalihkan ke
`openImagePreview()`: baca via `window.NxDirectory.readImage(relPath)`
(endpoint **terpisah** dari `readFile()` teks — base64 data URL, batas
5 MB, lihat `handleDirectoryImage()` di `index.js` root), render `<img>`.
Read-only murni — tidak ada Ctrl+S/aksi Save untuk gambar (mengedit isi
biner gambar lewat editor teks tidak masuk akal). id `viewerContainer`
**tidak** diganti untuk gambar (beda dari file teks) — target context-menu
tetap `nx-file-viewer-mount` (§7c di `system/contextmenu/README.md`,
menu "Refresh Tree"), bukan §7b (Save/Undo yang tidak relevan).

File **Markdown** (`.md`/`.mdx`) tetap dibuka di CodeMirror seperti file
teks biasa (baca-tulis penuh, Ctrl+S tetap berfungsi), TAPI dapat tab
tambahan **[Markdown | Preview]** di header (`wireMarkdownPreviewToggle()`)
— klik "Preview" merender isi editor **terkini** (bukan snapshot file saat
dibuka) ke HTML lewat `window.NXUI.Markdown` (`NexaMarkdown`,
`assets/modules/markdown/`), dipanggil lewat `fromContent(md).html()`
(BUKAN `fromFile()`/`load()` biasa — itu butuh
`window.electronAPI.discoveryReadFile`, API khusus project lain yang tidak
ada di kernel ini; isi file sudah ada di tangan dari `readFile()`, tidak
perlu dibaca ulang). Klik "Markdown" balik menampilkan CodeMirror — area
editor CM6 cuma disembunyikan (`hidden`), instance TIDAK di-destroy/rebuild
saat toggle.

## Kaitan dengan pola registrasi `system/index.js`

File ini adalah **modul biasa** (`export` normal) — TIDAK di-import
langsung oleh `package/{nama}/index.js` mana pun. Satu-satunya pemanggil
`import` yang sah adalah `system/index.js` (titik registrasi tunggal
distro ini), yang lalu meng-assign hasilnya ke `window.*` sebagai
side-effect. Penjelasan lengkap pola ini (kenapa dipicu dari
`templates/distro/grafis.js`, bukan dari dalam `NXHOME`) ada di
`templates/FLOW.md` §7a dan `templates/README.md` bagian
"`system/index.js` — registrasi GLOBAL fitur turunan milik satu distro".
