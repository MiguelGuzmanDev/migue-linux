document.addEventListener("DOMContentLoaded", async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const postSlugParam = urlParams.get('post');

    // 1. Cargar publicaciones desde data/posts_YYYY.json
    const allPosts = await loadAllPosts();

    if (postSlugParam) {
        // Modo lectura de post: busca por slug exacto (10002A-optimizacion-kernel)
        const currentPost = allPosts.find(p => 
            p.slug === postSlugParam || 
            p.slug.endsWith(`-${postSlugParam}`) ||
            p.id === postSlugParam
        );

        if (currentPost) {
            renderPostContent(currentPost);
            trackPageView(currentPost.slug);
        } else {
            renderNotFound();
        }
    } else {
        // Modo inicio / listado principal (ordenar por fecha descendente)
        allPosts.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
        renderPostsList(allPosts);
        trackPageView('home');
    }
});

// Cargar years.json y los posts por año correspondientes
async function loadAllPosts() {
    try {
        // Forzar recarga sin caché local agregando timestamp
        const cacheBuster = `?v=${Date.now()}`;
        
        const yearsResponse = await fetch(`data/years.json${cacheBuster}`);
        if (!yearsResponse.ok) {
            throw new Error(`HTTP ${yearsResponse.status} leyendo data/years.json`);
        }

        const years = await yearsResponse.json();

        // Cargar en paralelo todos los data/posts_YYYY.json
        const fetchPromises = years.map(async (yr) => {
            try {
                const res = await fetch(`data/posts_${yr}.json${cacheBuster}`);
                return res.ok ? await res.json() : [];
            } catch (err) {
                console.warn(`Error al leer data/posts_${yr}.json:`, err);
                return [];
            }
        });

        const results = await Promise.all(fetchPromises);
        return results.flat();
    } catch (error) {
        console.error("❌ [error] No se pudo cargar el índice de publicaciones:", error);
        return [];
    }
}

// Registrar métrica de vistas en api/tracker.php
function trackPageView(pageIdentifier) {
    fetch(`api/tracker.php?page=${encodeURIComponent(pageIdentifier)}`)
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                const totalEl = document.getElementById('total-views');
                const pageEl = document.getElementById('page-views');

                if (totalEl) totalEl.textContent = Number(data.total_views).toLocaleString();
                if (pageEl) pageEl.textContent = Number(data.page_views).toLocaleString();
            }
        })
        .catch(err => console.error("Error en tracker:", err));
}

// Renderizar lista en index.html
function renderPostsList(posts) {
    const container = document.getElementById('posts-container');
    if (!container) return;

    if (!posts || posts.length === 0) {
        container.innerHTML = '<p class="empty">No hay publicaciones disponibles.</p>';
        return;
    }

    container.innerHTML = posts.map(post => `
        <article class="post-card">
            <h2>
                <a href="?post=${post.slug}">$ cat ${post.slug}.md</a>
            </h2>
            <div class="post-meta">
                <span>[${post.fecha}]</span> | <span>${post.categoria}</span>
            </div>
            <p>${post.extracto}</p>
        </article>
    `).join('');
}

// Renderizar contenido del post individual
function renderPostContent(post) {
    const container = document.getElementById('posts-container');
    if (!container) return;

    fetch(post.file)
        .then(res => {
            if (!res.ok) throw new Error("Archivo Markdown no encontrado");
            return res.text();
        })
        .then(markdownText => {
            const cleanMarkdown = markdownText.replace(/^---\s*\n[\s\S]*?\n---\s*\n/, '');
            const htmlContent = typeof marked !== 'undefined' ? marked.parse(cleanMarkdown) : cleanMarkdown;

            container.innerHTML = `
                <article class="post-single">
                    <h1>${post.titulo}</h1>
                    <div class="post-meta">
                        <time>${post.fecha}</time> | <span>${post.categoria}</span>
                    </div>
                    <div class="post-body">${htmlContent}</div>
                    <a href="/" class="back-link">&larr; Volver al inicio</a>
                </article>
            `;
        })
        .catch(err => {
            console.error(err);
            renderNotFound();
        });
}

function renderNotFound() {
    const container = document.getElementById('posts-container');
    if (container) {
        container.innerHTML = `
            <div class="not-found">
                <h2>404 - Publicación no encontrada</h2>
                <p>El artículo solicitado no existe o fue movido.</p>
                <a href="/">&larr; Volver al inicio</a>
            </div>
        `;
    }
}