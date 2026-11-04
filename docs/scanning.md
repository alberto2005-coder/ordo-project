# Escaneo y captura · Scanning and capture

[Español](#español) · [English](#english)

---

## Español

### Dos caminos para meter una página

1. **El escáner del sistema** (`src/services/scan.ts`, sobre `react-native-document-scanner-plugin`). Abre la interfaz de cámara del propio teléfono, que ya detecta bordes, recorta y aplana. Ordo pide las imágenes a calidad 90 y las copia a su carpeta privada. Como el recorte ya lo hizo el sistema, esas páginas no se vuelven a analizar.
2. **Fotos de la galería** (`src/services/gallery.ts`). Hasta **50** imágenes por tanda, en el orden en que se eligen, con barra de progreso. Aquí sí se busca la página en la foto, si el recorte automático está activo.

En los dos casos el archivo original se conserva siempre: los ajustes se aplican sobre una copia procesada, así que cualquier edit se puede deshacer.

### Modos de captura

`src/services/capture.ts` define cuatro modos y cada uno cambia el resultado:

| Modo | Qué hace |
|---|---|
| `doc` | Documento normal, con el filtro elegido. |
| `receipt` | Recibo: fuerza el filtro `enhanced`, que es el que mejor saca texto claro sobre papel arrugado. |
| `book` | Foto de dos páginas abiertas: se parte en dos páginas. Siempre `enhanced`. |
| `id` | Carné: dos fotos (delante y detrás) y una sola hoja compuesta. |

### Detección de la página

`src/image/detectPage.ts` trabaja sobre una copia reducida a 320 px de lado, para que sea rápido en un móvil:

1. Pasa a escala de grises.
2. Aplica un desenfoque de caja con sumas acumuladas.
3. Calcula el umbral con el método de Otsu (separa papel de fondo sin fijar un valor a mano).
4. Busca el cuadrilátero convexo más grande que quede por encima del umbral y comprueba que tenga área suficiente.

Las cuatro esquinas se guardan normalizadas (0 a 1) en `pages.crop_corners`, y `src/image/warp.ts` las usa para la corrección de perspectiva. Si no hay un cuadrilátero convincente, no se recorta nada: mejor una página torcida que una página cortada por la mitad.

El recorte automático está **activado por defecto** (`settings.auto_crop`), y se puede desactivar en ajustes.

### Filtros y ajustes

Cuatro filtros, guardados en `pages.filter`: `original`, `enhanced`, `bw` (blanco y negro de alto contraste) y `gray`. Además cada página guarda `rotation` (0, 90, 180 o 270), `brightness` y `contrast` entre -1 y 1, y las esquinas del recorte.

`src/services/render.ts` aplica todo eso y deja el resultado en disco; el original nunca se toca.

### Modo libro

`src/image/book.ts` busca el pliegue: recorre las columnas del centro de la imagen, toma la **mediana** de brillo de cada columna (la mediana ignora las letras, que son minoría), la suaviza y elige la banda vertical más oscura, que es la sombra del lomo. Si no hay sombra clara, corta por el centro exacto. Después parte el lienzo en dos imágenes, cada una guardada como página aparte.

Antes de partir, la foto se reduce si pasa de 2400 px de lado.

### Carné de identidad

Se piden dos capturas (delante y detrás). `src/image/idCard.ts` compone una sola hoja con las dos, escaladas y alineadas, para que el documento final sea una página y no dos.

### PDF a páginas

`src/services/pdfImport.ts` convierte un PDF elegido en la galería de archivos en imágenes:

- Máximo **100 páginas** y **64 MB** por archivo; por encima se rechaza antes de tocar el lector nativo.
- Cada página se rasteriza a 1600 px de ancho y calidad 90.
- **El texto del PDF no se conserva**: las páginas entran como imágenes, igual que un escaneo. Si se necesita el texto, hay que pasar el OCR.
- Un PDF protegido con contraseña se rechaza con un mensaje propio: la app no pide contraseñas de archivos ajenos.

### OCR

`src/services/ocr.ts` usa Google ML Kit en el dispositivo, sin red. Idiomas disponibles: latino (por defecto), chino, japonés, coreano y devanagari. **Árabe y cirílico no están cubiertos**.

El texto se guarda por página (`pages.ocr_text`) y se concatena en `documents.ocr_text` para que la búsqueda de la biblioteca lo encuentre. Si el reconocimiento falla, la app devuelve un fallo y la página queda como estaba: nunca se pierde una imagen por un error de OCR.

### Límites conocidos

- El escáner del sistema lo pone el fabricante: en algunos teléfonos la interfaz o la calidad cambian.
- La detección puede fallar con poco contraste (papel blanco sobre mesa blanca). Para eso está el recorte manual en el editor de página.
- La corrección de perspectiva asume que la página es un cuadrilátero: una hoja muy curvada no se aplana del todo.

---

## English

### Two ways to get a page in

1. **The system scanner** (`src/services/scan.ts`, over `react-native-document-scanner-plugin`). It opens the phone's own camera UI, which already detects edges, crops and flattens. Ordo asks for quality 90 and copies the images into its private folder. Since the system already cropped them, those pages are not analysed again.
2. **Photos from the gallery** (`src/services/gallery.ts`). Up to **50** images per batch, in the order picked, with a progress indicator. Here the page is looked for in the photo, when automatic cropping is on.

In both cases the original file is always kept: edits are applied to a processed copy, so any change can be undone.

### Capture modes

`src/services/capture.ts` defines four modes, each changing the result:

| Mode | What it does |
|---|---|
| `doc` | Ordinary document, with the chosen filter. |
| `receipt` | Receipt: forces the `enhanced` filter, the one that lifts light text off creased paper best. |
| `book` | Photo of two open pages: split into two pages. Always `enhanced`. |
| `id` | ID card: two photos (front and back) composed onto a single sheet. |

### Page detection

`src/image/detectPage.ts` works on a copy reduced to 320 px on the long side, to stay fast on a phone:

1. Convert to greyscale.
2. Blur with a box filter using running sums.
3. Pick the threshold with Otsu's method (separates paper from background without a hand-set value).
4. Find the largest convex quadrilateral above the threshold and check it has enough area.

The four corners are stored normalised (0 to 1) in `pages.crop_corners`, and `src/image/warp.ts` uses them for perspective correction. If no convincing quadrilateral is found, nothing is cropped: a crooked page beats a page cut in half.

Automatic cropping is **on by default** (`settings.auto_crop`) and can be switched off in settings.

### Filters and adjustments

Four filters, stored in `pages.filter`: `original`, `enhanced`, `bw` (high-contrast black and white) and `gray`. Each page also stores `rotation` (0, 90, 180 or 270), `brightness` and `contrast` between -1 and 1, and the crop corners.

`src/services/render.ts` applies all of it and writes the result to disk; the original is never touched.

### Book mode

`src/image/book.ts` looks for the fold: it walks the columns near the centre, takes the **median** brightness of each column (the median ignores letters, which are a minority), smooths it and picks the darkest vertical band, which is the shadow in the gutter. With no clear shadow it cuts at the exact centre. The canvas is then split into two images, each stored as its own page.

Before splitting, the photo is shrunk if it is larger than 2400 px on the long side.

### ID card

Two captures are requested (front and back). `src/image/idCard.ts` composes a single sheet with both, scaled and aligned, so the final document is one page instead of two.

### PDF to pages

`src/services/pdfImport.ts` turns a PDF picked from the file browser into images:

- At most **100 pages** and **64 MB** per file; beyond that it is refused before touching the native reader.
- Each page is rasterised at 1600 px wide and quality 90.
- **The PDF's text is not kept**: pages come in as images, just like a scan. If the text is needed, run OCR.
- A password-protected PDF is refused with its own message: the app does not ask for passwords of other people's files.

### OCR

`src/services/ocr.ts` uses Google ML Kit on device, with no network. Available scripts: Latin (default), Chinese, Japanese, Korean and Devanagari. **Arabic and Cyrillic are not covered**.

Text is stored per page (`pages.ocr_text`) and concatenated into `documents.ocr_text` so the library search finds it. If recognition fails, the app reports a failure and the page stays as it was: an OCR error never loses an image.

### Known limits

- The system scanner comes from the manufacturer: on some phones the UI or the quality differ.
- Detection can fail with little contrast (white paper on a white desk). That is what manual cropping in the page editor is for.
- Perspective correction assumes the page is a quadrilateral: a strongly curved sheet is not fully flattened.
