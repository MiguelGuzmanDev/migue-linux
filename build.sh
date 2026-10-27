#!/usr/bin/env bash
#
# Genera los índices JSON que lee app.js a partir de los posts en Markdown:
#   data/posts_YYYY-MM.json  -> posts de cada mes (más reciente primero)
#   data/months.json         -> lista de meses disponibles
#
# Y lo necesario para SEO y redes sociales:
#   p/<slug>.html            -> una página por post con título, descripción e imagen
#   feed.xml                 -> feed RSS con los últimos posts
#   sitemap.xml, robots.txt  -> para buscadores
#
# También revisa el contenido y avisa de problemas:
#   - posts sin Front Matter, sin id, sin fecha o con id duplicado
#   - categorías que no existen en data/categories.json
#   - autores que no existen en data/authors.json
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

def reading_minutes(content):
    body = re.sub(r"^---\s*\n.*?\n---\s*\n", "", content.replace("\r\n", "\n"), count=1, flags=re.DOTALL)
    return max(1, round(len(body.split()) / WORDS_PER_MINUTE))

if not os.path.isdir(POSTS_DIR):
    print(f"❌ El directorio '{POSTS_DIR}' no existe.")
    sys.exit(1)

categories = {c["nombre"].lower() for c in load_json(f"{DATA_DIR}/categories.json", [])}
categories |= {c["slug"].lower() for c in load_json(f"{DATA_DIR}/categories.json", [])}
authors = {a["id"] for a in load_json(f"{DATA_DIR}/authors.json", [])}

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
    if fm.get("imagen"):
        entry["imagen"] = fm["imagen"].lstrip("./")
        if not os.path.isfile(entry["imagen"]):
            warn(f"{path}: la imagen '{fm['imagen']}' no existe")

    posts_by_month.setdefault(fecha[:7], []).append(entry)

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
    return f"{SITE_URL}/{path}"

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
