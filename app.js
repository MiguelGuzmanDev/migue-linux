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
  fetch(`./${post.file}`)
    .then(res => {
      if (!res.ok) throw new Error('Archivo Markdown no encontrado');
      return res.text();
    })
    .then(markdownText => {
      
      // Personalizamos el renderizado de bloques de código en marked
      const renderer = new marked.Renderer();
      renderer.code = function({ text, lang }) {
        const language = lang || 'bash';
        // Escapamos comillas dobles y caracteres especiales para evitar romper el HTML
        const safeText = text.replace(/"/g, '&quot;');
        
        return `
          <div class="code-block">
            <div class="code-header">
              <span class="code-lang">${language}</span>
              <button class="copy-btn" onclick="copyCode(this)">Copiar</button>
            </div>
            <pre><code class="language-${language}">${text}</code></pre>
          </div>
        `;
      };

      // Le decimos a marked que use nuestro renderer personalizado
      const htmlContent = marked.parse(markdownText, { renderer });

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

// Función global para copiar el texto al portapapeles
function copyCode(button) {
  const codeBlock = button.closest('.code-block').querySelector('code');
  const textToCopy = codeBlock.innerText;

  navigator.clipboard.writeText(textToCopy).then(() => {
    button.innerText = '¡Copiado!';
    button.classList.add('copied');
    
    setTimeout(() => {
      button.innerText = 'Copiar';
      button.classList.remove('copied');
    }, 2000);
  }).catch(err => {
    console.error('Error al copiar: ', err);
  });
}