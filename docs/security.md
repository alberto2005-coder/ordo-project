# Seguridad y privacidad · Security and privacy

[Español](#español) · [English](#english)

---

## Español

### Qué significa "local" aquí

Ordo no habla con ningún servidor. No hay cuentas, ni sincronización, ni analítica, ni comprobación de actualizaciones. El APK de release **no declara el permiso `INTERNET`** (`plugins/with-release-permissions.js`), así que ni siquiera podría abrir una conexión aunque el código lo intentara. Eso se comprueba en el APK publicado, no se pide por confianza.

En desarrollo el permiso sigue ahí: sin él, la app de debug no alcanza Metro.

### El PIN

- **Hash**: PBKDF2-SHA256 con **300 000** iteraciones y sal aleatoria de 16 bytes. El PIN no se guarda nunca en claro ni en la base de datos.
- **Dónde**: en el llavero del sistema (`expo-secure-store`, Keystore en Android, Keychain en iOS). El respaldo automático de Android está desactivado para esa entrada.
- **Formato del registro**: `v1$<iteraciones>$<sal hex>$<hash hex>`. La comprobación es en tiempo constante.
- **Longitud**: 6 a 8 dígitos para PIN nuevos. Los de 4 dígitos creados por versiones anteriores siguen abriendo: no se puede invalidar un PIN existente sin pedirlo.
- **Reintentos**: cinco gratis. A partir del sexto, espera de 30 s que se duplica en cada fallo, con tope de una hora. Los intentos se guardan junto al PIN, así que cerrar la app no los reinicia.
- **Cambiar o quitar el PIN** exige el actual.

Un PIN de seis cifras son un millón de combinaciones. Con 300 000 iteraciones por intento y el bloqueo progresivo, probarlas todas no es viable a mano en el teléfono.

No hay recuperación. Si se olvida el PIN, los documentos bloqueados quedan cerrados; borrar los datos de la app lo borra todo. El respaldo no lleva el PIN ni los documentos bloqueados, y eso es deliberado.

### Biometría

Opcional, con `expo-local-authentication`. La huella o la cara son un atajo para desbloquear, no un segundo factor: el PIN sigue siendo la base. Si el teléfono no tiene hardware o no hay nada enrolado, la opción no se ofrece.

### Cuándo se vuelve a bloquear

Lo desbloqueado vale para una visita: al pasar la app a segundo plano se llama a `lockAll()` y todo vuelve a pedir PIN. No hay una ventana de gracia configurable.

La comprobación no vive solo en la pantalla. `canModifyDocument()` en `src/services/auth.ts` se consulta antes de escribir, porque a un documento se puede llegar por enlaces profundos, por la cámara o por una importación, no solo navegando.

Con la app bloqueada, además, la miniatura y el texto OCR del documento no se muestran ni se buscan.

### Exportaciones

- Un PDF con contraseña se cifra con **AES-256**. La contraseña de propietario es aleatoria y se descarta: nadie, ni la propia app, puede usar el PDF para levantar las restricciones. Solo la contraseña del usuario lo abre.
- Se cierra también la copia de texto y la modificación. Son restricciones del estándar PDF: un lector decidido puede quitarlas. Sirven para lo que sirven, no son DRM.
- Las copias exportadas viven en la caché y se borran al volver a la app, para que el archivo compartido no se quede ahí indefinidamente.

### Qué no protege

Decirlo claro es parte del diseño:

- **Los archivos y la base de datos no están cifrados en reposo.** El bloqueo protege el acceso desde la app, no el almacenamiento. Quien tenga acceso root al teléfono, o un respaldo del sistema, puede leer las imágenes.
- **Las capturas de pantalla y la vista de recientes** pueden mostrar contenido. No se pone `FLAG_SECURE`.
- **Un archivo exportado deja de estar bajo el control de la app** en cuanto se comparte.
- **La papelera no es una caja fuerte**: los documentos siguen en disco hasta que se purgan a los 30 días.
- **El respaldo es un ZIP sin cifrar.** Contiene las imágenes y los datos de todo lo que no esté bloqueado.

### Permisos del APK de release

Los que quedan: `CAMERA`, `READ_MEDIA_IMAGES`, `READ_MEDIA_VISUAL_USER_SELECTED`, `USE_BIOMETRIC`, `USE_FINGERPRINT`, `VIBRATE`, y los de almacenamiento limitados a `maxSdkVersion 32`.

Los que se quitan solo en release, mediante el plugin: `INTERNET` y `SYSTEM_ALERT_WINDOW`. Se quitan con `tools:node="remove"` en un manifiesto de la variante, no editando el generado, para que sobreviva a un `expo prebuild`.

---

## English

### What "local" means here

Ordo does not talk to any server. There are no accounts, no sync, no analytics, no update check. The release APK **does not declare the `INTERNET` permission** (`plugins/with-release-permissions.js`), so it could not open a connection even if the code tried. That is checked on the published APK, not taken on trust.

In development the permission stays: without it, the debug app cannot reach Metro.

### The PIN

- **Hash**: PBKDF2-SHA256 with **300,000** iterations and a random 16-byte salt. The PIN is never stored in clear text, and never in the database.
- **Where**: in the system keychain (`expo-secure-store`, Keystore on Android, Keychain on iOS). Android auto-backup is disabled for that entry.
- **Record format**: `v1$<iterations>$<salt hex>$<hash hex>`. Comparison is constant-time.
- **Length**: 6 to 8 digits for new PINs. Four-digit PINs created by older versions still open: an existing PIN cannot be invalidated without asking for it.
- **Retries**: five free. From the sixth, a 30 s wait that doubles on every failure, capped at one hour. Attempts are stored next to the PIN, so closing the app does not reset them.
- **Changing or removing the PIN** requires the current one.

A six-digit PIN is a million combinations. With 300,000 iterations per attempt and the progressive lockout, trying them all by hand is not viable on a phone.

There is no recovery. If the PIN is forgotten, locked documents stay shut; clearing the app data wipes everything. The backup carries neither the PIN nor locked documents, and that is deliberate.

### Biometrics

Optional, through `expo-local-authentication`. Fingerprint or face is a shortcut to unlock, not a second factor: the PIN remains the basis. If the phone has no hardware or nothing enrolled, the option is not offered.

### When it locks again

An unlock lasts one visit: when the app goes to the background `lockAll()` runs and everything asks for the PIN again. There is no configurable grace window.

The check is not only in the screen. `canModifyDocument()` in `src/services/auth.ts` is consulted before writing, because a document can be reached through deep links, the camera or an import, not only by navigating.

While locked, the thumbnail and OCR text of the document are neither shown nor searched.

### Exports

- A password-protected PDF is encrypted with **AES-256**. The owner password is random and discarded: nobody, not even the app, can use the PDF to lift the restrictions. Only the user's password opens it.
- Text copying and modification are closed too. These are PDF standard restrictions: a determined reader can remove them. They do what they do, and they are not DRM.
- Exported copies live in the cache and are deleted when the person returns to the app, so a shared file does not linger there.

### What it does not protect

Saying it plainly is part of the design:

- **Files and the database are not encrypted at rest.** The lock protects access from inside the app, not the storage. Anyone with root access to the phone, or a system backup, can read the images.
- **Screenshots and the recents view** may show content. `FLAG_SECURE` is not set.
- **An exported file leaves the app's control** the moment it is shared.
- **The trash is not a safe**: documents stay on disk until purged after 30 days.
- **The backup is an unencrypted ZIP.** It contains the images and data of everything that is not locked.

### Release APK permissions

What remains: `CAMERA`, `READ_MEDIA_IMAGES`, `READ_MEDIA_VISUAL_USER_SELECTED`, `USE_BIOMETRIC`, `USE_FINGERPRINT`, `VIBRATE`, plus the storage ones limited to `maxSdkVersion 32`.

What is removed in release only, through the plugin: `INTERNET` and `SYSTEM_ALERT_WINDOW`. They are removed with `tools:node="remove"` in a variant manifest rather than by editing the generated one, so it survives an `expo prebuild`.
