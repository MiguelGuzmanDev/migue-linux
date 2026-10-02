document.addEventListener("DOMContentLoaded", () => {
  const categoriesBar = document.getElementById("categories-bar");
  const pagesNav = document.getElementById("pages-nav");
  const postsContainer = document.getElementById("posts-container");

  let allPosts = [];
  let currentFilteredPosts = [];
  let currentPage = 1;
  const postsPerPage = 5; // Cantidad de publicaciones por página

  // Contenedor dinámico de paginación
  const paginationContainer = document.createElement("div");
  paginationContainer.id = "pagination-container";
  paginationContainer.className = "pagination-bar";
  postsContainer.after(paginationContainer);

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
      currentFilteredPosts = allPosts;

      const urlParams = new URLSearchParams(window.location.search);
      const pageSlug = urlParams.get("page");

      if (pageSlug) {
        renderStaticPage(pageSlug);
      } else {
        renderPosts(currentFilteredPosts);
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
      currentFilteredPosts = allPosts;
    } else {
      currentFilteredPosts = allPosts.filter(
        (post) => post.categoria && post.categoria.toLowerCase() === categoryName.toLowerCase()
      );
    }

    currentPage = 1; // Reiniciar a la primera página al filtrar
    renderPosts(currentFilteredPosts);
  }

  function renderPosts(posts) {
    // Asegurar que el header del blog y las categorías estén visibles si estamos en el blog
    const blogHeader = document.getElementById('blog-header');
    if (blogHeader) blogHeader.style.display = 'block';
    if (categoriesBar) categoriesBar.style.display = 'flex';

    postsContainer.innerHTML = "";

    if (posts.length === 0) {
      postsContainer.innerHTML = "<p class='no-posts'>No hay publicaciones en esta categoría.</p>";
      paginationContainer.innerHTML = "";
      return;
    }

    // Paginación: cortar el array de publicaciones según la página actual
    const startIndex = (currentPage - 1) * postsPerPage;
    const endIndex = startIndex + postsPerPage;
    const postsToShow = posts.slice(startIndex, endIndex);

    postsToShow.forEach((post) => {
      const article = document.createElement("article");
      article.className = "post-card";

      // Formatear tags si existen
      const tagsHTML = post.tags && post.tags.length > 0
        ? `<div class="post-tags">${post.tags.map((t) => `<span class="tag">#${t}</span>`).join(" ")}</div>`
        : "";

      // Limpiar ruta del archivo para mostrar solo 'cat nombre-archivo.md'
      const fileName = post.file.split("/").pop();

      article.innerHTML = `
        <h2><a href="${post.file}">cat ${fileName}</a></h2>
        <p class="post-extract">${post.extracto}</p>
        <div class="post-meta">
          ${tagsHTML}
          <span class="post-date">${post.fecha}</span>
        </div>
      `;

      postsContainer.appendChild(article);
    });

    renderPaginationControls(posts.length);
  }

  function renderPaginationControls(totalItems) {
    const totalPages = Math.ceil(totalItems / postsPerPage);
    paginationContainer.innerHTML = "";

    if (totalPages <= 1) return;

    // Botón Anterior
    const prevBtn = document.createElement("button");
    prevBtn.className = "pagination-btn";
    prevBtn.textContent = "[ <-- Anterior ]";
    prevBtn.disabled = currentPage === 1;
    prevBtn.addEventListener("click", () => {
      if (currentPage > 1) {
        currentPage--;
        renderPosts(currentFilteredPosts);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    });

    // Estado de la página
    const pageIndicator = document.createElement("span");
    pageIndicator.className = "pagination-info";
    pageIndicator.textContent = `Página ${currentPage} de ${totalPages}`;

    // Botón Siguiente
    const nextBtn = document.createElement("button");
    nextBtn.className = "pagination-btn";
    nextBtn.textContent = "[ Siguiente --> ]";
    nextBtn.disabled = currentPage === totalPages;
    nextBtn.addEventListener("click", () => {
      if (currentPage < totalPages) {
        currentPage++;
        renderPosts(currentFilteredPosts);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    });

    paginationContainer.appendChild(prevBtn);
    paginationContainer.appendChild(pageIndicator);
    paginationContainer.appendChild(nextBtn);
  }

  function renderStaticPage(slug) {
    // 1. Ocultar el encabezado del blog y la barra de categorías
    const blogHeader = document.getElementById('blog-header');
    if (blogHeader) blogHeader.style.display = 'none';
    if (categoriesBar) categoriesBar.style.display = 'none';
    if (paginationContainer) paginationContainer.innerHTML = '';

    // 2. Cargar el contenido estático
    fetch("data/pages.json")
      .then((res) => res.json())
      .then((pages) => {
        const pageInfo = pages.find((p) => p.slug === slug);
        if (!pageInfo) throw new Error("Página no registrada");
        return fetch(pageInfo.file);
      })
      .then((res) => res.text())
      .then((mdContent) => {
        // Limpiar frontmatter del Markdown si existe
        const cleanMd = mdContent.replace(/^---[\s\S]*?---\s*/, "");
        
        // Estructura tipo ventana / prompt de terminal Linux
        const terminalHeaderHTML = `
          <div class="terminal-page-wrapper">
            <div class="terminal-topbar">
              <div class="terminal-dots">
                <span class="dot red"></span>
                <span class="dot yellow"></span>
                <span class="dot green"></span>
              </div>
              <span class="terminal-filename">bash — miguelguzman@migue-linux: ~/${slug}.md</span>
            </div>
            <div class="terminal-command-line">
              <span class="prompt-user">miguelguzman@migue-linux</span>:<span class="prompt-path">~#</span> 
              <span class="prompt-cmd">cat ~/${slug}.md</span>
            </div>
            <div class="static-page-content">
              ${marked.parse(cleanMd)}
            </div>
          </div>
        `;

        postsContainer.innerHTML = terminalHeaderHTML;
      })
      .catch((err) => {
        postsContainer.innerHTML = `
          <div class="terminal-page-wrapper">
            <div class="terminal-command-line">
              <span class="prompt-user">miguelguzman@migue-linux</span>:<span class="prompt-path">~#</span> 
              <span class="prompt-cmd">cat ~/${slug}.md</span>
            </div>
            <div class="status-err" style="padding: 1.5rem;">
              [ERR_404] No such file or directory: ~/${slug}.md
            </div>
          </div>
        `;
      });
  }
});
