#!/usr/bin/env bash
#
# Genera los índices JSON que lee app.js a partir de los posts en Markdown:
#   data/posts_YYYY-MM.json  -> posts de cada mes (más reciente primero)
#   data/months.json         -> lista de meses disponibles
#
# Y lo necesario para SEO y redes sociales:
#   p/<slug>.html            -> una página por post con título, descripción e imagen
#   assets/img/posts/AAAA/MM/NNNN-<post>.png
#                            -> tarjeta para compartir, si el post no trae imagen
#   feed.xml                 -> feed RSS con los últimos posts
#   sitemap.xml, robots.txt  -> para buscadores
#
# También revisa el contenido y avisa de problemas:
#   - posts sin Front Matter, sin id, sin fecha o con id duplicado
#   - categorías que no existen en data/categories.json
#   - autores que no existen en data/authors.json
#   - tags que no están descritos en data/tags.json
#   - páginas de data/pages.json cuyo .md no existe
#
# Uso: ./build.sh

set -euo pipefail
cd "$(dirname "$0")"

echo "🚀 Generando índice de posts..."

python3 - << 'EOF'
import html
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from xml.sax.saxutils import escape as xml_escape

POSTS_DIR = "posts"
DATA_DIR = "data"
WORDS_PER_MINUTE = 200  # Igual que en app.js

SITE_URL = "https://migue-linux.com"
SITE_NAME = "MigueLinux.com"
SITE_DESCRIPTION = "Bitácora técnica de Miguel Guzmán sobre administración de sistemas Linux, SRE, DevOps, automatización y redes."
DEFAULT_IMAGE = "assets/img/og-default.png"
POST_IMAGES_DIR = "assets/img/posts"  # Tarjetas generadas: AAAA/MM/NNNN-<post>.png
CARD_VERSION = "1"                     # Súbelo si cambias el diseño, para regenerar todas
POSTS_PAGES_DIR = "p"
FEED_ITEMS = 20
TIMEZONE = timezone(timedelta(hours=-6))  # Hora del centro de México

warnings = []

def warn(msg):
    warnings.append(msg)
    print(f"⚠️  {msg}")

def load_json(path, fallback):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        warn(f"No existe {path}")
        return fallback

