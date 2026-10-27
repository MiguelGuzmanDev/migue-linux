# Cómo agregar un autor

JSON no permite comentarios, así que la guía vive aquí.

## 1. Agrega el autor a `data/authors.json`

Copia este bloque dentro de la lista (separado del anterior con una coma):

```json
{
  "id": "nuevo-autor",
  "title": "Co-autor",
  "name": "Nombre Completo",
  "description": "Bio corta que aparece al final de cada post y en su perfil.",
  "link": "?author=nuevo-autor",
  "avatar": "assets/img/authors/nuevo-autor.jpg",
  "profile": "nuevo-autor.md"
}
```

| Campo | Para qué sirve |
|---|---|
| `id` | Identificador único. Es el que se usa en los posts y en la URL `?author=`. Solo minúsculas y guiones. |
| `title` | Rol que aparece arriba del nombre (por ejemplo "The author", "Co-autor"). |
| `name` | Nombre visible. |
| `description` | Bio corta. |
| `link` | A dónde lleva "Más sobre…". Normalmente `?author=<id>`. |
| `avatar` | Foto. Usa una ruta relativa (`assets/img/authors/...`) para que funcione en local y en producción. Si se omite, se usa `default.avif`. |
| `profile` | (Opcional) Archivo Markdown con la bio larga, dentro de `data/authors/`. |

## 2. Agrega su foto

Guárdala en `assets/img/authors/<id>.jpg` (cuadrada, unos 256x256 px).

## 3. (Opcional) Bio larga

Crea `data/authors/<id>.md` con lo que quieras mostrar en su perfil (`?author=<id>`).

## 4. Asigna posts al autor

En el Front Matter del post agrega la línea `author`:

```markdown
---
id: 120A
titulo: Mi post
fecha: 2026-11-01
categoria: sysadmin
author: nuevo-autor
---
```

Los posts sin `author` se asignan a `miguel-guzman`.

## 5. Corre el build

```bash
./build.sh
```

Si el `author` de algún post no existe en `authors.json`, el build te avisa.
