// Inicialización única al cargar la página
document.addEventListener("DOMContentLoaded", async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const postSlugParam = urlParams.get('post');

    // 1. Cargar todas las publicaciones de los índices por año
    const allPosts = await loadAllPosts();

    if (postSlugParam) {
        // Modo Lectura de Artículo (soporta slug completo 10002A-slug o slug corto)
        const currentPost = allPosts.find(p => p.slug === postSlugParam || p.slug.endsWith(`-${postSlugParam}`));
        if (currentPost) {
            renderPostContent(currentPost);
            trackPageView(currentPost.slug);
        } else {
            renderNotFound();
        }
    } else {
        // Modo Inicio / Listado Principal (ordenar más recientes primero)
        allPosts.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
        renderPostsList(allPosts);
        trackPageView('home');
    }
});

// Función para cargar todos los posts desde los archivos anuales (data/posts_YYYY.json)
async function loadAllPosts() {
    try {
        // Cargar años usando ruta relativa
        const yearsResponse = await fetch('data/years.json');
        if (!yearsResponse.ok) {
            console.error("❌ No se encontró data/years.json. Estado HTTP:", yearsResponse.status);
            return [];
        }
        
        const years = await yearsResponse.json();
        console.log("📅 Años detectados:", years);

        // Cargar cada archivo posts_YYYY.json
        const fetchPromises = years.map(async yr => {
            try {
                const res = await fetch(`data/posts_${yr}.json`);
                if (!res.ok) {
                    console.warn(`⚠️ No se pudo cargar data/posts_${yr}.json`);
                    return [];
                }
                return await res.json();
            } catch (err) {
                console.error(`❌ Error leyendo data/posts_${yr}.json:`, err);
                return [];
            }
        });

        const results = await Promise.all(fetchPromises);
        const mergedPosts = results.flat();
        
        console.log("✅ Total de posts cargados:", mergedPosts.length, mergedPosts);
        return mergedPosts;
    } catch (error) {
        console.error("❌ Error crítico en loadAllPosts:", error);
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