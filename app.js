document.addEventListener("DOMContentLoaded", () => {
  const categoriesBar = document.getElementById("categories-bar");
  const pagesNav = document.getElementById("pages-nav");
  const postsContainer = document.getElementById("posts-container");

  let allPosts = [];
  let selectedCategory = null;

  // 1. Cargar Páginas Estáticas (data/pages.json)
  fetch("data/pages.json")
    .then((res) => res.json())
    .then((pages) => {
      pages.forEach((page) => {
        const link = document.createElement("a");
        link.href = `?page=${page.slug}`;
        link.textContent = `[ ~/${page.slug} ]`;
        pagesNav.appendChild(link);
      });
    })
    .catch((err) => console.error("Error al cargar data/pages.json:", err));

  // 2. Cargar Categorías (data/categories.json)
  fetch("data/categories.json")
    .then((res) => res.json())
    .then((categories) => {
      categoriesBar.innerHTML = ""; // Limpiar contenedor

      // Botón para mostrar "Todas"
      const allBtn = document.createElement("button");
      allBtn.className = "category-btn active";
      allBtn.textContent = "Todas";
      allBtn.addEventListener("click", () => filterByCategory(null, allBtn));
      categoriesBar.appendChild(allBtn);

      // Botones por categoría
      categories.forEach((cat) => {
        const btn = document.createElement("button");
        btn.className = "category-btn";
        btn.textContent = cat.nombre;
        btn.dataset.category = cat.nombre;
        btn.addEventListener("click", () => filterByCategory(cat.nombre, btn));
        categoriesBar.appendChild(btn);
      });
    })
    .catch((err) => console.error("Error al cargar data/categories.json:", err));

  // 3. Obtener el índice de meses (data/months.json) y cargar las publicaciones
  fetch("data/months.json")
    .then((res) => res.json())
    .then((months) => {
      if (!months || months.length === 0) {
        postsContainer.innerHTML = "<p>No hay publicaciones disponibles.</p>";
        return;
      }

      // Cargar los JSON de cada mes disponible en paralelo
      const fetchPromises = months.map((month) =>
        fetch(`data/posts_${month}.json`)
          .then((res) => (res.ok ? res.json() : []))
          .catch(() => [])
      );

      return Promise.all(fetchPromises);
    })
    .then((postsByMonth) => {
      if (!postsByMonth) return;

      // Unificar todas las entradas en un único array
      allPosts = postsByMonth.flat();

      // Verificar si hay parámetro de página estática (?page=about)
      const urlParams = new URLSearchParams(window.location.search);
      const pageSlug = urlParams.get("page");

      if (pageSlug) {
        renderStaticPage(pageSlug);
      } else {
        renderPosts(allPosts);
      }
    })
    .catch((err) => {
      console.error("Error al cargar el feed de publicaciones:", err);
      postsContainer.innerHTML = "<p>Error al cargar las publicaciones.</p>";
    });

  // Filtrar publicaciones por categoría sin recargar la página
  function filterByCategory(categoryName, targetBtn) {
    selectedCategory = categoryName;

    // Actualizar estado 'active' en botones
    document.querySelectorAll(".category-btn").forEach((btn) => {
      btn.classList.remove("active");
    });
    targetBtn.classList.add("active");

    if (!selectedCategory) {
      renderPosts(allPosts);
    } else {
      const filtered = allPosts.filter(
        (post) =>
          post.categoria &&
          post.categoria.toLowerCase() === selectedCategory.toLowerCase()
      );
      renderPosts(filtered);
    }
  }

  // Renderizar la lista de entradas en el DOM
  function renderPosts(posts) {
    postsContainer.innerHTML = "";

    if (posts.length === 0) {
      postsContainer.innerHTML =
        "<p class='no-posts'>No se encontraron publicaciones en esta categoría.</p>";
      return;
    }

    posts.forEach((post) => {
      const article = document.createElement("article");
      article.className = "post-card";

      const tagsHTML =
        post.tags && post.tags.length > 0
          ? `<div class="post-tags">${post.tags
              .map((tag) => `<span class="tag">#${tag}</span>`)
              .join(" ")}</div>`
          : "";

      article.innerHTML = `
        <header class="post-header">
          <span class="post-id">[${post.id}]</span>
          <span class="post-date">${post.fecha}</span>
          <span class="post-category">${post.categoria}</span>
        </header>
        <h2><a href="${post.file}">${post.titulo}</a></h2>
        <p class="post-extract">${post.extracto}</p>
        ${tagsHTML}
      `;

      postsContainer.appendChild(article);
    });
  }

  // Cargar y convertir una página Markdown estática (ej: pages/about.md)
  function renderStaticPage(slug) {
    fetch(`data/pages.json`)
      .then((res) => res.json())
      .then((pages) => {
        const pageInfo = pages.find((p) => p.slug === slug);
        if (!pageInfo) {
          postsContainer.innerHTML = "<h2>404 - Página no encontrada</h2>";
          return;
        }

        return fetch(pageInfo.file);
      })
      .then((res) => {
        if (!res.ok) throw new Error("Página no encontrada");
        return res.text();
      })
      .then((mdContent) => {
        // Remover el Front Matter si existe antes de renderizar con marked
        const cleanMd = mdContent.replace(/^---[\s\S]*?---\s*/, "");
        postsContainer.innerHTML = `<div class="static-page">${marked.parse(cleanMd)}</div>`;
      })
      .catch((err) => {
        postsContainer.innerHTML = `<h2>Error</h2><p>No se pudo cargar la página ${slug}.</p>`;
      });
  }
});