def write_json(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")

def parse_front_matter(content):
    """Devuelve el Front Matter (--- ... ---) como dict, o None si no hay."""
    match = re.match(r"^---\s*\n(.*?)\n---\s*\n", content.replace("\r\n", "\n"), re.DOTALL)
    if not match:
        return None

    data = {}
    for line in match.group(1).splitlines():
        line = line.strip()
        if not line or line.startswith("#") or ":" not in line:
            continue
        key, val = line.split(":", 1)
        key, val = key.strip(), val.strip().strip('"').strip("'")
        # Listas simples: tags: [linux, kernel] o ["linux", "kernel"]
        if val.startswith("[") and val.endswith("]"):
            data[key] = [i.strip().strip('"').strip("'") for i in val[1:-1].split(",") if i.strip()]
        else:
            data[key] = val
    return data

def first_image(content):
    """Ruta de la primera imagen ![...](ruta) del Markdown, ignorando bloques de código."""
    body = re.sub(r"```.*?```", "", content, flags=re.DOTALL)
    match = re.search(r"!\[[^\]]*\]\(\s*<?([^)\s>]+)", body)
    return match.group(1) if match else None

def resolve_image(src, md_path):
    """Convierte la ruta de la imagen en una ruta desde la raíz del sitio (o deja la URL)."""
    if src.startswith(("http://", "https://")):
        return src
    if src.startswith("/"):
        return src.lstrip("/")
    # Rutas relativas al .md (../assets/...) o a la raíz del sitio (assets/...)
    for base in (os.path.dirname(md_path), "."):
        candidate = os.path.normpath(os.path.join(base, src))
        if not candidate.startswith("..") and os.path.isfile(candidate):
            return candidate
    return os.path.normpath(src)

def reading_minutes(content):
    body = re.sub(r"^---\s*\n.*?\n---\s*\n", "", content.replace("\r\n", "\n"), count=1, flags=re.DOTALL)
    return max(1, round(len(body.split()) / WORDS_PER_MINUTE))

if not os.path.isdir(POSTS_DIR):
    print(f"❌ El directorio '{POSTS_DIR}' no existe.")
    sys.exit(1)

categories = {c["nombre"].lower() for c in load_json(f"{DATA_DIR}/categories.json", [])}
categories |= {c["slug"].lower() for c in load_json(f"{DATA_DIR}/categories.json", [])}
authors = {a["id"] for a in load_json(f"{DATA_DIR}/authors.json", [])}
known_tags = {t["slug"].lower() for t in load_json(f"{DATA_DIR}/tags.json", [])}

# ---------------------------------------------------------------------------
# 1. Leer posts
# ---------------------------------------------------------------------------
posts_by_month = {}
seen_ids = {}

for filename in sorted(os.listdir(POSTS_DIR)):
    if not filename.endswith(".md"):
        continue

    path = f"{POSTS_DIR}/{filename}"
    with open(path, encoding="utf-8") as f:
        content = f.read()
    fm = parse_front_matter(content)

    if fm is None:
        warn(f"[OMITIDO] {path}: no tiene Front Matter (--- ... ---)")
        continue

    post_id = str(fm.get("id", "")).strip()
    fecha = str(fm.get("fecha", "")).strip()

    if not post_id:
        warn(f"[OMITIDO] {path}: no tiene id")
        continue
    if post_id in seen_ids:
        warn(f"[OMITIDO] {path}: el id '{post_id}' ya lo usa {seen_ids[post_id]}")
        continue
    if not re.match(r"^\d{4}-\d{2}-\d{2}$", fecha):
        warn(f"[OMITIDO] {path}: fecha '{fecha}' inválida (usa AAAA-MM-DD)")
        continue
    seen_ids[post_id] = path

    categoria = fm.get("categoria", "")
    if categoria and categoria.lower() not in categories:
        warn(f"{path}: la categoría '{categoria}' no está en {DATA_DIR}/categories.json")

    for tag in fm.get("tags", []):
        if tag.lower() not in known_tags:
            warn(f"{path}: el tag '{tag}' no está en {DATA_DIR}/tags.json (su página no tendrá descripción)")

    author = fm.get("author") or fm.get("autor")
    if author and author not in authors:
        warn(f"{path}: el autor '{author}' no está en {DATA_DIR}/authors.json")

    stem = filename[:-3]
    entry = {
        "id": post_id,
        "titulo": fm.get("titulo", ""),
        "fecha": fecha,
        "categoria": categoria,
        "extracto": fm.get("extracto", ""),
        "tags": fm.get("tags", []),
        "type": fm.get("type", "post"),
        # La URL del post es ?post=<id>-<nombre-del-archivo>
        "slug": f"{post_id}-{stem}",
        "file": path,
        "minutos": reading_minutes(content),
    }
    if author:
        entry["author"] = author
    # Imagen para compartir: `imagen:` del Front Matter o, si no hay, la primera del .md
    image = fm.get("imagen") or first_image(content)
    if image:
        image = resolve_image(image, path)
        if image and not image.startswith("http") and not os.path.isfile(image):
            warn(f"{path}: la imagen '{image}' no existe")
        elif image:
            entry["imagen"] = image

    posts_by_month.setdefault(fecha[:7], []).append(entry)

# ---------------------------------------------------------------------------
# 1b. Tarjetas para compartir (estilo WordPress: assets/img/posts/AAAA/MM/)
#     Solo para posts sin imagen. Requiere Pillow: sudo dnf install python3-pillow
# ---------------------------------------------------------------------------
try:
    from PIL import Image, ImageDraw, ImageFont, PngImagePlugin
except ImportError:
    Image = None

CARD_GENERATOR = "migue-linux build.sh"

def find_font(bold=False):
    pattern = "DejaVu Sans Mono:bold" if bold else "DejaVu Sans Mono"
    try:
        path = subprocess.run(["fc-match", "-f", "%{file}", pattern], capture_output=True, text=True).stdout
        if path and os.path.isfile(path):
            return path
    except FileNotFoundError:
        pass
    for path in ("/usr/share/fonts/dejavu-sans-mono-fonts/DejaVuSansMono" + ("-Bold" if bold else "") + ".ttf",
                 "/usr/share/fonts/truetype/dejavu/DejaVuSansMono" + ("-Bold" if bold else "") + ".ttf"):
        if os.path.isfile(path):
            return path
    return None

def load_font(size, bold=False):
    path = find_font(bold)
    return ImageFont.truetype(path, size) if path else ImageFont.load_default(size)

def wrap(draw, text, font, max_width):
    lines, line = [], ""
    for word in text.split():
        test = f"{line} {word}".strip()
        if draw.textlength(test, font=font) <= max_width:
            line = test
        else:
            if line:
                lines.append(line)
            line = word
    return lines + ([line] if line else [])

def card_signature(post):
    return json.dumps([CARD_VERSION, post["titulo"], post["fecha"], post["tags"], post["file"]], ensure_ascii=False)

def render_card(post, out_path):
    W, H = 1200, 630
    im = Image.new("RGB", (W, H), "#070c0a")
    d = ImageDraw.Draw(im)
    for x in range(0, W, 22):
        for y in range(0, H, 22):
            d.point((x, y), fill="#0f1d17")

    # Ventana de terminal
    d.rounded_rectangle((40, 40, W - 40, H - 40), radius=24, fill="#0d1311", outline="#1e2a26", width=2)
    d.line((40, 104, W - 40, 104), fill="#1e2a26", width=2)
    for i, color in enumerate(("#ff5f57", "#febc2e", "#28c840")):
        d.ellipse((72 + i * 30, 63, 90 + i * 30, 81), fill=color)
    d.rounded_rectangle((180, 56, W - 72, 88), radius=16, fill="#121a17", outline="#1e2a26")
    filename = os.path.basename(post["file"])
    d.text((200, 62), f"miguelguzman@Oaxaqueando: ~/posts/{filename}"[:80], font=load_font(18), fill="#7d8c86")

    # Comando
    prompt_font = load_font(26)
    d.text((88, 140), "~$ ", font=prompt_font, fill="#2ee07f")
    d.text((88 + d.textlength("~$ ", font=prompt_font), 140), f"cat {filename}"[:60], font=prompt_font, fill="#e3ebe7")

    # Título: lo más grande que quepa en 3 líneas
    for size in (64, 58, 52, 46, 40):
        title_font = load_font(size, bold=True)
        lines = wrap(d, post["titulo"], title_font, W - 176)
        if len(lines) <= 3:
            break
    lines = lines[:3]
    y = 200
    for line in lines:
        d.text((88, y), line, font=title_font, fill="#2ee07f")
        y += int(size * 1.2)

    # Tags y pie
    tags = "  ".join(f"#{t}" for t in post["tags"][:5])
    d.text((88, H - 150), tags, font=load_font(26), fill="#f0a548")
    d.text((88, H - 100), f"{post['fecha']}  ·  migue-linux.com", font=load_font(22), fill="#7d8c86")
    d.rectangle((W - 112, H - 104, W - 94, H - 74), fill="#2ee07f")

    meta = PngImagePlugin.PngInfo()
    meta.add_text("generator", CARD_GENERATOR)
    meta.add_text("card", card_signature(post))
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    im.save(out_path, pnginfo=meta, optimize=True)

def card_is_current(path, post):
    try:
        with Image.open(path) as im:
            return im.text.get("card") == card_signature(post)
    except (FileNotFoundError, OSError):
        return False

generated_cards = set()
cards_made = 0
for month, month_posts in posts_by_month.items():
    year, mm = month.split("-")
    # NNNN = número del post dentro del mes, del más antiguo al más reciente
    for number, post in enumerate(sorted(month_posts, key=lambda p: (p["fecha"], p["id"])), start=1):
        if "imagen" in post:
            continue
        card = f"{POST_IMAGES_DIR}/{year}/{mm}/{number:04d}-{os.path.basename(post['file'])[:-3]}.png"
        if Image is None:
            continue
        generated_cards.add(card)
        if not card_is_current(card, post):
            render_card(post, card)
            cards_made += 1
        post["imagen"] = card

if Image is None:
    warn("Pillow no está instalado: los posts sin imagen usarán la imagen por defecto (sudo dnf install python3-pillow)")
else:
    # Borra tarjetas generadas que ya no corresponden a ningún post (nunca toca tus imágenes)
    for root, _, files in os.walk(POST_IMAGES_DIR):
        for name in files:
            path = os.path.join(root, name)
            if not name.endswith(".png") or path in generated_cards:
                continue
            with Image.open(path) as im:
                generated = im.text.get("generator") == CARD_GENERATOR
            if generated:
                os.remove(path)
    print(f"✅ {POST_IMAGES_DIR}/ ({len(generated_cards)} tarjetas, {cards_made} nuevas o actualizadas)")

# ---------------------------------------------------------------------------
# 2. Escribir data/posts_YYYY-MM.json y data/months.json
# ---------------------------------------------------------------------------
for old in os.listdir(DATA_DIR):
    if re.match(r"^posts_.*\.json$", old):
        os.remove(f"{DATA_DIR}/{old}")

months = sorted(posts_by_month, reverse=True)
for month in months:
    posts = sorted(posts_by_month[month], key=lambda p: (p["fecha"], p["id"]), reverse=True)
    write_json(f"{DATA_DIR}/posts_{month}.json", posts)
    print(f"✅ {DATA_DIR}/posts_{month}.json ({len(posts)} posts)")

write_json(f"{DATA_DIR}/months.json", months)
print(f"✅ {DATA_DIR}/months.json -> {months}")

# ---------------------------------------------------------------------------
# 3. Revisar que las páginas estáticas existan
# ---------------------------------------------------------------------------
for page in load_json(f"{DATA_DIR}/pages.json", []):
    if page.get("slug") == "blog":
        continue  # ?page=blog muestra el listado de posts, no necesita .md
    if not os.path.isfile(page.get("file", "")):
        warn(f"La página '{page.get('slug')}' apunta a {page.get('file')}, que no existe (dará 404)")

# ---------------------------------------------------------------------------
# 4. Páginas por post (p/<slug>.html) para SEO y vistas previas en redes
# ---------------------------------------------------------------------------
all_posts = sorted(
    (p for month_posts in posts_by_month.values() for p in month_posts),
    key=lambda p: (p["fecha"], p["id"]),
    reverse=True,
)

def absolute(path):
    return path if path.startswith("http") else f"{SITE_URL}/{path}"

def post_url(post):
    return absolute(f"{POSTS_PAGES_DIR}/{post['slug']}.html")

def published(post):
    return datetime.strptime(post["fecha"], "%Y-%m-%d").replace(hour=12, tzinfo=TIMEZONE)

with open("index.html", encoding="utf-8") as f:
    template = f.read()

if "<!-- SEO:START" not in template or "<!-- CONTENT:START -->" not in template:
    print("❌ index.html no tiene los marcadores SEO:START/END y CONTENT:START/END.")
    sys.exit(1)

def render_post_page(post):
    e = lambda v: html.escape(str(v), quote=True)
    title = f"{post['titulo']} | MigueLinux"
    image = absolute(post.get("imagen") or DEFAULT_IMAGE)
    url = post_url(post)
    json_ld = json.dumps({
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        "headline": post["titulo"],
        "description": post["extracto"],
        "datePublished": published(post).isoformat(),
        "image": image,
        "url": url,
        "keywords": ", ".join(post["tags"]),
        "author": {"@type": "Person", "name": "Miguel Ángel Guzmán Pérez"},
    }, ensure_ascii=False).replace("</", "<\\/")

    seo = f"""<!-- SEO:START (generado por build.sh, no editar) -->
  <base href="../">
  <title>{e(title)}</title>
  <meta name="description" content="{e(post['extracto'])}">
  <link rel="canonical" href="{e(url)}">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="{e(SITE_NAME)}">
  <meta property="og:title" content="{e(post['titulo'])}">
  <meta property="og:description" content="{e(post['extracto'])}">
  <meta property="og:url" content="{e(url)}">
  <meta property="og:image" content="{e(image)}">
  <meta property="og:locale" content="es_MX">
  <meta property="article:published_time" content="{published(post).isoformat()}">
  <meta name="twitter:card" content="summary_large_image">
  <script type="application/ld+json">{json_ld}</script>
  <!-- SEO:END -->"""

    # Contenido mínimo para quien no ejecuta JavaScript (algunos bots); app.js lo reemplaza
    content = f"""<!-- CONTENT:START --><article class="view">
        <h1>{e(post['titulo'])}</h1>
        <p>{e(post['extracto'])}</p>
        <p><a href="{e(post['file'])}">{e(post['file'])}</a></p>
      </article><!-- CONTENT:END -->"""

    page = re.sub(r"<!-- SEO:START.*?<!-- SEO:END -->", lambda _: seo, template, count=1, flags=re.DOTALL)
    page = re.sub(r"<!-- CONTENT:START -->.*?<!-- CONTENT:END -->", lambda _: content, page, count=1, flags=re.DOTALL)
    page = page.replace("<body>", f'<body data-post="{e(post["slug"])}">', 1)
    return page

os.makedirs(POSTS_PAGES_DIR, exist_ok=True)
for old in os.listdir(POSTS_PAGES_DIR):
    if old.endswith(".html"):
        os.remove(f"{POSTS_PAGES_DIR}/{old}")

for post in all_posts:
    with open(f"{POSTS_PAGES_DIR}/{post['slug']}.html", "w", encoding="utf-8", newline="") as f:
        f.write(render_post_page(post))
print(f"✅ {POSTS_PAGES_DIR}/ ({len(all_posts)} páginas)")

# ---------------------------------------------------------------------------
# 5. Feed RSS (feed.xml)
# ---------------------------------------------------------------------------
def rfc822(dt):
    return dt.strftime("%a, %d %b %Y %H:%M:%S %z")

items = []
for post in all_posts[:FEED_ITEMS]:
    categories = "".join(f"\n      <category>{xml_escape(t)}</category>" for t in post["tags"])
    items.append(f"""    <item>
      <title>{xml_escape(post['titulo'])}</title>
      <link>{xml_escape(post_url(post))}</link>
      <guid isPermaLink="true">{xml_escape(post_url(post))}</guid>
      <pubDate>{rfc822(published(post))}</pubDate>
      <description>{xml_escape(post['extracto'])}</description>{categories}
    </item>""")

# La fecha del feed es la del post más reciente, así el archivo solo cambia cuando hay posts nuevos
last_build = rfc822(published(all_posts[0])) if all_posts else rfc822(datetime.now(TIMEZONE))
feed = f"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>{xml_escape(SITE_NAME)}</title>
    <link>{SITE_URL}/</link>
    <description>{xml_escape(SITE_DESCRIPTION)}</description>
    <language>es-MX</language>
    <lastBuildDate>{last_build}</lastBuildDate>
    <atom:link href="{SITE_URL}/feed.xml" rel="self" type="application/rss+xml"/>
{chr(10).join(items)}
  </channel>
</rss>
"""
with open("feed.xml", "w", encoding="utf-8") as f:
    f.write(feed)
print(f"✅ feed.xml ({len(items)} posts)")

# ---------------------------------------------------------------------------
# 6. sitemap.xml y robots.txt
# ---------------------------------------------------------------------------
urls = [(f"{SITE_URL}/", all_posts[0]["fecha"] if all_posts else None)]
for page in load_json(f"{DATA_DIR}/pages.json", []):
    if page.get("slug") != "blog" and os.path.isfile(page.get("file", "")):
        urls.append((f"{SITE_URL}/?page={page['slug']}", None))
urls.append((f"{SITE_URL}/?tags", None))
used_tags = sorted({t.lower() for p in all_posts for t in p["tags"]})
urls += [(f"{SITE_URL}/?tag={t}", None) for t in used_tags]
urls += [(post_url(p), p["fecha"]) for p in all_posts]

entries = []
for loc, lastmod in urls:
    mod = f"\n    <lastmod>{lastmod}</lastmod>" if lastmod else ""
    entries.append(f"  <url>\n    <loc>{xml_escape(loc)}</loc>{mod}\n  </url>")

with open("sitemap.xml", "w", encoding="utf-8") as f:
    f.write('<?xml version="1.0" encoding="UTF-8"?>\n'
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
            + "\n".join(entries) + "\n</urlset>\n")
print(f"✅ sitemap.xml ({len(urls)} URLs)")

with open("robots.txt", "w", encoding="utf-8") as f:
    f.write(f"User-agent: *\nDisallow: /logs/\nDisallow: /api/\n\nSitemap: {SITE_URL}/sitemap.xml\n")
print("✅ robots.txt")

total = sum(len(p) for p in posts_by_month.values())
print(f"\n📦 {total} posts en {len(months)} meses, {len(warnings)} aviso(s).")
EOF

echo "✨ Build completado."
