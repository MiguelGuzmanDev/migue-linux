document.addEventListener("DOMContentLoaded", () => {
    // 1. Obtener la ruta limpia de la URL (ej: '/blog/post-1' -> 'blog/post-1')
    let currentPage = window.location.pathname.replace(/^\/|\/$/g, '');
    if (!currentPage) {
        currentPage = 'home';
    }

    // 2. Enviar la ruta exacta al backend PHP
    fetch(`/api/tracker.php?page=${encodeURIComponent(currentPage)}`)
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                const totalEl = document.getElementById('total-views');
                const pageEl = document.getElementById('page-views');

                if (totalEl) totalEl.textContent = data.total_views.toLocaleString();
                if (pageEl) pageEl.textContent = data.page_views.toLocaleString();

                // Log descriptivo en consola del navegador
                if (!data.is_new_view) {
                    console.log(`Visita registrada en log, pero no sumada al contador (IP en enfriamiento de 1h para "${data.current_page}").`);
                }
            }
        })
        .catch(err => console.error("Error al registrar visita:", err));
});