// Export function untuk route 'contact/data' (menjadi 'contact_data.js')
export async function home(page, route) {
  route.register(page, async (routeName, container, routeMeta = {
    title: "Contact Data | App",
    description: "Data kontak.",
  }, style, nav = {}) => {
    route.routeMetaByRoute.set(page, routeMeta);
    console.log("📍 Navigating to:", NEXA);
    container.innerHTML = `
        <article class="nx-page">
          <h1 class="nx-page__title">Ini Home</h1>
            <p>Data kontak akan ditampilkan di sini.</p>
          </section>
        </article>
      `;
  });
}

