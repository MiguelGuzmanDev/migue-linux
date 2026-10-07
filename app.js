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

  let allAuthors = [];

  // Cargar autores
  fetch("data/authors.json")
    .then((res) => res.json())
    .then((authors) => {
      allAuthors = authors;
    })
    .catch((err) => console.error("Error cargando authors.json:", err));

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

  // 3. Cargar publicaciones (data/months.json) y Router Principal
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

      // Evaluar la URL (Routing SPA)
      const urlParams = new URLSearchParams(window.location.search);
      const pageSlug = urlParams.get("page");
      const postSlug = urlParams.get("post");
      const authorSlug = urlParams.get("author");
      const authorprofile = urlParams.get("profile");

      if (postSlug) {
        renderSinglePost(postSlug);
      } else if (pageSlug) {
        renderStaticPage(pageSlug);
      } else if (authorSlug) {
        await renderAuthorPage(authorSlug);
      } else {
        renderPosts(currentFilteredPosts);
      }

      updateActiveNav();
    })
    .catch((err) => {
      console.error("Error al cargar las publicaciones:", err);
      postsContainer.innerHTML = "<p>Error al cargar las publicaciones.</p>";
    });

  function renderAuthorPage(authorSlug) {
    const blogHeader = document.getElementById('blog-header');
    const cliFooter = document.querySelector('.cli-footer');

    if (blogHeader) blogHeader.style.display = 'none';
    if (categoriesBar) categoriesBar.style.display = 'none';
    if (cliFooter) cliFooter.style.display = 'block';

    postsContainer.innerHTML = "";
    paginationContainer.innerHTML = "";

    // 1. Buscar los datos del autor
    const authorInfo = allAuthors.find((a) => a.id === authorSlug);

    if (!authorInfo) {
      postsContainer.innerHTML = `
        <div class="terminal-page-wrapper">
          <div class="terminal-command-line">
            <span class="prompt-user">miguelguzman@Oaxaqueando</span>:<span class="prompt-path">~#</span> 
            <span class="prompt-cmd">finger ${authorSlug}</span>
          </div>
          <div class="status-err" style="padding: 1.5rem; color: #ff7b72;">
            [ERR_404] User/Author not found: ${authorSlug}
          </div>
        </div>
      `;
      return;
    }

    // Fallbacks de datos
    const name = authorInfo.name || 'Autor';
    const title = authorInfo.title || 'SysAdmin & Contribuidor';
    const avatar = authorInfo.avatar || 'https://migue-linux.com/assets/img/authors/default.avif';
    const description = authorInfo.description || 'Sin biografía disponible.';

    // 2. Intentar cargar el archivo Markdown extendido del autor
    let authorMarkdownHTML = "";
    try {
      const mdResponse = await fetch(`data/authors/${authorprofile}`);
      if (mdResponse.ok) {
        const mdText = await mdResponse.text();
        // Usar 'marked.parse' o la librería de Markdown que tengas en el proyecto
        authorMarkdownHTML = typeof marked !== 'undefined' ? marked.parse(mdText) : `<pre>${mdText}</pre>`;
      }
    } catch (err) {
      console.warn(`No se pudo cargar el archivo extendido data/authors/${authorprofile}`, err);
    }

    // 2. Filtrar publicaciones escritas por el autor y tomar solo las últimas 5
    const allAuthorPosts = allPosts.filter(
      (post) => (post.author || "miguel-guzman") === authorSlug
    );
    const recentPosts = allAuthorPosts.slice(0, 5);

    // 3. Header estilo comando 'finger' de UNIX
    const authorProfileHTML = `
      <div class="terminal-page-wrapper" style="margin-bottom: 2rem;">
        <div class="terminal-topbar">
          <div class="terminal-dots">
            <span class="dot red"></span>
            <span class="dot yellow"></span>
            <span class="dot green"></span>
          </div>
          <span class="terminal-filename">bash — finger ${authorSlug}</span>
        </div>
        <div class="terminal-command-line">
          <span class="prompt-user">miguelguzman@Oaxaqueando</span>:<span class="prompt-path">~#</span> 
          <span class="prompt-cmd">finger ${authorSlug}</span>
        </div>
        
        <div class="author-terminal-card">
          <div class="author-card-main">
            <div class="author-avatar">
              <img src="${avatar}" alt="${name}">
            </div>
            <div class="author-details">
              <div class="author-field"><span class="field-label">Login:</span> <span class="field-value">${authorSlug}</span></div>
              <div class="author-field"><span class="field-label">Name:</span> <span class="field-value font-bold">${name}</span></div>
              <div class="author-field"><span class="field-label">Role:</span> <span class="field-value highlight">${title}</span></div>
              <div class="author-field"><span class="field-label">Host:</span> <span class="field-value">migue-linux.com</span></div>
            </div>
          </div>
          
          <div class="author-bio-section">
            <span class="field-label">> Bio / System Plan:</span>
            <p class="author-bio-text">${description}</p>
          </div>
        </div>
      </div>

      <h3 class="author-posts-title">
        > Últimas ${recentPosts.length} publicaciones de ${name} ${allAuthorPosts.length > 5 ? `<span class="posts-count">(${allAuthorPosts.length} en total)</span>` : ''}:
      </h3>
    `;

    postsContainer.innerHTML = authorProfileHTML;

    if (recentPosts.length === 0) {
      postsContainer.innerHTML += "<p class='no-posts'>No hay publicaciones registradas para este autor.</p>";
      return;
    }

    // 4. Renderizar solo las últimas 5 tarjetas
    recentPosts.forEach((post) => {
      const article = document.createElement("article");
      article.className = "post-card";

      const tagsHTML = post.tags && post.tags.length > 0
        ? `<div class="post-tags">${post.tags.map((t) => `<span class="tag">#${t}</span>`).join(" ")}</div>`
        : "";

      const fileName = post.file.split("/").pop();
      const postSlug = post.slug || fileName.replace(/\.md$/, "");

      article.innerHTML = `
        <h2><a href="?post=${postSlug}">cat ${fileName}</a></h2>
        <p class="post-extract">${post.extracto}</p>
        <div class="post-meta">
          ${tagsHTML}
          <span class="post-date">${post.fecha}</span>
        </div>
      `;

      postsContainer.appendChild(article);
    });
  }

  function getAuthorCardHTML(authorId) {
    const author = allAuthors.find((a) => a.id === authorId) || allAuthors.find((a) => a.id === 'miguel-guzman');

    if (!author) return '';

    const authorTitle = author.title || author.Title || 'El autor';
    const authorAvatar = author.avatar || 'https://migue-linux.com/assets/img/authors/default.avif';

    return `
      <div class="author-card">
        <div class="author-card-header">
          <div class="author-avatar">
            <img src="${authorAvatar}" alt="${author.name}">
          </div>
          
          <div class="author-info">
            <span class="author-label">${authorTitle}</span>
            <h4 class="author-name">${author.name}</h4>
          </div>
        </div>

        <div class="author-bio">
          <p>${author.description}</p>
        </div>

        <div class="author-footer">
          <a href="${author.link || `?author=${author.id}`}" class="more-from-author">Más sobre ${author.name} &rarr;</a>
        </div>
      </div>
    `;
  }

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

    currentPage = 1;
    renderPosts(currentFilteredPosts);
  }

  function renderPosts(posts) {
    const blogHeader = document.getElementById('blog-header');
    const cliFooter = document.querySelector('.cli-footer');

    if (blogHeader) blogHeader.style.display = 'block';
    if (categoriesBar) categoriesBar.style.display = 'flex';
    if (cliFooter) cliFooter.style.display = 'block';

    postsContainer.innerHTML = "";

    if (posts.length === 0) {
      postsContainer.innerHTML = "<p class='no-posts'>No hay publicaciones en esta categoría.</p>";
      paginationContainer.innerHTML = "";
      return;
    }

    const startIndex = (currentPage - 1) * postsPerPage;
    const endIndex = startIndex + postsPerPage;
    const postsToShow = posts.slice(startIndex, endIndex);

    postsToShow.forEach((post) => {
      const article = document.createElement("article");
      article.className = "post-card";

      const tagsHTML = post.tags && post.tags.length > 0
        ? `<div class="post-tags">${post.tags.map((t) => `<span class="tag">#${t}</span>`).join(" ")}</div>`
        : "";

      const fileName = post.file.split("/").pop();
      const postSlug = post.slug || fileName.replace(/\.md$/, "");

      const authorId = post.author || "miguel-guzman";
      const authorInfo = allAuthors.find((a) => a.id === authorId);
      const authorName = authorInfo ? authorInfo.name : "Miguel Guzmán";
      const authorLink = authorInfo ? authorInfo.link : `?author=${authorId}`;

      article.innerHTML = `
        <h2><a href="?post=${postSlug}">cat ${fileName}</a></h2>
        <p class="post-extract">${post.extracto}</p>
        <div class="post-meta">
          ${tagsHTML}
          <span class="post-date">${post.fecha} de <a href="${authorLink}" class="author-link">${authorName}</a></span>
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

    const pageIndicator = document.createElement("span");
    pageIndicator.className = "pagination-info";
    pageIndicator.textContent = `Página ${currentPage} de ${totalPages}`;

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
    const blogHeader = document.getElementById('blog-header');
    if (blogHeader) blogHeader.style.display = 'none';
    if (categoriesBar) categoriesBar.style.display = 'none';
    if (paginationContainer) paginationContainer.innerHTML = '';

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
        
        const terminalHeaderHTML = `
          <div class="terminal-page-wrapper">
            <div class="terminal-topbar">
              <div class="terminal-dots">
                <span class="dot red"></span>
                <span class="dot yellow"></span>
                <span class="dot green"></span>
              </div>
              <span class="terminal-filename">bash — miguelguzman@Oaxaqueando: ~/${slug}.md</span>
            </div>
            <div class="terminal-command-line">
              <span class="prompt-user">miguelguzman@Oaxaqueando</span>:<span class="prompt-path">~#</span> 
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
              <span class="prompt-user">miguelguzman@Oaxaqueando</span>:<span class="prompt-path">~#</span> 
              <span class="prompt-cmd">cat ~/${slug}.md</span>
            </div>
            <div class="status-err" style="padding: 1.5rem;">
              [ERR_404] cat: ${slug}.md: No existe el fichero o el directorio
            </div>
          </div>
        `;
      });
  }

  function renderSinglePost(slug) {
    if (categoriesBar) categoriesBar.style.display = 'none';
    if (paginationContainer) paginationContainer.innerHTML = '';
    const blogHeader = document.getElementById('blog-header');
    if (blogHeader) blogHeader.style.display = 'none';

    // Buscar el post dentro del array de posts ya cargados (allPosts)
    const postInfo = allPosts.find(
      (p) => p.slug === slug || p.id === slug || (p.file && p.file.includes(slug))
    );

    if (!postInfo) {
      postsContainer.innerHTML = `
        <div class="terminal-page-wrapper">
          <div class="terminal-command-line">
            <span class="prompt-user">miguelguzman@Oaxaqueando</span>:<span class="prompt-path">~#</span> 
            <span class="prompt-cmd">cat posts/${slug}.md</span>
          </div>
          <div class="status-err" style="padding: 1.5rem; color: #ff7b72;">
            [ERR_404] No post found for slug: ${slug}
          </div>
        </div>
      `;
      return;
    }

    // Cargar el archivo .md indicado por postInfo.file
    fetch(postInfo.file)
      .then((res) => {
        if (!res.ok) throw new Error("File not found");
        return res.text();
      })
      .then((mdContent) => {
        let authorId = postInfo.author;
        if (!authorId) {
          const fmMatch = mdContent.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
          if (fmMatch) {
            const authorMatch = fmMatch[1].match(/(?:author|autor):\s*["']?([^"'\r\n]+)["']?/i);
            if (authorMatch) authorId = authorMatch[1].trim();
          }
        }
        authorId = authorId || "miguel-guzman";

        const cleanMd = mdContent.replace(/^---[\s\S]*?---\s*/, "");
        const authorCardHTML = getAuthorCardHTML(authorId);

        const terminalHTML = `
          <div class="terminal-page-wrapper">
            <div class="terminal-topbar">
              <div class="terminal-dots">
                <span class="dot red"></span>
                <span class="dot yellow"></span>
                <span class="dot green"></span>
              </div>
              <span class="terminal-filename">bash — 80x24</span>
            </div>
            <div class="terminal-command-line">
              <span class="prompt-user">miguelguzman@Oaxaqueando</span>:<span class="prompt-path">~#</span> 
              <span class="prompt-cmd">cat ${postInfo.file}</span>
            </div>
            <div class="static-page-content">
              ${marked.parse(cleanMd)}
              ${authorCardHTML}
            </div>
          </div>
        `;

        postsContainer.innerHTML = terminalHTML;
      })
      .catch((err) => {
        postsContainer.innerHTML = `
          <div class="terminal-page-wrapper">
            <div class="terminal-command-line">
              <span class="prompt-user">miguelguzman@Oaxaqueando</span>:<span class="prompt-path">~#</span> 
              <span class="prompt-cmd">cat ${postInfo.file}</span>
            </div>
            <div class="status-err" style="padding: 1.5rem; color: #ff7b72;">
              [ERR_404] No such file: ${postInfo.file}
            </div>
          </div>
        `;
      });
  }
  // Resaltar la página o sección activa en #pages-nav
  function updateActiveNav() {
    const urlParams = new URLSearchParams(window.location.search);
    const currentPage = urlParams.get("page");
    const currentPost = urlParams.get("post");
    const currentAuthor = urlParams.get("author");

    const navLinks = pagesNav.querySelectorAll("a");

    navLinks.forEach((link) => {
      link.classList.remove("active");

      const href = link.getAttribute("href");

      // Si estamos en un post, en la página de un autor, o en el feed principal (sin ?page=)
      if (currentPost || currentAuthor || (!currentPage && !currentPost && !currentAuthor)) {
        if (href === "./" || href.includes("page=blog")) {
          link.classList.add("active");
        }
      } else if (currentPage) {
        // Si estamos viendo una página estática como ?page=about
        if (href.includes(`page=${currentPage}`)) {
          link.classList.add("active");
        }
      }
    });
  }
});


