# Pruebas · Testing

[Español](#español) · [English](#english)

---

## Español

### Cómo se ejecutan

```bash
npm test          # vitest run
npm run typecheck # tsc --noEmit
```

Las dos cosas se pueden lanzar sin emulador y sin Android SDK: las pruebas corren en Node.

### Qué se prueba y qué no

Se prueba la **lógica pura**: SQL, píxeles, PDF, ZIP, PIN. No se prueban las pantallas ni los módulos nativos.

La pieza que lo hace posible es `test/sqljsDb.ts`: implementa la misma interfaz `Db` que `src/data/expoDb.ts`, pero sobre `sql.js`. El SQL que se ejecuta en las pruebas es el mismo que se ejecuta en el teléfono.

Lo que queda fuera, y se comprueba a mano en un dispositivo: la cámara, el escáner del sistema, ML Kit, los permisos de Android, la hoja de compartir y la interfaz.

### Suites

| Archivo | Qué cubre |
|---|---|
| `library.test.ts` | Documentos, páginas, ajustes, búsqueda con comodines escapados. |
| `dataOps.test.ts` | Borrar, mover, renombrar y mantener coherentes las posiciones. |
| `reorder.test.ts` | Reordenar páginas con `(document_id, position)` único. |
| `trash.test.ts` | Papelera: enviar, restaurar, purgar y los 30 días. |
| `backup.test.ts` | Escribir y leer el ZIP, topes, reparación de valores y rechazos. |
| `security.test.ts` | PIN: hash, salt, longitud, bloqueo progresivo y comparación. |
| `detectPage.test.ts` | Detección de la página en una foto. |
| `warp.test.ts` | Perspectiva, convexidad y área del cuadrilátero. |
| `book.test.ts` | Localización del pliegue en una doble página. |
| `idCard.test.ts` | Composición de las dos caras en una hoja. |
| `filters.test.ts` | Filtros de imagen y ajustes de brillo y contraste. |
| `png.test.ts` | Codificación PNG sin pérdida. |
| `text.test.ts` | Texto sobre imagen y recorte de caracteres problemáticos. |
| `annotateRender.test.ts` | Dibujo de anotaciones sobre píxeles. |
| `hitTest.test.ts` | Qué anotación está bajo el dedo. |
| `pdf.test.ts` | Construcción del PDF, tamaños, márgenes y páginas. |
| `pdfLayout.test.ts` | Colocación de la imagen, orientación y numeración. |
| `pdfEncrypt.test.ts` | Cifrado AES-256 y permisos del PDF. |
| `exportFiles.test.ts` | Nombres de archivo, ZIP y salidas de imagen. |
| `officeExport.test.ts` | DOCX, XLSX y PPTX: estructura y contenido. |
| `i18n.test.ts` | Que español e inglés tengan las mismas claves. |

### Cómo añadir una prueba

1. El archivo va en `test/`, con el nombre del módulo y `.test.ts`.
2. Si necesita base de datos, se usa el adaptador de `test/sqljsDb.ts`.
3. Si necesita un archivo de entrada, va en `test/fixtures/`.
4. Nada de mocks de React Native: si el código que se quiere probar importa un módulo nativo, es señal de que esa parte debería estar en `src/services/` y la lógica en un módulo puro.

La prueba de internacionalización es la red de seguridad de la carpeta `docs` y de los textos: si se añade una clave en un idioma y no en el otro, falla.

---

## English

### How to run them

```bash
npm test          # vitest run
npm run typecheck # tsc --noEmit
```

Both run without an emulator and without the Android SDK: the tests execute in Node.

### What is tested and what is not

**Pure logic** is tested: SQL, pixels, PDF, ZIP, PIN. Screens and native modules are not.

The piece that makes this possible is `test/sqljsDb.ts`: it implements the same `Db` interface as `src/data/expoDb.ts`, but over `sql.js`. The SQL running in tests is the SQL running on the phone.

Left out, and checked by hand on a device: the camera, the system scanner, ML Kit, Android permissions, the share sheet and the UI.

### Suites

| File | What it covers |
|---|---|
| `library.test.ts` | Documents, pages, settings, search with escaped wildcards. |
| `dataOps.test.ts` | Deleting, moving, renaming and keeping positions consistent. |
| `reorder.test.ts` | Reordering pages under the unique `(document_id, position)`. |
| `trash.test.ts` | Trash: send, restore, purge and the 30 days. |
| `backup.test.ts` | Writing and reading the ZIP, caps, value repair and refusals. |
| `security.test.ts` | PIN: hash, salt, length, progressive lockout and comparison. |
| `detectPage.test.ts` | Finding the page in a photo. |
| `warp.test.ts` | Perspective, convexity and quadrilateral area. |
| `book.test.ts` | Locating the gutter in a two-page spread. |
| `idCard.test.ts` | Composing both card sides onto one sheet. |
| `filters.test.ts` | Image filters and brightness/contrast adjustments. |
| `png.test.ts` | Lossless PNG encoding. |
| `text.test.ts` | Text drawn on images and stripping problematic characters. |
| `annotateRender.test.ts` | Drawing annotations onto pixels. |
| `hitTest.test.ts` | Which annotation is under the finger. |
| `pdf.test.ts` | PDF building, sizes, margins and pages. |
| `pdfLayout.test.ts` | Image placement, orientation and numbering. |
| `pdfEncrypt.test.ts` | AES-256 encryption and PDF permissions. |
| `exportFiles.test.ts` | File names, ZIP and image outputs. |
| `officeExport.test.ts` | DOCX, XLSX and PPTX: structure and content. |
| `i18n.test.ts` | Spanish and English having the same keys. |

### Adding a test

1. The file goes in `test/`, named after the module, ending in `.test.ts`.
2. If it needs a database, use the adapter in `test/sqljsDb.ts`.
3. If it needs an input file, put it in `test/fixtures/`.
4. No React Native mocks: if the code under test imports a native module, that is a sign the native part belongs in `src/services/` and the logic in a pure module.

The internationalisation test is the safety net for the `docs` folder and the strings: adding a key in one language but not the other makes it fail.
