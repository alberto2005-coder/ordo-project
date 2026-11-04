# Exportación · Export

[Español](#español) · [English](#english)

---

## Español

### Formatos

| Formato | Contenido | Notas |
|---|---|---|
| **PDF** | Una imagen por página, con las anotaciones dibujadas en vector encima. | El formato principal. Admite contraseña. |
| **DOCX** | El texto reconocido, un párrafo por línea y salto de página entre páginas. | Es texto, no una copia del aspecto de la página. |
| **XLSX** | Una hoja por página; columnas separadas por tabuladores o por dos o más espacios. | Los números se guardan como números. |
| **PPTX** | Una diapositiva por página con la imagen. | Imágenes, no texto editable. |
| **ZIP** | Las imágenes de las páginas, o varios documentos en PDF. | Con un solo archivo no se comprime: se entrega suelto. |
| **JPG / PNG** | Las imágenes de las páginas, con las anotaciones ya pintadas. | PNG es sin pérdida. |

Todo sale por la hoja de compartir del sistema (`expo-sharing`) o por la impresión (`expo-print`), nunca por red.

### Opciones del PDF

- **Tamaño**: A4, Carta o "ajustar a la imagen" (la página mide lo que la imagen, sin márgenes vacíos).
- **Orientación**: automática (horizontal si la imagen es más ancha que alta), vertical u horizontal. Se ignora en "ajustar".
- **Margen**: ninguno, pequeño (18 puntos) o normal (36 puntos). Si se piden números de página, se reserva un margen pequeño aunque el margen elegido sea ninguno, para que el número no pise la imagen.
- **Números de página**: `n / total` al pie.
- **Marca de agua**: texto en diagonal, tenue, sobre cada página.
- **Contraseña**: cifra el archivo con **AES-256** y cierra también la copia de texto y la modificación.

El PDF se marca con `Producer` y `Creator` "Ordo" y lleva el título del documento. La librería no estampa sus propias fechas ni su nombre (`updateMetadata: false`).

Sobre el cifrado: la contraseña de propietario es aleatoria y se descarta al terminar. Eso significa que **ni la app puede levantar las restricciones** del archivo; solo la contraseña del usuario lo abre. Las restricciones de copia son las del estándar PDF, no DRM.

### Calidad

`QUALITY_PRESETS` en `src/pdf/buildPdf.ts`:

| Nivel | Lado mayor | Calidad JPEG |
|---|---|---|
| `low` | 1280 px | 0.55 |
| `medium` | 1920 px | 0.75 |
| `high` | sin reescalar | el original, tal cual |

Al reducir se respeta la proporción por el lado largo, así que una página vertical se encoge, no se deforma. En `high` el archivo se copia sin recomprimir.

### Anotaciones

- En **PDF** se dibujan como vectores sobre la imagen: se pueden ampliar sin pixelarse.
- En **JPG, PNG y PPTX** se queman en los píxeles.
- El texto escrito con tipografía necesita la fuente empaquetada. Si no carga, ese texto se omite y se informa del número de elementos saltados; nunca se rompe la exportación por una fuente.

### Varios documentos

Desde `tools` se pueden exportar varios documentos a la vez: cada uno como PDF y todo dentro de un ZIP. En las imágenes, un documento de una sola página se entrega como archivo suelto y uno de varias páginas como ZIP.

### Archivos temporales

Las exportaciones se escriben en la caché (`cache/exports`) y se borran **al volver a la app** desde la hoja de compartir. También se vacían al arrancar. Un archivo compartido sigue existiendo donde el usuario lo haya guardado, pero la copia de trabajo no se queda en el teléfono.

### Límites

- El nombre del archivo se limpia de caracteres prohibidos y se corta a 80 caracteres; si queda vacío, se usa "Ordo".
- Los nombres dentro de un ZIP se hacen únicos: `factura (2).pdf` antes que sobrescribir.
- Las exportaciones no se pueden reanudar: si se cierra la app a mitad, se empieza de nuevo.

---

## English

### Formats

| Format | Content | Notes |
|---|---|---|
| **PDF** | One image per page, with annotations drawn as vectors on top. | The main format. Supports a password. |
| **DOCX** | The recognised text, one paragraph per line and a page break between pages. | It is text, not a copy of the page layout. |
| **XLSX** | One sheet per page; columns split at tabs or at two or more spaces. | Plain numbers are stored as numbers. |
| **PPTX** | One slide per page holding the image. | Pictures, not editable text. |
| **ZIP** | The page images, or several documents as PDFs. | With a single file nothing is zipped: it is handed over loose. |
| **JPG / PNG** | The page images with annotations already painted in. | PNG is lossless. |

Everything leaves through the system share sheet (`expo-sharing`) or printing (`expo-print`), never over the network.

### PDF options

- **Size**: A4, Letter, or "fit the image" (the page is the image size, with no empty margins).
- **Orientation**: automatic (landscape when the image is wider than tall), portrait or landscape. Ignored for "fit".
- **Margin**: none, small (18 points) or normal (36 points). With page numbers enabled a small margin is reserved even when none was chosen, so the number does not sit on the image.
- **Page numbers**: `n / total` at the bottom.
- **Watermark**: faint diagonal text over every page.
- **Password**: encrypts the file with **AES-256** and also closes text copying and modification.

The PDF is stamped with `Producer` and `Creator` "Ordo" and carries the document title. The library does not add its own dates or name (`updateMetadata: false`).

About the encryption: the owner password is random and discarded once the file is written. That means **not even the app can lift the file's restrictions**; only the user's password opens it. The copy restrictions are the PDF standard ones, not DRM.

### Quality

`QUALITY_PRESETS` in `src/pdf/buildPdf.ts`:

| Level | Long side | JPEG quality |
|---|---|---|
| `low` | 1280 px | 0.55 |
| `medium` | 1920 px | 0.75 |
| `high` | not resized | the original, untouched |

Downscaling keeps the aspect ratio by the long side, so a tall page shrinks instead of stretching. At `high` the file is copied without recompression.

### Annotations

- In **PDF** they are drawn as vectors over the image: they stay sharp when zoomed.
- In **JPG, PNG and PPTX** they are burned into the pixels.
- Typed text needs the bundled font. If it fails to load, that text is left out and the number of skipped items is reported; an export never breaks because of a font.

### Several documents

From `tools` several documents can be exported at once: each as a PDF, all inside one ZIP. For images, a single-page document is delivered as a loose file and a multi-page one as a ZIP.

### Temporary files

Exports are written to the cache (`cache/exports`) and deleted **when the person returns to the app** from the share sheet. They are also cleared at startup. A shared file still exists wherever the user saved it, but the working copy does not stay on the phone.

### Limits

- The file name is cleaned of forbidden characters and cut at 80 characters; if nothing is left, "Ordo" is used.
- Names inside a ZIP are made unique: `invoice (2).pdf` rather than overwriting.
- Exports cannot be resumed: closing the app halfway means starting again.
