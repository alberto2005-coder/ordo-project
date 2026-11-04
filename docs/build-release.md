# Compilar y publicar · Build and release

[Español](#español) · [English](#english)

---

## Español

### Lo que hace falta

- **Node 22 LTS** y `npm` (el repositorio trae `package-lock.json`; se instala con `npm ci`).
- **JDK 17**.
- **Android SDK** con `compileSdk 37`, las build-tools correspondientes y el NDK que pida React Native 0.88.
- Un keystore de firma propio. El de Ordo es PKCS#12, alias `ordo`, y **no está en el repositorio** (`.gitignore` lo excluye junto con `signing/` y `release/`).

### Compilar en local

```bash
npm ci
npx expo prebuild --platform android --no-install
cd android
./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a --console=plain
```

`android/` no se versiona: se genera en cada build. El APK sale en `android/app/build/outputs/apk/release/app-release.apk`, **sin firmar**.

### Firmar a mano

La firma no la inyecta Gradle: se firma después, con `apksigner`, para que el APK resultante sea exactamente el que se verifica.

```bash
apksigner sign \
  --ks signing/ordo-upload.keystore --ks-key-alias ordo \
  --ks-pass "pass:$PASSWORD" --key-pass "pass:$PASSWORD" \
  --out release/Ordo-1.0.0-arm64-v8a.apk \
  android/app/build/outputs/apk/release/app-release.apk
```

Comprobaciones antes de publicar:

```bash
apksigner verify --print-certs release/Ordo-1.0.0-arm64-v8a.apk
zipalign -c -P 16 -v 4 release/Ordo-1.0.0-arm64-v8a.apk
aapt2 dump badging release/Ordo-1.0.0-arm64-v8a.apk
```

Detalle que muerde: en build-tools 37, `apksigner verify` **no acepta `--ks`**. Para comparar la huella del certificado con la del keystore se usa `keytool -list -v`.

### El APK de release

- Paquete `app.ordoscanner.ordo`, `minSdk 24` (Android 7.0), `targetSdk 36`, `compileSdk 37`.
- **Solo `arm64-v8a`**: no funciona en emuladores x86 ni en teléfonos de 32 bits. Pesa unos 58 MB.
- Sin `INTERNET` ni `SYSTEM_ALERT_WINDOW`: los quita el plugin `plugins/with-release-permissions.js` escribiendo un manifiesto de variante con `tools:node="remove"`. Se hace con un config plugin, no editando el manifiesto generado, para que sobreviva a `expo prebuild`.

### Integración continua

`.github/workflows/android-release.yml` se dispara con un tag `v*` o a mano (`workflow_dispatch`). Hace lo mismo que el build local:

1. `npm ci`, Node 22 y JDK 17.
2. `npx expo prebuild --platform android --no-install`.
3. `./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a`.
4. Descifra el keystore desde los secrets, firma con `apksigner` y verifica.
5. Sube el APK y su `.sha256` como artifact `ordo-apk` (30 días).
6. Si el disparo fue por un tag, publica la release con `softprops/action-gh-release`.

Secrets necesarios, creados a mano en el repositorio:

| Secret | Contenido |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | El keystore en base64, **en una sola línea** sin saltos. |
| `ANDROID_KEYSTORE_PASSWORD` | La contraseña del keystore, sin espacios al principio ni al final. |
| `ANDROID_KEY_ALIAS` | `ordo`. |

El `GITHUB_TOKEN` del propio workflow publica la release; no hay ningún token personal guardado.

### Versionado

- `app.json` → `version` y `android.versionCode`.
- `android/app/build.gradle` los recibe de `app.json` al hacer `prebuild`.
- El tag es `v` + versión: `v1.0.0`.
- El nombre del APK lo toma del `version` de `package.json`, así que conviene subir los tres a la vez.

Para una versión nueva: se sube la versión, se actualiza el `versionCode`, se hace commit, se empuja a `main`, se crea el tag y se empuja el tag. El tag es lo que publica.

### La clave de firma

Hay una sola clave y no se cambia. Si se pierde, Android no acepta actualizaciones de la app con otra firma: habría que publicar un paquete nuevo y pedir a la gente que migre. Por eso el keystore y su contraseña se guardan fuera del repositorio, con copia en un pendrive y en los secrets de Actions.

### Desinstalar antes de instalar

Un APK firmado con otra clave no se instala encima: Android lo rechaza. Si en el teléfono hay una compilación de desarrollo firmada con la clave de depuración, hay que desinstalarla primero. Eso borra sus datos.

---

## English

### What you need

- **Node 22 LTS** and `npm` (the repository ships a `package-lock.json`; install with `npm ci`).
- **JDK 17**.
- **Android SDK** with `compileSdk 37`, the matching build-tools and whatever NDK React Native 0.88 asks for.
- A signing keystore of your own. Ordo's is PKCS#12, alias `ordo`, and **is not in the repository** (`.gitignore` excludes it along with `signing/` and `release/`).

### Building locally

```bash
npm ci
npx expo prebuild --platform android --no-install
cd android
./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a --console=plain
```

`android/` is not versioned: it is generated on every build. The APK lands in `android/app/build/outputs/apk/release/app-release.apk`, **unsigned**.

### Signing by hand

Signing is not injected by Gradle: it happens afterwards with `apksigner`, so the resulting APK is exactly the one that gets verified.

```bash
apksigner sign \
  --ks signing/ordo-upload.keystore --ks-key-alias ordo \
  --ks-pass "pass:$PASSWORD" --key-pass "pass:$PASSWORD" \
  --out release/Ordo-1.0.0-arm64-v8a.apk \
  android/app/build/outputs/apk/release/app-release.apk
```

Checks before publishing:

```bash
apksigner verify --print-certs release/Ordo-1.0.0-arm64-v8a.apk
zipalign -c -P 16 -v 4 release/Ordo-1.0.0-arm64-v8a.apk
aapt2 dump badging release/Ordo-1.0.0-arm64-v8a.apk
```

One gotcha: in build-tools 37 `apksigner verify` **does not accept `--ks`**. To compare the certificate fingerprint with the keystore's, use `keytool -list -v`.

### The release APK

- Package `app.ordoscanner.ordo`, `minSdk 24` (Android 7.0), `targetSdk 36`, `compileSdk 37`.
- **`arm64-v8a` only**: it does not run on x86 emulators or 32-bit phones. Roughly 58 MB.
- No `INTERNET`, no `SYSTEM_ALERT_WINDOW`: the `plugins/with-release-permissions.js` plugin removes them by writing a variant manifest with `tools:node="remove"`. It is done with a config plugin rather than by editing the generated manifest, so it survives `expo prebuild`.

### Continuous integration

`.github/workflows/android-release.yml` runs on a `v*` tag or manually (`workflow_dispatch`). It does the same as the local build:

1. `npm ci`, Node 22 and JDK 17.
2. `npx expo prebuild --platform android --no-install`.
3. `./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a`.
4. Decrypts the keystore from secrets, signs with `apksigner` and verifies.
5. Uploads the APK and its `.sha256` as the `ordo-apk` artifact (30 days).
6. If a tag triggered the run, publishes the release with `softprops/action-gh-release`.

Secrets to create by hand in the repository:

| Secret | Content |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | The keystore in base64, **on a single line** with no breaks. |
| `ANDROID_KEYSTORE_PASSWORD` | The keystore password, with no leading or trailing spaces. |
| `ANDROID_KEY_ALIAS` | `ordo`. |

The workflow's own `GITHUB_TOKEN` publishes the release; no personal token is stored anywhere.

### Versioning

- `app.json` → `version` and `android.versionCode`.
- `android/app/build.gradle` receives them from `app.json` during `prebuild`.
- The tag is `v` + version: `v1.0.0`.
- The APK name comes from `package.json`'s `version`, so bump all three together.

For a new version: raise the version, update `versionCode`, commit, push to `main`, create the tag and push the tag. The tag is what publishes.

### The signing key

There is one key and it does not change. If it is lost, Android will not accept updates signed with a different one: a new package would have to be published and people asked to migrate. That is why the keystore and its password live outside the repository, with a copy on a USB drive and in Actions secrets.

### Uninstall before installing

An APK signed with a different key will not install over an existing one: Android refuses it. If the phone holds a development build signed with the debug key, uninstall it first. That erases its data.
