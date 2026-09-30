document.addEventListener("DOMContentLoaded", async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const postSlug = urlParams.get('post');

    // 1. Cargar las publicaciones desde data/posts_YYYY.json
    const allPosts = await loadAllPosts();

    if (postSlug) {
        // Modo Lectura de Artículo
        const currentPost = allPosts.find(p => p.slug === postSlug);
        
        if (currentPost) {
            renderPostContent(currentPost);
            trackPageView(currentPost.slug);
        } else {
            renderNotFound();
        }
    } else {
        // Modo Inicio / Lista de Posts
        renderPostsList(allPosts);
        trackPageView('home');
    }
});

// Cargar years.json y luego descargar todos los posts_YYYY.json
async function loadAllPosts() {
    try {
        const yearsResponse = await fetch('/data/years.json');
        if (!yearsResponse.ok) throw new Error("No se pudo obtener data/years.json");
        
        const years = await yearsResponse.json();

        // Cargar todos los archivos de años en paralelo
        const fetchPromises = years.map(yr => 
            fetch(`/data/posts_${yr}.json`)
                .then(res => res.ok ? res.json() : [])
                .catch(() => [])
        );

        const results = await Promise.all(fetchPromises);
        
        # Aplanar todos los arrays en uno solo
        return results.flat();
    } catch (error) {
        console.error("Error cargando índice de posts:", error);
        return [];
    }
}

// Función para registrar la vista en api/tracker.php
function trackPageView(pageIdentifier) {
    fetch(`/api/tracker.php?page=${encodeURIComponent(pageIdentifier)}`)
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

// Renderizar la lista principal de entradas
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
                <!-- Usar post.slug para garantizar que leve el ID delante (ej: 10002A-optimizacion-kernel) -->
                <a href="?post=${post.slug}">$ cat ${post.slug}.md</a>
            </h2>
            <div class="post-meta">
                <span>[${post.fecha}]</span> | <span>${post.categoria}</span>
            </div>
            <p>${post.extracto}</p>
        </article>
    `).join('');
}

// Renderizar el contenido Markdown de un post específico
function renderPostContent(post) {
    const container = document.getElementById('posts-container');
    if (!container) return;

    fetch(`/${post.file}`)
        .then(res => {
            if (!res.ok) throw new Error("Archivo Markdown no encontrado");
            return res.text();
        })
        .then(markdownText => {
            // Eliminar el front matter YAML antes de convertir a HTML
            const cleanMarkdown = markdownText.replace(/^---\s*\n[\s\S]*?\n---\s*\n/, '');
            
            // Si usas marked.js para renderizar Markdown:
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