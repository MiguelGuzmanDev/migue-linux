document.addEventListener("DOMContentLoaded", () => {
  const categoriesBar = document.getElementById("categories-bar");
  const pagesNav = document.getElementById("pages-nav");
  const postsContainer = document.getElementById("posts-container");

  let allPosts = [];

  // 1. Cargar Páginas Estáticas (data/pages.json)
  fetch("data/pages.json")
    .then((res) => res.json())
    .then((pages) => {
      pagesNav.innerHTML = "";
      pages.forEach((page) => {
        const link = document.createElement("a");
        link.href = `?page=${page.slug}`;
        link.textContent = `[ ~/${page.slug} ]`;
        pagesNav.appendChild(link);
      });
    })
    .catch((err) => console.error("Error cargando pages.json:", err));

  // 2. Cargar Categorías (data/categories.json)
  fetch("data/categories.json")
    .then((res) => res.json())
    .then((categories) => {
      if (!categoriesBar) return;
      categoriesBar.innerHTML = "";

      // Botón [ todas ]
      const allBtn = document.createElement("button");
      allBtn.className = "category-btn active";
      allBtn.textContent = "[ todas ]";
      allBtn.addEventListener("click", () => filterByCategory(null, allBtn));
      categoriesBar.appendChild(allBtn);

      // Botones por categoría
      categories.forEach((cat) => {
        const btn = document.createElement("button");
        btn.className = "category-btn";
        btn.textContent = `[ ${cat.nombre.toLowerCase()} ]`;
        btn.addEventListener("click", () => filterByCategory(cat.nombre, btn));
        categoriesBar.appendChild(btn);
      });
    })
    .catch((err) => console.error("Error cargando categories.json:", err));

  // 3. Cargar publicaciones (data/months.json)
  fetch("data/months.json")
    .then((res) => res.json())
    .then((months) => {
      if (!months || months.length === 0) {
        postsContainer.innerHTML = "<p>No hay publicaciones disponibles.</p>";
        return;
      }

      const fetchPromises = months.map((month) =>
        fetch(`data/posts_${month}.json`)
          .then((res) => (res.ok ? res.json() : []))
          .catch(() => [])
      );

      return Promise.all(fetchPromises);
    })
    .then((postsByMonth) => {
      if (!postsByMonth) return;

      allPosts = postsByMonth.flat();

      const urlParams = new URLSearchParams(window.location.search);
      const pageSlug = urlParams.get("page");

      if (pageSlug) {
        renderStaticPage(pageSlug);
      } else {
        renderPosts(allPosts);
      }
    })
    .catch((err) => {
      console.error("Error al cargar las publicaciones:", err);
      postsContainer.innerHTML = "<p>Error al cargar las publicaciones.</p>";
    });

  function filterByCategory(categoryName, targetBtn) {
    document.querySelectorAll(".category-btn").forEach((btn) => btn.classList.remove("active"));
    targetBtn.classList.add("active");

    if (!categoryName) {
      renderPosts(allPosts);
    } else {
      const filtered = allPosts.filter(
        (post) => post.categoria && post.categoria.toLowerCase() === categoryName.toLowerCase()
      );
      renderPosts(filtered);
    }
  }

  function renderPosts(posts) {
    postsContainer.innerHTML = "";

    if (posts.length === 0) {
      postsContainer.innerHTML = "<p class='no-posts'>No hay publicaciones en esta categoría.</p>";
      return;
    }

    posts.forEach((post) => {
      const article = document.createElement("article");
      article.className = "post-card";

      const tagsHTML = post.tags && post.tags.length > 0
        ? `<div class="post-tags">${post.tags.map((t) => `<span class="tag">#${t}</span>`).join(" ")}</div>`
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

  function renderStaticPage(slug) {
    fetch("data/pages.json")
      .then((res) => res.json())
      .then((pages) => {
        const pageInfo = pages.find((p) => p.slug === slug);
        if (!pageInfo) throw new Error("Página no registrada");
        return fetch(pageInfo.file);
      })
      .then((res) => res.text())
      .then((mdContent) => {
        const cleanMd = mdContent.replace(/^---[\s\S]*?---\s*/, "");
        postsContainer.innerHTML = `<div class="static-page">${marked.parse(cleanMd)}</div>`;
      })
      .catch((err) => {
        postsContainer.innerHTML = `<h2>Error</h2><p>No se pudo cargar la página ${slug}.</p>`;
      });
  }
});