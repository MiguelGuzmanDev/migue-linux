#!/usr/bin/env bash

POSTS_DIR="posts"
OUTPUT_FILE="data/posts.json"

if ! command -v python3 &> /dev/null; then
    echo "❌ Python3 no está disponible."
    exit 1
fi

mkdir -p data

echo "🔍 Procesando entradas en '$POSTS_DIR'..."

python3 - << 'EOF'
import os
import re
import json

posts_dir = "posts"
output_file = "data/posts.json"

# 1. Cargar JSON previo si existe
existing_posts = []
if os.path.exists(output_file):
    try:
        with open(output_file, 'r', encoding='utf-8') as f:
            existing_posts = json.load(f)
    except Exception:
        existing_posts = []

# Mapear IDs existentes para búsqueda rápida
existing_ids = {str(post.get('id')) for post in existing_posts if 'id' in post}
new_entries = []

if os.path.exists(posts_dir):
    for filename in sorted(os.listdir(posts_dir)):
        if not filename.endswith('.md'):
            continue
        
        filepath = os.path.join(posts_dir, filename)
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()

        # Extraer Frontmatter
        match = re.search(r'^---\s*\n(.*?)\n---', content, re.DOTALL)
        if not match:
            print(f"⚠️  [OMITIDO] '{filename}' no tiene un Frontmatter YAML válido.")
            continue

        frontmatter_text = match.group(1)
        data = {}
        
        # Parsea clave-valor básica
        for line in frontmatter_text.splitlines():
            if ':' in line:
                key, val = line.split(':', 1)
                key = key.strip()
                val = val.strip().strip('"').strip("'")
                
                # Manejo simple de tags en formato JSON/YAML inline
                if key == 'tags':
                    try:
                        val = json.loads(val)
                    except Exception:
                        val = [t.strip().strip('"').strip("'") for t in val.strip('[]').split(',') if t.strip()]
                
                data[key] = val

        post_id = str(data.get('id', '')).strip()

        if not post_id:
            print(f"⚠️️  [OMITIDO] '{filename}' no define un campo 'id'.")
            continue

        if post_id in existing_ids:
            print(f"ℹ️  [YA EXISTE] ID '{post_id}' ({filename}) ya está registrado.")
            continue

        # Estructurar entrada
        entry = {
            "id": post_id,
            "slug": data.get('slug', ''),
            "type": "post",
            "titulo": data.get('titulo', ''),
            "fecha": data.get('fecha', ''),
            "categoria": data.get('categoria', ''),
            "tags": data.get('tags', []),
            "extracto": data.get('extracto', ''),
            "file": filepath
        }

        new_entries.append(entry)
        existing_ids.add(post_id)
        print(f"✔  [ACOPLADO] ID: {post_id} - {entry['titulo']}")

# Unir previos con nuevos y ordenar por fecha descendente
all_posts = existing_posts + new_entries
all_posts.sort(key=lambda x: str(x.get('fecha', '')), reverse=True)

with open(output_file, 'w', encoding='utf-8') as f:
    json.dump(all_posts, f, ensure_ascii=False, indent=2)

print("--------------------------------------------------")
print(f"🚀 Proceso finalizado. Total acumulado en '{output_file}': {len(all_posts)}")
EOF