document.addEventListener("DOMContentLoaded", () => {
  // =========================================================================
  // 1. Configuración
  // =========================================================================
  const PROMPT_USER = "miguelguzman@Oaxaqueando";
  const DEFAULT_AUTHOR = "miguel-guzman";
  const DEFAULT_AVATAR = "https://migue-linux.com/assets/img/authors/default.avif";
  const POSTS_PER_PAGE = 5;
  const AUTHOR_RECENT_POSTS = 5;

  // =========================================================================
  // 2. Elementos del DOM
  // =========================================================================
  const blogHeader = document.getElementById("blog-header");
  const categoriesBar = document.getElementById("categories-bar");
  const pagesNav = document.getElementById("pages-nav");
  const postsContainer = document.getElementById("posts-container");
  const cliFooter = document.querySelector(".cli-footer");

  // Contenedor dinámico de paginación
  const paginationContainer = document.createElement("div");
  paginationContainer.id = "pagination-container";
  paginationContainer.className = "pagination-bar";
  postsContainer.after(paginationContainer);

  // =========================================================================
  // 3. Estado
  // =========================================================================
  const params = new URLSearchParams(window.location.search);
  const route = {
    page: params.get("page"),
    post: params.get("post"),
    author: params.get("author"),
  };

  let allPosts = [];
  let allAuthors = [];
  let allPages = [];
  let currentFilteredPosts = [];
  let currentPage = 1;

  // =========================================================================
  // 4. Utilidades
  // =========================================================================

  // Escapa texto antes de insertarlo en innerHTML (evita XSS con valores de la URL o del JSON)
  function esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // Descarga un JSON; si falla devuelve `fallback` para no romper el resto del sitio
  function loadJSON(url, fallback = []) {
    return fetch(url)
      .then((res) => (res.ok ? res.json() : fallback))
      .catch((err) => {
        console.error(`Error cargando ${url}:`, err);
        return fallback;
      });
  }

  // Quita el Front Matter (--- ... ---) y convierte el Markdown a HTML
  function renderMarkdown(mdContent) {
    const cleanMd = mdContent.replace(/^---[\s\S]*?---\s*/, "");
    return typeof marked !== "undefined" ? marked.parse(cleanMd) : `<pre>${esc(cleanMd)}</pre>`;
  }

  function getPostSlug(post) {
    return post.slug || post.file.split("/").pop().replace(/\.md$/, "");
  }

  function findPost(slug) {
    return allPosts.find((p) => getPostSlug(p) === slug || p.id === slug);
  }

  function findAuthor(authorId) {
    return allAuthors.find((a) => a.id === authorId);
  }

  // Muestra u oculta las secciones fijas del layout según la vista
  function setLayout({ header = false, categories = false, footer = true } = {}) {
    if (blogHeader) blogHeader.style.display = header ? "block" : "none";
    if (categoriesBar) categoriesBar.style.display = categories ? "flex" : "none";
    if (cliFooter) cliFooter.style.display = footer ? "block" : "none";
    if (!categories) paginationContainer.innerHTML = "";
  }

  // =========================================================================
  // 5. Plantillas HTML
  // =========================================================================
  function promptLineHTML(command, user = PROMPT_USER) {
    return `<span class="prompt-user">${esc(user)}</span>:<span class="prompt-path">~#</span>
      <span class="prompt-cmd">${esc(command)}</span>`;
  }

  // Ventana de terminal: barra con los 3 puntos + línea de comando + contenido
  function terminalHTML({ title, command, body = "", promptUser, afterCommand = "", style = "" }) {
    return `
      <div class="terminal-page-wrapper"${style ? ` style="${style}"` : ""}>
        <div class="terminal-topbar">
          <div class="terminal-dots">
            <span class="dot red"></span>
            <span class="dot yellow"></span>
            <span class="dot green"></span>
          </div>
          <span class="terminal-filename">${esc(title)}</span>
        </div>
        <div class="terminal-command-line">
          ${promptLineHTML(command, promptUser)}
          ${afterCommand}
        </div>
        ${body}
      </div>
    `;
  }

  // Tarjeta de un post en los listados (portada y perfil de autor)
  function postCardHTML(post, { showAuthor }) {
    const fileName = post.file.split("/").pop();
    const tagsHTML = post.tags && post.tags.length > 0
      ? `<div class="post-tags">${post.tags.map((t) => `<span class="tag">#${esc(t)}</span>`).join(" ")}</div>`
      : "";

    let dateHTML = esc(post.fecha);
    if (showAuthor) {
      const authorId = post.author || DEFAULT_AUTHOR;
      const authorInfo = findAuthor(authorId);
      const authorName = authorInfo ? authorInfo.name : "Miguel Guzmán";
      const authorLink = authorInfo ? authorInfo.link : `?author=${encodeURIComponent(authorId)}`;
      dateHTML += ` de <a href="${esc(authorLink)}" class="author-link">${esc(authorName)}</a>`;
    }

    return `
      <h2><a href="?post=${encodeURIComponent(getPostSlug(post))}">cat ${esc(fileName)}</a></h2>
      <p class="post-extract">${esc(post.extracto)}</p>
      <div class="post-meta">
        ${tagsHTML}
        <span class="post-date">${dateHTML}</span>
      </div>
    `;
  }

  function appendPostCards(container, posts, options) {
    posts.forEach((post) => {
      const article = document.createElement("article");
      article.className = "post-card";
      article.innerHTML = postCardHTML(post, options);
      container.appendChild(article);
    });
  }

  // Tarjeta del autor al final de cada post
  function authorCardHTML(authorId) {
    const author = findAuthor(authorId) || findAuthor(DEFAULT_AUTHOR);
    if (!author) return "";

    const authorTitle = author.title || author.Title || "El autor";
    const authorAvatar = author.avatar || DEFAULT_AVATAR;

    return `
      <div class="author-card">
        <div class="author-card-header">
          <div class="author-avatar">
            <img src="${esc(authorAvatar)}" alt="${esc(author.name)}">
          </div>
          <div class="author-info">
            <span class="author-label">${esc(authorTitle)}</span>
            <h4 class="author-name">${esc(author.name)}</h4>
          </div>
        </div>
        <div class="author-bio">
          <p>${esc(author.description)}</p>
        </div>
        <div class="author-footer">
          <a href="${esc(author.link || `?author=${encodeURIComponent(author.id)}`)}" class="more-from-author">Más sobre ${esc(author.name)} &rarr;</a>
        </div>
      </div>
    `;
  }

  // =========================================================================
  // 6. Navegación y categorías
  // =========================================================================
  function renderPagesNav() {
    pagesNav.innerHTML = "";
    allPages.forEach((page) => {
      const link = document.createElement("a");
      link.href = `?page=${encodeURIComponent(page.slug)}`;
      link.textContent = `[ ~/${page.slug} ]`;
      pagesNav.appendChild(link);
    });
    updateActiveNav();
  }

  // Resalta la página o sección activa en #pages-nav
  function updateActiveNav() {
    const inBlog = !route.page || route.post || route.author;

    pagesNav.querySelectorAll("a").forEach((link) => {
      const href = link.getAttribute("href");
      const active = inBlog
        ? href === "./" || href.includes("page=blog")
        : href.includes(`page=${encodeURIComponent(route.page)}`);
      link.classList.toggle("active", active);
    });
  }

  function renderCategories(categories) {
    if (!categoriesBar) return;
    categoriesBar.innerHTML = "";

    const addButton = (label, categoryName, active = false) => {
      const btn = document.createElement("button");
      btn.className = active ? "category-btn active" : "category-btn";
      btn.textContent = `[ ${label} ]`;
      btn.addEventListener("click", () => filterByCategory(categoryName, btn));
      categoriesBar.appendChild(btn);
    };

    addButton("todas", null, true);
    categories.forEach((cat) => addButton(cat.nombre.toLowerCase(), cat.nombre));
  }

  function filterByCategory(categoryName, targetBtn) {
    document.querySelectorAll(".category-btn").forEach((btn) => btn.classList.remove("active"));
    targetBtn.classList.add("active");

    currentFilteredPosts = categoryName
      ? allPosts.filter((post) => post.categoria && post.categoria.toLowerCase() === categoryName.toLowerCase())
      : allPosts;

    currentPage = 1;
    renderPosts(currentFilteredPosts);
  }

  // =========================================================================
  // 7. Vistas
  // =========================================================================

  // Listado principal de posts con paginación
  function renderPosts(posts) {
    setLayout({ header: true, categories: true });
    postsContainer.innerHTML = "";

    if (posts.length === 0) {
      postsContainer.innerHTML = "<p class='no-posts'>No hay publicaciones en esta categoría.</p>";
      paginationContainer.innerHTML = "";
      return;
    }

    const start = (currentPage - 1) * POSTS_PER_PAGE;
    appendPostCards(postsContainer, posts.slice(start, start + POSTS_PER_PAGE), { showAuthor: true });
    renderPaginationControls(posts.length);
  }

  function renderPaginationControls(totalItems) {
    const totalPages = Math.ceil(totalItems / POSTS_PER_PAGE);
    paginationContainer.innerHTML = "";
    if (totalPages <= 1) return;

    const goTo = (page) => {
      currentPage = page;
      renderPosts(currentFilteredPosts);
      window.scrollTo({ top: 0, behavior: "smooth" });
    };

    const prevBtn = document.createElement("button");
    prevBtn.className = "pagination-btn";
    prevBtn.textContent = "[ <-- Anterior ]";
    prevBtn.disabled = currentPage === 1;
    prevBtn.addEventListener("click", () => currentPage > 1 && goTo(currentPage - 1));

    const pageIndicator = document.createElement("span");
    pageIndicator.className = "pagination-info";
    pageIndicator.textContent = `Página ${currentPage} de ${totalPages}`;

    const nextBtn = document.createElement("button");
    nextBtn.className = "pagination-btn";
    nextBtn.textContent = "[ Siguiente --> ]";
    nextBtn.disabled = currentPage === totalPages;
    nextBtn.addEventListener("click", () => currentPage < totalPages && goTo(currentPage + 1));

    paginationContainer.append(prevBtn, pageIndicator, nextBtn);
  }

  // Página estática (?page=about) definida en data/pages.json
  async function renderStaticPage(slug) {
    setLayout();

    const pageInfo = allPages.find((p) => p.slug === slug);
    if (!pageInfo) return renderNotFound(slug);

    try {
      const res = await fetch(pageInfo.file);
      if (!res.ok) throw new Error("Markdown file not found");
      const mdContent = await res.text();

      postsContainer.innerHTML = terminalHTML({
        title: `${PROMPT_USER}: ~/${slug}.md`,
        command: `cat ~/${slug}.md`,
        body: `<div class="static-page-content" style="margin-top: 1.5rem;">${renderMarkdown(mdContent)}</div>`,
      });
    } catch (err) {
      console.warn(`Error al cargar página estática (${slug}):`, err);
      renderNotFound(slug);
    }
  }

  // Post individual (?post=ID-slug)
  async function renderSinglePost(slug) {
    setLayout();

    const postInfo = findPost(slug);
    if (!postInfo) return renderNotFound(slug);

    try {
      const res = await fetch(postInfo.file);
      if (!res.ok) throw new Error("File not found");
      const mdContent = await res.text();

      // El autor puede venir en el JSON o en el Front Matter del .md
      let authorId = postInfo.author;
      if (!authorId) {
        const fmMatch = mdContent.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
        const authorMatch = fmMatch && fmMatch[1].match(/(?:author|autor):\s*["']?([^"'\r\n]+)["']?/i);
        if (authorMatch) authorId = authorMatch[1].trim();
      }

      postsContainer.innerHTML = terminalHTML({
        title: "bash — 80x24",
        command: `cat ${postInfo.file}`,
        body: `<div class="static-page-content">
          ${renderMarkdown(mdContent)}
          ${authorCardHTML(authorId || DEFAULT_AUTHOR)}
        </div>`,
      });
    } catch (err) {
      console.warn(`Error al cargar el post (${slug}):`, err);
      renderNotFound(slug);
    }
  }

  // Perfil de autor estilo comando `finger` (?author=id)
  async function renderAuthorPage(authorSlug) {
    setLayout();

    const authorInfo = findAuthor(authorSlug);
    if (!authorInfo) return renderNotFound(authorSlug);

    const name = authorInfo.name || "Autor";
    const title = authorInfo.title || "SysAdmin & Contribuidor";
    const avatar = authorInfo.avatar || DEFAULT_AVATAR;
    const description = authorInfo.description || "Sin biografía disponible.";
    const profileFile = authorInfo.profile || `${authorSlug}.md`;

    // Biografía extendida opcional en data/authors/<id>.md
    let extendedBioHTML = "";
    try {
      const mdResponse = await fetch(`data/authors/${profileFile}`);
      if (mdResponse.ok) extendedBioHTML = renderMarkdown(await mdResponse.text());
    } catch (err) {
      console.warn(`No se pudo cargar el archivo extendido data/authors/${profileFile}`, err);
    }

    const authorPosts = allPosts.filter((post) => (post.author || DEFAULT_AUTHOR) === authorSlug);
    const recentPosts = authorPosts.slice(0, AUTHOR_RECENT_POSTS);
    const totalHTML = authorPosts.length > AUTHOR_RECENT_POSTS
      ? `<span class="posts-count">(${authorPosts.length} en total)</span>`
      : "";

    const body = `
      <div class="author-terminal-card">
        <div class="author-card-main">
          <div class="author-avatar">
            <img src="${esc(avatar)}" alt="${esc(name)}">
          </div>
          <div class="author-details">
            <div class="author-field"><span class="field-label">Login:</span> <span class="field-value">${esc(authorSlug)}</span></div>
            <div class="author-field"><span class="field-label">Name:</span> <span class="field-value font-bold">${esc(name)}</span></div>
            <div class="author-field"><span class="field-label">Role:</span> <span class="field-value highlight">${esc(title)}</span></div>
            <div class="author-field"><span class="field-label">Host:</span> <span class="field-value">migue-linux.com</span></div>
          </div>
        </div>
        <div class="author-bio-section">
          <span class="field-label">> Bio / System Plan:</span>
          <p class="author-bio-text">${esc(description)}</p>
        </div>
      </div>

      ${extendedBioHTML
        ? `<div class="author-extended-bio" style="margin-top: 2rem; padding-top: 1.5rem; border-top: 1px dashed #30363d;">
            ${extendedBioHTML}
           </div>`
        : ""}

      <div class="author-extended-bio" style="margin-top: 2rem; padding-top: 1.5rem; border-top: 1px solid #30363d;">
        <h3 class="author-posts-title" style="margin-bottom: 1rem;">
          > Últimas ${recentPosts.length} publicaciones de ${esc(name)} ${totalHTML}:
        </h3>
        ${promptLineHTML("tail -n 5 ~/posts.json")}
        <div id="author-posts-list"></div>
      </div>
    `;

    postsContainer.innerHTML = terminalHTML({
      title: `bash — finger ${authorSlug}`,
      command: `finger ${authorSlug}`,
      body,
      style: "margin-bottom: 2rem;",
    });

    if (recentPosts.length === 0) {
      postsContainer.insertAdjacentHTML("beforeend", "<p class='no-posts'>No hay publicaciones registradas para este autor.</p>");
      return;
    }

    appendPostCards(document.getElementById("author-posts-list"), recentPosts, { showAuthor: false });
  }

  // 404 con estilo terminal (post, autor o página inexistente)
  function renderNotFound(invalidResource) {
    setLayout({ footer: false });

    postsContainer.innerHTML = terminalHTML({
      title: "bash — 404 NOT FOUND",
      command: `cat ${invalidResource}.md`,
      promptUser: "miguelguzman@migue-linux",
      style: "margin-bottom: 2rem;",
      afterCommand: `<div>cat: ~/${esc(invalidResource)}: No existe el fichero o el directorio</div>`,
      body: `
        <div class="terminal-error-box">
          <h2 class="terminal-error-title">[HTTP 404] ERROR: Resource Not Found</h2>
          <p class="terminal-error-desc">
            No se encontró la ruta especificada en el servidor virtual <code>migue-linux.com</code>.
          </p>
          <div class="terminal-error-suggestion">
            &gt; SUGGESTION: Ejecuta un retorno al directorio raíz mediante <a href="/">[ ~/home ]</a>
          </div>
        </div>
      `,
    });
  }

  // =========================================================================
  // 8. Contador de visitas (api/tracker.php)
  // =========================================================================
  function trackPageView() {
    const pathname = window.location.pathname.replace(/^\/|\/$/g, "");
    const trackingPage = route.page ? `page-${route.page}` : (pathname || "home");

    fetch(`/api/tracker.php?page=${encodeURIComponent(trackingPage)}`)
      .then((response) => response.json())
      .then((data) => {
        if (data.status !== "success") return;
        const totalEl = document.getElementById("total-views");
        const pageEl = document.getElementById("page-views");
        if (totalEl) totalEl.textContent = Number(data.total_views).toLocaleString().padStart(8, " ");
        if (pageEl) pageEl.textContent = Number(data.page_views).toLocaleString().padStart(8, " ");
      })
      .catch((err) => {
        console.error("Error al registrar visita:", err);
        const statusEl = document.getElementById("sys-status");
        if (statusEl) {
          statusEl.className = "status-err";
          statusEl.textContent = "ERR_CONNECTION_FAILED";
        }
      });
  }

  // =========================================================================
  // 9. Router: decide qué vista mostrar según la URL
  // =========================================================================
  function router() {
    if (route.post) return renderSinglePost(route.post);
    if (route.author) return renderAuthorPage(route.author);
    if (route.page && route.page !== "blog") return renderStaticPage(route.page);
    // Raíz o ?page=blog -> listado de posts
    return renderPosts(currentFilteredPosts);
  }

  // =========================================================================
  // 10. Arranque: cargar todos los datos y después enrutar
  // =========================================================================
  async function init() {
    trackPageView();

    const postsPromise = loadJSON("data/months.json").then((months) =>
      Promise.all(months.map((month) => loadJSON(`data/posts_${month}.json`)))
    );

    const [authors, pages, categories, postsByMonth] = await Promise.all([
      loadJSON("data/authors.json"),
      loadJSON("data/pages.json"),
      loadJSON("data/categories.json"),
      postsPromise,
    ]);

    allAuthors = authors;
    allPages = pages;
    allPosts = postsByMonth.flat();
    currentFilteredPosts = allPosts;

    renderPagesNav();
    renderCategories(categories);

    if (allPosts.length === 0 && !route.page) {
      postsContainer.innerHTML = "<p>No hay publicaciones disponibles.</p>";
      return;
    }

    router();
  }

  init().catch((err) => {
    console.error("Error al iniciar el sitio:", err);
    postsContainer.innerHTML = "<p>Error al cargar las publicaciones.</p>";
  });
});
