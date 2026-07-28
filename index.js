// Entry point extension "Rebit" — dipanggil dari templates/distro/grafis.js.
// NXHOME adalah konvensi baku fungsi pembuka utama extension. grafis.js
// SUDAH route.register duluan — NXHOME TIDAK boleh route.register lagi,
// cukup isi container yang sudah disiapkan.
export async function NXHOME(container, routeMeta) {
  container.innerHTML = `
      <article class="nx-page">
        <h1 class="nx-page__title">Distro Grafis</h1>
         <a href="/distro/home">Cotoh 1</a>|
         <a href="#distro/cotoh">Cotoh 2</a>|
         <a href="/instal">instal 2</a>|
         <a href="#distro/package/gallery/index">gallery</a>|
         <a href="#distro/package/news/index">news</a>|
         <a href="#distro/package/directory/index">directory</a>|
         <a href="/boot/componen">componen</a>|
<div class="row">
    <div class="col-6">
      <div id="contes1">Lorem ipsum dolor sit amet, 
      
    </div>
    </div>
    <div class="col-6">
      <div id="contes2">Lorem ipsum dolor 
      sit amet, consectetur adipisicing elit. 
      
      
      </div>

    </div>
</div>

<hr>

          <div id="nxhome"></div>
      </article>
    `;
}
