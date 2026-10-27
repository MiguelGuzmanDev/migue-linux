#!/usr/bin/env bash
#
# Genera los índices JSON que lee app.js a partir de los posts en Markdown:
#   data/posts_YYYY-MM.json  -> posts de cada mes (más reciente primero)
#   data/months.json         -> lista de meses disponibles
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
import json
import os
import re
import sys

POSTS_DIR = "posts"
DATA_DIR = "data"

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
        fm = parse_front_matter(f.read())

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
    }
    if author:
        entry["author"] = author

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

total = sum(len(p) for p in posts_by_month.values())
print(f"\n📦 {total} posts en {len(months)} meses, {len(warnings)} aviso(s).")
EOF

echo "✨ Build completado."
