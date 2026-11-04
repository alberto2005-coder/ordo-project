# Documentación de Ordo · Ordo documentation

[Español](#español) · [English](#english)

---

## Español

Esta carpeta explica cómo está hecho Ordo por dentro: qué hace cada módulo, cómo se guardan los datos y por qué se tomaron ciertas decisiones. Está pensada para quien vaya a tocar el código, no para quien solo quiera usar la app (para eso está el [README principal](../README.md)).

### Índice

| Documento | Qué cuenta |
|---|---|
| [architecture.md](architecture.md) | Capas del proyecto, rutas, arranque de la app, estado y temas. Dónde va cada archivo nuevo. |
| [data-model.md](data-model.md) | Esquema SQLite, migraciones, papelera, búsqueda, carpetas y formato del respaldo. |
| [security.md](security.md) | PIN, biometría, bloqueos y permisos. Qué protege de verdad y qué no. |
| [scanning.md](scanning.md) | Captura, detección de bordes, filtros, OCR, modo libro, carné y importación de PDF. |
| [export.md](export.md) | PDF, Word, Excel, PowerPoint, ZIP y JPG: opciones, calidad y cifrado. |
| [build-release.md](build-release.md) | Compilar, firmar y publicar el APK, en local y con GitHub Actions. |
| [testing.md](testing.md) | Qué cubren las pruebas, cómo se ejecutan y cómo añadir una. |

### Reglas de esta carpeta

1. **Todo documento es bilingüe.** Cada archivo lleva su parte en español y su parte en inglés, en ese orden. No hay versiones sueltas en un solo idioma ni traducciones en archivos aparte.
2. **Los documentos describen el código que existe.** Si una función cambia, el documento se actualiza en el mismo cambio. Si algo no está implementado, se dice: no se escribe como si lo estuviera.
3. **Los límites se dicen en voz alta.** Los topes de tamaño, los rechazos y las cosas que la app no hace son parte de la documentación, no letra pequeña.
4. **Nombres de archivo en inglés**, contenido en los dos idiomas. Así los enlaces funcionan igual desde cualquier editor.

---

## English

This folder explains how Ordo works inside: what each module does, how data is stored, and why certain decisions were made. It is meant for people changing the code, not for people who just want to use the app (that is the [main README](../README.md)).

### Index

| Document | What it covers |
|---|---|
| [architecture.md](architecture.md) | Project layers, routes, app startup, state and theming. Where a new file belongs. |
| [data-model.md](data-model.md) | SQLite schema, migrations, trash, search, folders and the backup format. |
| [security.md](security.md) | PIN, biometrics, locks and permissions. What is actually protected and what is not. |
| [scanning.md](scanning.md) | Capture, edge detection, filters, OCR, book mode, ID cards and PDF import. |
| [export.md](export.md) | PDF, Word, Excel, PowerPoint, ZIP and JPG: options, quality and encryption. |
| [build-release.md](build-release.md) | Building, signing and publishing the APK, locally and with GitHub Actions. |
| [testing.md](testing.md) | What the tests cover, how to run them and how to add one. |

### Rules for this folder

1. **Every document is bilingual.** Each file carries its Spanish part and its English part, in that order. There are no single-language documents and no translations in separate files.
2. **Documents describe the code that exists.** If a function changes, the document changes in the same commit. If something is not implemented, it says so: it is never written as if it were.
3. **Limits are stated out loud.** Size caps, refusals and things the app does not do are part of the documentation, not fine print.
4. **English file names**, content in both languages. That keeps links working from any editor.
