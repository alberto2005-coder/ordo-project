# Modelo de datos · Data model

[Español](#español) · [English](#english)

---

## Español

### Dónde viven los datos

Todo está en el teléfono, en dos sitios:

- **Base de datos SQLite** (`ordo.db`), abierta por `src/data/expoDb.ts` con `journal_mode = wal`.
- **Imágenes**, en la carpeta privada de la app: `Paths.document/scans/<uuid>.<ext>`. La base de datos guarda rutas, no los bytes.

La `extensionOf()` de `src/services/files.ts` decide la extensión mirando los primeros bytes, no el nombre que traiga el sistema: una foto puede llegar como PNG, HEIC, WebP o GIF aunque se llame `.jpg`.

### Tablas

| Tabla | Para qué |
|---|---|
| `folders` | Carpetas con `parent_id` (un solo nivel de anidamiento), nombre único entre hermanas y `locked`. |
| `documents` | Documento: título, carpeta, `locked`, `ocr_text` (texto de todas las páginas, para buscar) y `deleted_at` para la papelera. |
| `pages` | Una fila por página: `original_path`, `processed_path`, esquinas del recorte, filtro, rotación y ajustes de brillo y contraste. `unique (document_id, position)`. |
| `annotations` | Trazos, resaltados, texto y firmas de una página, en JSON con coordenadas normalizadas. |
| `signature_strokes` | Firmas guardadas para reutilizar. |
| `tags`, `document_tags` | Etiquetas y su relación con documentos. |
| `settings` | Una sola fila (`id = 1`) con los ajustes. |

Restricciones que hacen trabajo real: `check (position >= 0)`, `filter in ('original','enhanced','bw','gray')`, `rotation in (0,90,180,270)`, `brightness`/`contrast` entre -1 y 1, y `on delete cascade` en páginas y anotaciones para que borrar un documento no deje huérfanos.

### Migraciones

`src/data/schema.ts` es la fuente de verdad: `SCHEMA_SQL` crea la base desde cero y cada `MIGRATION_n` es un escalón. `src/data/db.ts` lee `pragma user_version` y aplica los escalones que falten, uno por transacción, subiendo la versión al final de cada uno.

Versión actual: **4**. La 2 añadió el indicador de primera vez y cambió las firmas a trazos vectoriales; la 3 añadió papelera y opciones de PDF; la 4 añadió el recorte automático.

Para cambiar el esquema: se edita `schema.ts`, se añade `MIGRATION_5` y se sube `SCHEMA_VERSION`. Nunca se edita una migración ya publicada: hay teléfonos que ya la aplicaron.

### Papelera

Borrar un documento pone `deleted_at`; no toca el disco. `src/data/trash.ts` se encarga del resto:

- `purgeOld()` borra definitivamente lo que lleve más de **30 días** en la papelera. Se ejecuta al arrancar la app.
- Al purgar se borran las filas y después los archivos que ya no referencia ninguna página (`unreferenced()` en `library.ts`).
- Restaurar solo limpia `deleted_at`. Si la carpeta se borró mientras el documento estaba en la papelera, la clave foránea ya dejó `folder_id` en nulo y el documento vuelve a la raíz.

### Carpetas y bloqueos

Las carpetas van un nivel: una carpeta puede estar en la raíz o dentro de otra, no más. Un nombre repetido entre hermanas se rechaza. Borrar una carpeta **no borra documentos**: se suben a la raíz.

El bloqueo se hereda: `isDocumentLocked()` en `src/data/folders.ts` devuelve verdadero si el documento está bloqueado o si lo está la carpeta que lo contiene.

### Búsqueda

`listDocuments()` busca en el título siempre, y en el texto OCR solo si el documento no está bloqueado. El patrón escapa `%`, `_` y `\` para que buscar `50%` busque ese texto y no todo.

### Respaldo

`src/backup/backup.ts` escribe un ZIP con `data.json` (carpetas, documentos, páginas, anotaciones, etiquetas y firmas) y las imágenes como `files/1.jpg`, `files/2.jpg`… Se escriben de una en una para no cargar el teléfono de memoria.

Qué **no** entra en el respaldo, a propósito:

- La papelera.
- Los documentos bloqueados y los que están en carpetas bloqueadas.
- Los ajustes y el PIN (el PIN vive en el llavero del sistema, no en la base de datos).

La razón del segundo punto: el respaldo no lleva el PIN, así que un documento bloqueado saldría del teléfono sin la protección que lo tapa.

Al restaurar, todo entra con identificadores nuevos, así que nada de lo que ya hay en el teléfono se sobrescribe. Un respaldo se puede editar a mano, por eso los valores fuera de rango se reparan en vez de abortar: un filtro desconocido pasa a `original`, una rotación rara a 0, un brillo de 40 a 1. Una anotación dañada se salta y se sigue.

Límites al leer un respaldo: **64 MB** para `data.json`, **32 MB** por imagen, **1 GB** en total y **20 000** entradas. Un archivo pequeño no puede llenar el teléfono.

---

## English

### Where the data lives

Everything is on the phone, in two places:

- **SQLite database** (`ordo.db`), opened by `src/data/expoDb.ts` with `journal_mode = wal`.
- **Images**, in the app's private folder: `Paths.document/scans/<uuid>.<ext>`. The database stores paths, not bytes.

`extensionOf()` in `src/services/files.ts` picks the extension from the first bytes, not from the name the system hands over: a photo may arrive as PNG, HEIC, WebP or GIF while being called `.jpg`.

### Tables

| Table | Purpose |
|---|---|
| `folders` | Folders with `parent_id` (a single nesting level), unique name among siblings, and `locked`. |
| `documents` | Document: title, folder, `locked`, `ocr_text` (all page text, for search) and `deleted_at` for the trash. |
| `pages` | One row per page: `original_path`, `processed_path`, crop corners, filter, rotation and brightness/contrast. `unique (document_id, position)`. |
| `annotations` | Strokes, highlights, text and signatures for a page, as JSON with normalised coordinates. |
| `signature_strokes` | Saved signatures for reuse. |
| `tags`, `document_tags` | Tags and their link to documents. |
| `settings` | A single row (`id = 1`) holding settings. |

Constraints that do real work: `check (position >= 0)`, `filter in ('original','enhanced','bw','gray')`, `rotation in (0,90,180,270)`, `brightness`/`contrast` between -1 and 1, and `on delete cascade` on pages and annotations so deleting a document leaves no orphans.

### Migrations

`src/data/schema.ts` is the source of truth: `SCHEMA_SQL` creates the database from scratch and each `MIGRATION_n` is one step. `src/data/db.ts` reads `pragma user_version` and applies the missing steps, one transaction each, bumping the version at the end of every step.

Current version: **4**. Step 2 added the first-run flag and moved signatures to vector strokes; step 3 added the trash and PDF options; step 4 added automatic cropping.

To change the schema: edit `schema.ts`, add `MIGRATION_5` and raise `SCHEMA_VERSION`. Never edit an already published migration: some phones have applied it.

### Trash

Deleting a document sets `deleted_at`; the disk is untouched. `src/data/trash.ts` handles the rest:

- `purgeOld()` permanently deletes anything in the trash for more than **30 days**. It runs at app start.
- Purging deletes the rows and then the files no page references any more (`unreferenced()` in `library.ts`).
- Restoring only clears `deleted_at`. If the folder was deleted while the document was in the trash, the foreign key already set `folder_id` to null and the document returns to the root.

### Folders and locks

Folders go one level deep: a folder sits either at the root or inside another, never deeper. A duplicate name among siblings is rejected. Deleting a folder **does not delete documents**: they move back to the root.

Locks are inherited: `isDocumentLocked()` in `src/data/folders.ts` returns true when the document is locked or the folder holding it is.

### Search

`listDocuments()` always searches the title, and searches OCR text only when the document is not locked. The pattern escapes `%`, `_` and `\` so searching for `50%` looks for that text instead of matching everything.

### Backup

`src/backup/backup.ts` writes a ZIP with `data.json` (folders, documents, pages, annotations, tags and signatures) plus images as `files/1.jpg`, `files/2.jpg`… Files are written one at a time to keep memory low.

What is **not** in the backup, on purpose:

- The trash.
- Locked documents and documents inside locked folders.
- Settings and the PIN (the PIN lives in the system keychain, not the database).

The reason for the second item: the backup carries no PIN, so a locked document would leave the phone without the protection covering it.

On restore everything gets new identifiers, so nothing already on the phone is overwritten. A backup can be edited by hand, which is why out-of-range values are repaired instead of aborting: an unknown filter becomes `original`, an odd rotation 0, a brightness of 40 becomes 1. A damaged annotation is skipped and the restore continues.

Caps when reading a backup: **64 MB** for `data.json`, **32 MB** per image, **1 GB** in total and **20,000** entries. A small file cannot fill the phone.
