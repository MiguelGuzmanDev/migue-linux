document.addEventListener("DOMContentLoaded", () => {
  // =========================================================================
  // 1. Configuración
  // =========================================================================
  const PROMPT_USER = "miguelguzman@Oaxaqueando";
  const DEFAULT_AUTHOR = "miguel-guzman";
  const DEFAULT_AVATAR = "assets/img/authors/default.avif";
  const SITE_NAME = "MigueLinux";
  const POSTS_PER_PAGE = 5;
  const AUTHOR_RECENT_POSTS = 5;
  const NEW_POST_DAYS = 14; // Días que un post muestra la etiqueta NUEVO
  const WORDS_PER_MINUTE = 200; // Para calcular el tiempo de lectura
  const TOC_MIN_HEADINGS = 3; // Mínimo de subtítulos para mostrar el índice

  // =========================================================================
  // 2. Elementos del DOM
  // =========================================================================
  const blogHeader = document.getElementById("blog-header");
  const categoriesBar = document.getElementById("categories-bar");
  const pagesNav = document.getElementById("pages-nav");
  const postsContainer = document.getElementById("posts-container");
  const cliFooter = document.querySelector(".cli-footer");
  const windowPath = document.getElementById("window-path");
  const searchInput = document.getElementById("search-input");

  // Contenedor dinámico de paginación
  const paginationContainer = document.createElement("div");
  paginationContainer.id = "pagination-container";
  paginationContainer.className = "pagination-bar";
  postsContainer.after(paginationContainer);

  // =========================================================================
  // 3. Estado
  // =========================================================================
  // El post puede venir en la URL (?post=...) o en las páginas generadas por build.sh (p/<slug>.html)
  const params = new URLSearchParams(window.location.search);
  const route = {
    page: params.get("page"),
    post: params.get("post") || document.body.dataset.post || null,
    author: params.get("author"),
    tag: params.get("tag"),
    tags: params.has("tags"),
  };

  let allPosts = [];
  let allAuthors = [];
  let allPages = [];
  let allTags = [];
  let currentFilteredPosts = [];
  let currentCategory = null;
  let currentQuery = "";
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

  // Minúsculas y sin acentos, para que "configuracion" encuentre "configuración"
  function normalize(text) {
    return String(text ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  function readingMinutes(mdContent) {
    const words = mdContent.replace(/^---[\s\S]*?---\s*/, "").split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
  }

  // Convierte un título en un id para enlazarlo desde el índice: "¿Por qué?" -> "por-que"
  function slugify(text) {
    return normalize(text).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "seccion";
  }

  function isNewPost(post) {
    const published = new Date(post.fecha);
    if (isNaN(published)) return false;
    return (Date.now() - published.getTime()) / 86400000 <= NEW_POST_DAYS;
  }

  // Muestra u oculta las secciones fijas del layout según la vista
  function setLayout({ header = false, footer = true } = {}) {
    if (blogHeader) blogHeader.style.display = header ? "block" : "none";
    if (cliFooter) cliFooter.style.display = footer ? "block" : "none";
    if (!header) paginationContainer.innerHTML = "";
  }

  // Ruta que se muestra en la barra de la ventana
  function setWindowPath(path) {
    if (windowPath) windowPath.textContent = path;
  }

  // Título de la pestaña (y el que ve Google al ejecutar el JS)
  function setTitle(title) {
    document.title = `${title} | ${SITE_NAME}`;
  }

  // URL de un post: página estática generada por build.sh (mejor para SEO y redes sociales)
  function postURL(post) {
    return `p/${encodeURIComponent(getPostSlug(post))}.html`;
  }

  // =========================================================================
  // 5. Plantillas HTML
  // =========================================================================
  function promptLineHTML(command) {
    const [host] = PROMPT_USER.split(":");
    return `<div class="cmd"><span class="ps1"><span class="ps1-host">${esc(host)}:</span><span class="ps1-path">~</span>$</span> <span class="prompt-cmd">${esc(command)}</span></div>`;
  }

  // Una "vista" es un comando ejecutado + su salida
  function terminalHTML({ path, command, body = "", afterCommand = "" }) {
    setWindowPath(path);
    return `
      <section class="view">
        ${promptLineHTML(command)}
        ${afterCommand}
        ${body}
      </section>
    `;
  }

  // Cada tag es un enlace a su página (?tag=kvm)
  function tagsHTML(tags) {
    return tags && tags.length > 0
      ? `<span class="post-tags">${tags.map((t) => `<a class="tag" href="?tag=${encodeURIComponent(slugify(t))}">#${esc(t)}</a>`).join(" ")}</span>`
      : "";
  }

  function postsWithTag(tagSlug) {
    return allPosts.filter((post) => (post.tags || []).some((t) => slugify(t) === tagSlug));
  }

  // Un post en los listados, con formato de `ls -l`
  function postCardHTML(post, { showAuthor }) {
    const fileName = post.file.split("/").pop();
    const href = postURL(post);

    let authorHTML = "";
    if (showAuthor) {
      const authorId = post.author || DEFAULT_AUTHOR;
      const authorInfo = findAuthor(authorId);
      const authorName = authorInfo ? authorInfo.name : "Miguel Guzmán";
      const authorLink = authorInfo ? authorInfo.link : `?author=${encodeURIComponent(authorId)}`;
      authorHTML = `<span class="post-author">por <a href="${esc(authorLink)}" class="author-link">${esc(authorName)}</a></span>`;
    }

    return `
      <div class="ls-line">
        <span class="perm">-rw-r--r--</span>
        <span class="post-date">${esc(post.fecha)}</span>
        <a class="fname" href="${href}">${esc(fileName)}</a>${isNewPost(post) ? '<span class="badge">NUEVO</span>' : ""}
      </div>
      <h2 class="post-title"><a href="${href}">${esc(post.titulo || fileName)}</a></h2>
      <p class="post-extract">${esc(post.extracto)}</p>
      <div class="post-meta">
        ${tagsHTML(post.tags)}
        ${post.minutos ? `<span class="reading-time">${esc(post.minutos)} min</span>` : ""}
        ${authorHTML}
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

  // Índice clicable con los subtítulos (##, ###) de un post largo
  function addTableOfContents(content) {
    const headings = [...content.querySelectorAll("h2, h3")];
    if (headings.length < TOC_MIN_HEADINGS) return;

    const usedIds = new Set();
    const items = headings.map((h) => {
      let id = slugify(h.textContent);
      for (let n = 2; usedIds.has(id); n++) id = `${slugify(h.textContent)}-${n}`;
      usedIds.add(id);
      h.id = id;
      return `<li class="toc-${h.tagName.toLowerCase()}"><a href="${location.pathname}${location.search}#${id}">${esc(h.textContent)}</a></li>`;
    });

    const toc = document.createElement("nav");
    toc.className = "toc";
    toc.setAttribute("aria-label", "Índice");
    toc.innerHTML = `
      <div class="toc-title">$ grep "^##" ${esc(windowPath ? windowPath.textContent.split("/").pop() : "post.md")}</div>
      <ol>${items.join("")}</ol>
    `;

    // Va después del título principal del post, si lo tiene
    const firstH1 = content.querySelector("h1");
    if (firstH1) firstH1.after(toc);
    else content.prepend(toc);
  }

  // Convierte cada <pre><code> en una caja con encabezado, resaltado y botón copiar
  function enhanceCodeBlocks(root) {
    root.querySelectorAll("pre > code").forEach((code) => {
      const pre = code.parentElement;
      const langClass = [...code.classList].find((c) => c.startsWith("language-"));
      const lang = langClass ? langClass.replace("language-", "") : "texto";

      if (typeof hljs !== "undefined" && langClass && hljs.getLanguage(lang)) {
        hljs.highlightElement(code);
      }

      const block = document.createElement("div");
      block.className = "code-block";
      block.innerHTML = `
        <div class="code-head">
          <span class="led"></span>
          <span class="code-lang">${esc(lang)}</span>
          <button type="button" class="copy-btn">copiar</button>
        </div>
      `;
      pre.replaceWith(block);
      block.appendChild(pre);

      const copyBtn = block.querySelector(".copy-btn");
      copyBtn.addEventListener("click", async () => {
        // En bloques de shell no copiamos el "$ " del prompt
        const text = /^(bash|sh|shell|zsh|console)$/.test(lang)
          ? code.innerText.replace(/^\$ /gm, "")
          : code.innerText;
        try {
          await navigator.clipboard.writeText(text);
          copyBtn.textContent = "copiado ✓";
          copyBtn.classList.add("copied");
        } catch {
          copyBtn.textContent = "error";
        }
        setTimeout(() => {
          copyBtn.textContent = "copiar";
          copyBtn.classList.remove("copied");
        }, 1500);
      });
    });
  }

  // =========================================================================
  // 6. Navegación y categorías
  // =========================================================================
  function renderPagesNav() {
    pagesNav.innerHTML = "";
    allPages.forEach((page) => {
      const link = document.createElement("a");
      link.href = `?page=${encodeURIComponent(page.slug)}`;
      link.textContent = `~/${page.slug}`;
      pagesNav.appendChild(link);
    });

    const tagsLink = document.createElement("a");
    tagsLink.href = "?tags";
    tagsLink.textContent = "~/tags";
    pagesNav.appendChild(tagsLink);

    const rss = document.createElement("a");
    rss.href = "feed.xml";
    rss.textContent = "~/rss";
    rss.title = "Suscríbete con tu lector RSS";
    pagesNav.appendChild(rss);

    updateActiveNav();
  }

  // Resalta la página o sección activa en #pages-nav
  function updateActiveNav() {
    const inTags = route.tag || route.tags;
    const inBlog = !inTags && (!route.page || route.post || route.author);

    pagesNav.querySelectorAll("a").forEach((link) => {
      const href = link.getAttribute("href");
      let active;
      if (inTags) active = href === "?tags";
      else if (inBlog) active = href === "./" || href.includes("page=blog");
      else active = href.includes(`page=${encodeURIComponent(route.page)}`);
      link.classList.toggle("active", active);
    });
  }

  function renderCategories(categories) {
    if (!categoriesBar) return;
    categoriesBar.innerHTML = "";

    const addButton = (label, categoryName, active = false) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = active ? "category-btn active" : "category-btn";
      btn.textContent = label;
      btn.addEventListener("click", () => filterByCategory(categoryName, btn));
      categoriesBar.appendChild(btn);
    };

    addButton("todas", null, true);
    categories.forEach((cat) => addButton(cat.nombre.toLowerCase(), cat.nombre));
  }

  function filterByCategory(categoryName, targetBtn) {
    document.querySelectorAll(".category-btn").forEach((btn) => btn.classList.remove("active"));
    targetBtn.classList.add("active");
    currentCategory = categoryName;
    applyFilters();
  }

  // Aplica la categoría y la búsqueda juntas
  function applyFilters() {
    const query = normalize(currentQuery.trim());

    currentFilteredPosts = allPosts.filter((post) => {
      if (currentCategory && normalize(post.categoria) !== normalize(currentCategory)) return false;
      if (!query) return true;
      const haystack = normalize([post.titulo, post.extracto, post.categoria, post.file, ...(post.tags || [])].join(" "));
      return haystack.includes(query);
    });

    currentPage = 1;
    renderPosts(currentFilteredPosts);
  }

  // Buscador con forma de comando: grep -ri "texto" ~/posts
  function setupSearch() {
    if (!searchInput) return;

    const resize = () => {
      searchInput.style.width = `calc(${Math.max(searchInput.value.length, searchInput.placeholder.length)}ch + 6px)`;
    };
    resize();

    searchInput.addEventListener("input", () => {
      resize();
      currentQuery = searchInput.value;
      applyFilters();
    });

    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && searchInput.value) {
        searchInput.value = "";
        searchInput.dispatchEvent(new Event("input"));
      }
    });
  }

  // =========================================================================
  // 7. Vistas
  // =========================================================================

  // Listado principal de posts con paginación
  function renderPosts(posts) {
    setLayout({ header: true });

    const query = currentQuery.trim();
    let command = query ? `grep -ril "${query}" ~/posts` : "ls -lt ~/posts";
    if (currentCategory) command += ` | grep ${currentCategory.toLowerCase()}`;

    if (posts.length === 0) {
      const message = query
        ? `grep: no hay coincidencias para "${esc(query)}"`
        : "No hay publicaciones en esta categoría.";
      postsContainer.innerHTML = terminalHTML({
        path: "~/posts",
        command,
        body: `<p class='no-posts'>${message}</p>`,
      });
      paginationContainer.innerHTML = "";
      return;
    }

    postsContainer.innerHTML = terminalHTML({
      path: "~/posts",
      command,
      body: `<div class="ls" id="posts-list"></div>`,
    });

    const start = (currentPage - 1) * POSTS_PER_PAGE;
    appendPostCards(document.getElementById("posts-list"), posts.slice(start, start + POSTS_PER_PAGE), { showAuthor: true });
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
    prevBtn.textContent = "← anterior";
    prevBtn.disabled = currentPage === 1;
    prevBtn.addEventListener("click", () => currentPage > 1 && goTo(currentPage - 1));

    const pageIndicator = document.createElement("span");
    pageIndicator.className = "pagination-info";
    pageIndicator.textContent = `página ${currentPage}/${totalPages}`;

    const nextBtn = document.createElement("button");
    nextBtn.className = "pagination-btn";
    nextBtn.textContent = "siguiente →";
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

      setTitle(pageInfo.titulo || slug);
      postsContainer.innerHTML = terminalHTML({
        path: `~/${slug}.md`,
        command: `cat ~/${slug}.md`,
        body: `<div class="static-page-content">${renderMarkdown(mdContent)}</div>`,
      });
      enhanceCodeBlocks(postsContainer);
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

      setTitle(postInfo.titulo || slug);
      postsContainer.innerHTML = terminalHTML({
        path: `~/${postInfo.file}`,
        command: `cat ${postInfo.file}`,
        body: `
          <div class="post-meta post-meta-single">
            ${tagsHTML(postInfo.tags)}
            <span class="post-date">${esc(postInfo.fecha)}</span>
            <span class="reading-time">${readingMinutes(mdContent)} min de lectura</span>
          </div>
          <div class="static-page-content">
            ${renderMarkdown(mdContent)}
          </div>
          ${authorCardHTML(authorId || DEFAULT_AUTHOR)}
        `,
      });
      addTableOfContents(postsContainer.querySelector(".static-page-content"));
      enhanceCodeBlocks(postsContainer);
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
          <span class="field-label">Plan:</span>
          <p class="author-bio-text">${esc(description)}</p>
        </div>
      </div>

      ${extendedBioHTML ? `<div class="static-page-content author-extended-bio">${extendedBioHTML}</div>` : ""}

      ${promptLineHTML(`ls -lt ~/posts --author=${authorSlug} | head -n ${AUTHOR_RECENT_POSTS}`)}
      <p class="author-posts-title">Últimas ${recentPosts.length} publicaciones de ${esc(name)} ${totalHTML}</p>
      <div class="ls" id="author-posts-list"></div>
    `;

    setTitle(name);
    postsContainer.innerHTML = terminalHTML({
      path: `~/users/${authorSlug}`,
      command: `finger ${authorSlug}`,
      body,
    });
    enhanceCodeBlocks(postsContainer);

    const postsList = document.getElementById("author-posts-list");
    if (recentPosts.length === 0) {
      postsList.innerHTML = "<p class='no-posts'>No hay publicaciones registradas para este autor.</p>";
      return;
    }

    appendPostCards(postsList, recentPosts, { showAuthor: false });
  }

  // Página de un tag (?tag=kvm): su descripción y sus posts
  function renderTagPage(tagSlug) {
    setLayout();

    const slug = slugify(tagSlug);
    const tagInfo = allTags.find((t) => slugify(t.slug) === slug);
    const posts = postsWithTag(slug);
    if (!tagInfo && posts.length === 0) return renderNotFound(`tags/${tagSlug}`);

    const name = tagInfo ? tagInfo.nombre : slug;
    const description = tagInfo ? tagInfo.descripcion : "Sin descripción todavía.";

    setTitle(`#${name}`);
    postsContainer.innerHTML = terminalHTML({
      path: `~/tags/${slug}`,
      command: `cat ~/tags/${slug}.txt`,
      body: `
        <div class="tag-info">
          <div class="tag-info-name">#${esc(name)}</div>
          <p class="tag-info-desc">${esc(description)}</p>
          <span class="tag-info-count">${posts.length} ${posts.length === 1 ? "post" : "posts"}</span>
        </div>
        ${promptLineHTML(`ls -lt ~/posts --tag=${slug}`)}
        <div class="ls" id="tag-posts-list"></div>
      `,
    });

    const list = document.getElementById("tag-posts-list");
    if (posts.length === 0) {
      list.innerHTML = "<p class='no-posts'>Todavía no hay publicaciones con este tag.</p>";
      return;
    }
    appendPostCards(list, posts, { showAuthor: true });
  }

  // Índice de tags (?tags): todos los tags con su número de posts
  function renderTagsIndex() {
    setLayout();
    setTitle("Tags");

    // Tags de tags.json + los que usan los posts aunque no estén descritos
    const known = new Map(allTags.map((t) => [slugify(t.slug), t]));
    allPosts.forEach((p) => (p.tags || []).forEach((t) => {
      if (!known.has(slugify(t))) known.set(slugify(t), { slug: slugify(t), nombre: t, descripcion: "" });
    }));

    const tags = [...known.entries()]
      .map(([slug, t]) => ({ slug, nombre: t.nombre, descripcion: t.descripcion, count: postsWithTag(slug).length }))
      .sort((a, b) => b.count - a.count || a.nombre.localeCompare(b.nombre));

    postsContainer.innerHTML = terminalHTML({
      path: "~/tags",
      command: "ls -l ~/tags",
      body: `
        <div class="tags-grid">
          ${tags.map((t) => `
            <a class="tag-tile${t.count === 0 ? " is-empty" : ""}" href="?tag=${encodeURIComponent(t.slug)}">
              <span class="tag-tile-name">#${esc(t.nombre)}</span>
              <span class="tag-tile-count">${t.count}</span>
              ${t.descripcion ? `<span class="tag-tile-desc">${esc(t.descripcion)}</span>` : ""}
            </a>
          `).join("")}
        </div>
      `,
    });
  }

  // 404 con estilo terminal (post, autor o página inexistente)
  function renderNotFound(invalidResource) {
    setLayout({ footer: false });
    setTitle("404");

    postsContainer.innerHTML = terminalHTML({
      path: "404",
      command: `cat ${invalidResource}.md`,
      afterCommand: `<div class="cmd-output error-line">cat: ${esc(invalidResource)}.md: No existe el fichero o el directorio</div>`,
      body: `
        <div class="terminal-error-box">
          <div class="terminal-error-title">404 <small>NOT FOUND</small></div>
          <p class="terminal-error-desc">
            No se encontró la ruta especificada en <code>migue-linux.com</code>.
          </p>
          <div class="callout">
            Vuelve al directorio principal con <a href="./">cd ~/posts</a>
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
    const trackingPage = route.post
      ? `post-${route.post}`
      : route.tag ? `tag-${route.tag}`
      : route.page ? `page-${route.page}` : (pathname || "home");

    fetch(`/api/tracker.php?page=${encodeURIComponent(trackingPage)}`)
      .then((response) => response.json())
      .then((data) => {
        if (data.status !== "success") return;
        const totalEl = document.getElementById("total-views");
        const pageEl = document.getElementById("page-views");
        if (totalEl) totalEl.textContent = Number(data.total_views).toLocaleString();
        if (pageEl) pageEl.textContent = Number(data.page_views).toLocaleString();
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
    if (route.tag) return renderTagPage(route.tag);
    if (route.tags) return renderTagsIndex();
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

    const [authors, pages, categories, tags, postsByMonth] = await Promise.all([
      loadJSON("data/authors.json"),
      loadJSON("data/pages.json"),
      loadJSON("data/categories.json"),
      loadJSON("data/tags.json"),
      postsPromise,
    ]);

    allAuthors = authors;
    allPages = pages;
    allTags = tags;
    allPosts = postsByMonth.flat();
    currentFilteredPosts = allPosts;

    renderPagesNav();
    renderCategories(categories);
    setupSearch();

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
