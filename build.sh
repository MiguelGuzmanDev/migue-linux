#!/usr/bin/env bash

# Configuración de directorios
POSTS_DIR="posts"
DATA_DIR="data"

# Asegurar que existe el directorio de datos
mkdir -p "$DATA_DIR"

# Limpiar archivos de años previos en data/ para reescribirlos limpios
rm -f "$DATA_DIR"/posts_*.json
rm -f "$DATA_DIR"/years.json

echo "🚀 Iniciando compilación del índice de posts..."

python3 - << 'EOF'
import os
import json
import re

posts_dir = "posts"
data_dir = "data"

if not os.path.exists(posts_dir):
    print(f"❌ El directorio '{posts_dir}' no existe.")
    exit(1)

# Diccionario para agrupar entradas por año: {"2026": [...], "2025": [...]}
posts_by_year = {}
seen_ids = set()

for filename in os.listdir(posts_dir):
    if filename.endswith(".md"):
        filepath = os.path.join(posts_dir, filename)
        
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()

        # Extraer Front Matter tipo YAML entre ---
        match = re.match(r'^---\s*\n(.*?)\n---\s*\n', content, re.DOTALL)
        if not match:
            print(f"⚠️  [OMITIDO] '{filename}' no tiene un encabezado Front Matter válido.")
            continue

        front_matter = match.group(1)
        data = {}

        # Parsear clave-valor simple
        for line in front_matter.splitlines():
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            if ':' in line:
                key, val = line.split(':', 1)
                key = key.strip()
                val = val.strip().strip('"').strip("'")
                
                # Saneamiento especial para arrays simples como tags: [linux, kernel]
                if val.startswith('[') and val.endswith(']'):
                    items = val[1:-1].split(',')
                    data[key] = [i.strip().strip('"').strip("'") for i in items if i.strip()]
                else:
                    data[key] = val

        post_id = str(data.get('id', '')).strip()
        raw_slug = str(data.get('slug', '')).strip()
        fecha = str(data.get('fecha', '')).strip()

        if not post_id:
            print(f"⚠️  [OMITIDO] '{filename}' no tiene ID.")
            continue

        if post_id in seen_ids:
            print(f"⚠️  [DUPLICADO OMITIDO] ID '{post_id}' en '{filename}' ya fue procesado.")
            continue

        seen_ids.add(post_id)

        # Determinar el año del post
        year = fecha.split('-')[0] if '-' in fecha else "sin_fecha"

        # Formatear el slug como ID-slug (ejemplo: 10002A-optimizacion-kernel)
        unique_slug = f"{post_id}-{raw_slug}" if raw_slug else f"post-{post_id}"

        entry = {
            "id": post_id,
            "slug": unique_slug,  # <-- AQUÍ: antes decía raw_slug
            "type": data.get('type', 'post'),
            "titulo": data.get('titulo', ''),
            "fecha": fecha,
            "categoria": data.get('categoria', ''),
            "tags": data.get('tags', []),
            "extracto": data.get('extracto', ''),
            "file": f"{posts_dir}/{filename}"
        }

        if year not in posts_by_year:
            posts_by_year[year] = []
            
        posts_by_year[year].append(entry)

# Escribir los JSON por año y ordenar por fecha descendente
all_years = sorted(list(posts_by_year.keys()), reverse=True)

for yr in all_years:
    # Ordenar los posts dentro de cada año por fecha más reciente primero
    posts_by_year[yr].sort(key=lambda x: x.get('fecha', ''), reverse=True)
    
    out_file = os.path.join(data_dir, f"posts_{yr}.json")
    with open(out_file, 'w', encoding='utf-8') as f:
        json.dump(posts_by_year[yr], f, ensure_ascii=False, indent=2)
    print(f"✅ Generado: {out_file} ({len(posts_by_year[yr])} posts)")

# Guardar un archivo con la lista de años disponibles
with open(os.path.join(data_dir, "years.json"), 'w', encoding='utf-8') as f:
    json.dump(all_years, f, ensure_ascii=False, indent=2)

print(f"✅ Generado: {data_dir}/years.json -> {all_years}")
EOF

echo "✨ Proceso de build completado con éxito."