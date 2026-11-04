# Arquitectura · Architecture

[Español](#español) · [English](#english)

---

## Español

### Las tres capas

Ordo separa lo que habla con Android de lo que solo calcula. La razón es práctica: así la lógica se puede probar en Node, sin emulador.

1. **`app/` — pantallas.** Rutas de Expo Router. No contienen reglas de negocio: leen de la base de datos, llaman a un servicio y pintan. Si una pantalla empieza a tener lógica de dominio, esa lógica está en el sitio equivocado.
2. **`src/services/` — lo que toca el teléfono.** Cámara, escáner, galería, OCR, ficheros, biométría, compartir. Todo lo que depende de un módulo nativo vive aquí, y aquí se queda.
3. **`src/data`, `src/image`, `src/pdf`, `src/export`, `src/security`, `src/backup` — lógica pura.** JavaScript sin nada de React Native. Es lo que se prueba con `vitest`.

La frontera importa: `src/data/db.ts` define una interfaz `Db` mínima (`exec`, `run`, `all`, `first`, `transaction`). En el móvil la implementa `src/data/expoDb.ts` sobre `expo-sqlite`; en las pruebas la implementa `test/sqljsDb.ts` sobre `sql.js`. El mismo SQL corre en los dos sitios.

### Mapa de carpetas

```
app/                    rutas (Expo Router)
  (tabs)/index.tsx      biblioteca de documentos
  (tabs)/tools.tsx      combinar documentos, comprimir, exportar en lote
  (tabs)/settings.tsx   ajustes
  document/[id]/…       documento y sus páginas
  page/[id].tsx         edición de una página
  ocr/[id].tsx          texto reconocido
  annotate/[id].tsx     dibujo, texto, firma
  folder/[id].tsx       carpeta
  view/[id].tsx         visor a pantalla completa
  camera.tsx            captura
  export/[id].tsx       opciones de exportación
  backup.tsx            copia y restauración
  trash.tsx             papelera
  lock.tsx              PIN y biometría
  onboarding.tsx        primera vez
src/
  data/                 SQLite: esquema, migraciones, consultas
  services/             integración con Android/iOS
  image/                detección, perspectiva, filtros, libro, carné, PNG/JPEG
  pdf/                  construcción y dibujo del PDF
  export/               DOCX, XLSX, PPTX, ZIP
  security/             PIN (PBKDF2)
  backup/               escribir y leer el ZIP de respaldo
  state/                ajustes globales (zustand)
  i18n/                 textos es/en
  theme/                colores y tipografía
  components/           piezas de interfaz compartidas
plugins/                config plugins de Expo (permisos de release)
test/                   pruebas de vitest y adaptador sql.js
```

### Arranque

`app/_layout.tsx` hace, en este orden: carga los polyfills, abre la base de datos y aplica migraciones (`getDb`), vacía la papelera de más de 30 días, borra las copias temporales de exportaciones y previsualizaciones, y solo entonces pinta la app. Mientras no hay ajustes cargados muestra un indicador, no una pantalla vacía.

También escucha `AppState`: al volver del segundo plano se borran las exportaciones compartidas y se vuelve a bloquear todo lo que se había desbloqueado en la visita.

### Navegación

Un `Stack` raíz con las pantallas de detalle y un grupo `(tabs)` para las tres principales. No hay estado de navegación propio: la ruta lleva el id y cada pantalla vuelve a leer de la base de datos al recibir el foco (`useFocusEffect`). Eso evita listas desincronizadas después de editar.

### Estado

Zustand guarda muy poco a propósito: los ajustes y la bandera de "ya cargado" (`src/state/store.ts`). El resto de la app lee de SQLite cuando lo necesita. La razón es que la fuente de verdad es la base de datos, y duplicarla en memoria es la forma más fácil de acabar con dos verdades distintas.

### Idiomas y tema

`src/i18n/index.ts` expone `t()` y `useLang()`. Los textos están en `es.json` y `en.json`; los que Android e iOS muestran por su cuenta (permisos de cámara, Face ID) van en `src/i18n/native/`, enganchados desde `app.json` con `expo-localization`. El idioma por defecto es el del sistema.

El tema son tokens (`src/theme/tokens.ts`) con una elección `system | light | dark` guardada en ajustes. Los componentes leen colores por contexto, nunca constantes sueltas.

### Dónde va un archivo nuevo

- ¿Pinta algo? `app/` si es una pantalla, `src/components/` si es una pieza.
- ¿Llama a un módulo nativo? `src/services/`.
- ¿Calcula con bytes, píxeles o SQL? En `src/data`, `src/image`, `src/pdf`, `src/export` o `src/backup`, y con su prueba al lado.
- ¿Guarda un valor que debe sobrevivir al cierre? Columna nueva en `settings` más una migración.

---

## English

### The three layers

Ordo separates what talks to Android from what only computes. The reason is practical: the logic can then be tested in Node, with no emulator.

1. **`app/` — screens.** Expo Router routes. No business rules live here: they read from the database, call a service and render. If a screen starts holding domain logic, that logic is in the wrong place.
2. **`src/services/` — whatever touches the phone.** Camera, scanner, gallery, OCR, files, biometrics, sharing. Anything depending on a native module lives here and stays here.
3. **`src/data`, `src/image`, `src/pdf`, `src/export`, `src/security`, `src/backup` — pure logic.** Plain JavaScript with no React Native. This is what `vitest` covers.

The boundary matters: `src/data/db.ts` defines a minimal `Db` interface (`exec`, `run`, `all`, `first`, `transaction`). On the phone `src/data/expoDb.ts` implements it over `expo-sqlite`; in tests `test/sqljsDb.ts` implements it over `sql.js`. The same SQL runs in both.

### Folder map

```
app/                    routes (Expo Router)
  (tabs)/index.tsx      document library
  (tabs)/tools.tsx      merge documents, compress, batch export
  (tabs)/settings.tsx   settings
  document/[id]/…       document and its pages
  page/[id].tsx         single-page editor
  ocr/[id].tsx          recognised text
  annotate/[id].tsx     drawing, text, signature
  folder/[id].tsx       folder
  view/[id].tsx         full-screen viewer
  camera.tsx            capture
  export/[id].tsx       export options
  backup.tsx            backup and restore
  trash.tsx             trash
  lock.tsx              PIN and biometrics
  onboarding.tsx        first run
src/
  data/                 SQLite: schema, migrations, queries
  services/             Android/iOS integration
  image/                detection, perspective, filters, books, ID cards, PNG/JPEG
  pdf/                  PDF building and drawing
  export/               DOCX, XLSX, PPTX, ZIP
  security/             PIN (PBKDF2)
  backup/               writing and reading the backup ZIP
  state/                global settings (zustand)
  i18n/                 es/en strings
  theme/                colours and typography
  components/           shared UI pieces
plugins/                Expo config plugins (release permissions)
test/                   vitest suites and the sql.js adapter
```

### Startup

`app/_layout.tsx` does this in order: load polyfills, open the database and apply migrations (`getDb`), empty trash older than 30 days, delete leftover export and preview copies, and only then render. Until settings are loaded it shows a spinner, never a blank screen.

It also listens to `AppState`: coming back from the background clears shared exports and re-locks everything unlocked during that visit.

### Navigation

A root `Stack` with the detail screens plus a `(tabs)` group for the three main ones. There is no navigation state of its own: the route carries the id and every screen re-reads the database on focus (`useFocusEffect`). That prevents stale lists after an edit.

### State

Zustand deliberately holds very little: the settings and a "loaded" flag (`src/state/store.ts`). Everything else reads SQLite when needed. The database is the source of truth, and duplicating it in memory is the easiest way to end up with two truths.

### Languages and theme

`src/i18n/index.ts` exposes `t()` and `useLang()`. Strings live in `es.json` and `en.json`; the ones Android and iOS show themselves (camera permission, Face ID) live in `src/i18n/native/`, wired from `app.json` through `expo-localization`. The default language is the system one.

The theme is tokens (`src/theme/tokens.ts`) with a stored `system | light | dark` choice. Components read colours from context, never from loose constants.

### Where a new file goes

- Does it render something? `app/` for a screen, `src/components/` for a piece.
- Does it call a native module? `src/services/`.
- Does it compute on bytes, pixels or SQL? `src/data`, `src/image`, `src/pdf`, `src/export` or `src/backup`, with its test next to it.
- Does it store a value that must survive a restart? New `settings` column plus a migration.
