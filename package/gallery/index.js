// Export function untuk route 'contact/data' (menjadi 'contact_data.js')
export async function index(page, route) {
  route.register(page, async (routeName, container, routeMeta = {
    title: "Contact Data | App",
    description: "Data kontak.",
  }, style, nav = {}) => {
    route.routeMetaByRoute.set(page, routeMeta);
 const data = await NxStorage('tabel');

const tree = await window.NxDirectory.traverseDirectory();

    
    console.log("📍 NxStorage to:", data);
    console.log("📍 tree to:", tree);
    container.innerHTML = `
        <article class="nx-page">
          <h1 class="nx-page__title">gallery Data Page</h1>
          <p class="nx-page__lead">Ini adalah halaman Contact Data.</p>
          </section>
        </article>
      `;
  });
}
