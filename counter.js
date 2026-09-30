document.addEventListener("DOMContentLoaded", () => {
    // 1. Obtener la variable 'post' de la URL (?post=...)
    const urlParams = new URLSearchParams(window.location.search);
    const postSlug = urlParams.get('post');

    // Si existe el parámetro post lo usa, de lo contrario asigna 'home'
    const currentPage = postSlug ? postSlug.trim() : 'home';

    // 2. Enviar el identificador a tracker.php
    fetch(`/api/tracker.php?page=${encodeURIComponent(currentPage)}`)
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                const totalEl = document.getElementById('total-views');
                const pageEl = document.getElementById('page-views');

                if (totalEl) totalEl.textContent = data.total_views.toLocaleString();
                if (pageEl) pageEl.textContent = data.page_views.toLocaleString();
            }
        })
        .catch(err => console.error("Error al registrar visita:", err));
});