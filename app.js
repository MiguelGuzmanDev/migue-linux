document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('content');

  fetch('./data/posts.json')
    .then(res => res.json())
    .then(posts => {
      const params = new URLSearchParams(window.location.search);
      const activeSlug = params.get('post');

      if (activeSlug) {
        const post = posts.find(p => p.slug === activeSlug);
        if (post) {
          loadAndRenderMarkdown(container, post);
          return;
        }
      }

      renderPostList(container, posts);
    })
    .catch(err => {
      container.innerHTML = '<p class="post-meta">[error] No se pudo cargar el índice de publicaciones.</p>';
      console.error(err);
    });
});

function renderPostList(container, posts) {
  container.innerHTML = posts.map(post => `
    <article class="post-card">
      <div class="post-meta">
        [${post.fecha}] ${post.tags.map(t => `<span class="tag">#${t}</span>`).join('')}
      </div>
      <h2 class="post-title">
        <a href="?post=${post.slug}">$ cat ${post.slug}.md</a>
      </h2>
      <p class="post-excerpt">${post.extracto}</p>
    </article>
  `).join('');
}

function loadAndRenderMarkdown(container, post) {
  // Cargar el archivo .md
  fetch(`./${post.file}`)
    .then(res => {
      if (!res.ok) throw new Error('Archivo Markdown no encontrado');
      return res.text();
    })
    .then(markdownText => {
      // Parsear el Markdown a HTML usando marked.js
      const htmlContent = marked.parse(markdownText);

      container.innerHTML = `
        <article>
          <div class="post-meta" style="margin-bottom: 1.5rem;">
            <a href="./" style="color: var(--accent); text-decoration: none;">← /home/sysadmin</a>
            <br><br>
            FILE: <strong>${post.file}</strong> | DATE: ${post.fecha}
          </div>
          <div style="margin-bottom: 1rem;">
            ${post.tags.map(t => `<span class="tag">#${t}</span>`).join('')}
          </div>
          <hr style="border: 0; border-top: 1px solid var(--border); margin-bottom: 1.5rem;">
          <div class="post-body">
            ${htmlContent}
          </div>
        </article>
      `;
    })
    .catch(err => {
      container.innerHTML = `<p class="post-meta">[error] No se pudo leer el archivo ${post.file}</p>`;
      console.error(err);
    });
}