# ORDO

<p align="center">
  <b>Escáner y gestor inteligente de documentos para móviles</b><br>
  <i>Smart document scanner and manager for mobile</i>
</p>

<p align="center">
  <a href="#español">Español</a> •
  <a href="#english">English</a>
</p>

---

<a name="español"></a>
## 🇪🇸 Español

**ORDO** es una aplicación móvil moderna de escaneo, organización y exportación de documentos creada con **React Native** y **Expo**. Diseñada para ofrecer una experiencia fluida, rápida y segura, permite digitalizar documentos físicos, procesar imágenes, extraer texto mediante OCR y generar archivos en múltiples formatos (PDF, DOCX, ZIP).

### ✨ Características Principales

- 📸 **Escaneo Avanzado e Inteligente**:
  - Soporte para cámara con detección y recorte de bordes.
  - Modo escáner continuo / ráfaga (múltiples páginas secuenciales).
  - Modo libro (captura de dos páginas o separación automática).
  - Cuadrícula de alineación, flash y nivel de horizonte.
- 🎨 **Filtros y Procesamiento de Imagen**:
  - Filtros optimizados: Color mejorado, Escala de grises, B/N (alto contraste) y Modo Foto.
  - Ajustes de brillo, contraste, saturación, rotación y recorte.
  - Corrección de curvatura y distorsión de página.
- 🔍 **OCR y Reconocimiento de Texto**:
  - Detección de texto rápida y precisa integrada con Google ML Kit.
  - Copia de texto directo al portapapeles o exportación a Word (.docx).
- 📑 **Gestión y Anotaciones**:
  - Organización por carpetas, documentos y páginas.
  - Reordenación intuitiva de páginas y previsualizaciones en alta resolución.
  - Herramientas de dibujo, resaltador, firmas digitales y sellos.
- 🔒 **Seguridad y Privacidad**:
  - Bloqueo de documentos y carpetas con PIN o biometría (huella / Face ID), con reintentos limitados.
  - Exportación de PDF protegidos con contraseña (AES-256).
  - Todo se guarda en el teléfono y la app no hace peticiones de red. El bloqueo protege el acceso desde la app: los archivos y la base de datos no están cifrados en reposo.
- 📤 **Exportación Versátil**:
  - PDF con calidad configurable y metadatos.
  - Documentos Word (.docx) con texto reconocido.
  - Archivos comprimidos (.zip) con imágenes en calidad original.
- 🌍 **Soporte Multilingüe**:
  - Disponible en Español e Inglés con detección automática o selección manual.

### 📥 Descarga

La versión publicada vive en [Releases](https://github.com/alberto2005-coder/ordo-project/releases): APK firmado, solo `arm64-v8a`, Android 7.0 o superior.

### 📚 Documentación

La carpeta [docs/](docs/) explica la arquitectura, el modelo de datos, la seguridad, el escaneo, la exportación, la compilación y las pruebas. Todo en español e inglés.

Pruebas y tipos: `npm test` y `npm run typecheck`.

### 🛠️ Tecnologías

- **Framework**: [React Native](https://reactnative.dev/) (v0.88), [Expo](https://expo.dev/) (SDK 58) con Expo Router incluido en el SDK.
- **Gestión de Estado**: [Zustand](https://github.com/pmndrs/zustand).
- **Base de Datos Local**: [Expo SQLite](https://docs.expo.dev/versions/latest/sdk/sqlite/).
- **Generación de Documentos**: `@cantoo/pdf-lib`, `docx`, `fflate`.
- **Visión / OCR**: `@react-native-ml-kit/text-recognition`, `react-native-document-scanner-plugin`.
- **UI / Iconos**: Lucide Icons (`lucide-react-native`), React Native SVG, React Native Gesture Handler.

### 🚀 Instalación y Puesta en Marcha

1. **Requisitos previos**:
   - [Node.js](https://nodejs.org/) 22 LTS (la misma versión que usa la integración continua).
   - npm: el repositorio trae `package-lock.json`, así que se instala con `npm ci`.
   - Android Studio / Xcode para desarrollo en emuladores o dispositivo físico.

2. **Instalar dependencias**:
   ```bash
   npm install
   ```

3. **Iniciar el servidor de desarrollo**:
   ```bash
   npx expo start
   ```

4. **Compilar y ejecutar en Android**:
   ```bash
   npx expo run:android
   ```

5. **Compilar y ejecutar en iOS**:
   ```bash
   npx expo run:ios
   ```

---

<a name="english"></a>
## 🇬🇧 English

**ORDO** is a modern, high-performance mobile document scanner and organizer built with **React Native** and **Expo**. Built for speed, precision, and privacy, ORDO turns your phone into a portable scanner with full on-device processing, OCR, and versatile multi-format export capabilities.

### ✨ Key Features

- 📸 **Advanced & Smart Scanning**:
  - Camera support with automatic edge detection and perspective crop.
  - Continuous / batch capture mode for high-volume multi-page scanning.
  - Book scanning mode with automatic dual-page splitting.
  - Alignment grid, flash control, and artificial horizon guide.
- 🎨 **Image Enhancement & Filters**:
  - Document-optimized presets: Enhanced Color, Grayscale, Clean B&W, and Photo mode.
  - Fine-grained controls for brightness, contrast, saturation, rotation, and cropping.
  - Page curvature correction and deskewing.
- 🔍 **OCR & Text Recognition**:
  - Fast, accurate on-device text recognition powered by Google ML Kit.
  - Copy recognized text directly to clipboard or export to Word (.docx).
- 📑 **Document Organization & Annotations**:
  - Hierarchical structure with folders, documents, and individual pages.
  - Drag-and-drop page reordering and fast high-res thumbnail rendering.
  - Freehand drawing, highlighter, digital signatures, and stamps.
- 🔒 **Security & Privacy**:
  - Document and folder locks with a PIN or biometrics (fingerprint / Face ID), with limited retries.
  - Password-protected PDF export (AES-256).
  - Everything stays on the phone and the app makes no network requests. The lock protects access from inside the app: files and the database are not encrypted at rest.
- 📤 **Flexible Export Options**:
  - Multi-resolution PDF generation with optional password protection.
  - Microsoft Word (.docx) export with extracted text.
  - ZIP archives containing original or processed images.
- 🌍 **Internationalization**:
  - Full support for English and Spanish with automatic locale detection.

### 📥 Download

Published builds live in [Releases](https://github.com/alberto2005-coder/ordo-project/releases): signed APK, `arm64-v8a` only, Android 7.0 or later.

### 📚 Documentation

The [docs/](docs/) folder covers architecture, data model, security, scanning, export, building and testing. Written in Spanish and English.

Tests and types: `npm test` and `npm run typecheck`.

### 🛠️ Tech Stack

- **Framework**: [React Native](https://reactnative.dev/) (v0.88), [Expo](https://expo.dev/) (SDK 58) with Expo Router bundled in the SDK.
- **State Management**: [Zustand](https://github.com/pmndrs/zustand).
- **Local Persistence**: [Expo SQLite](https://docs.expo.dev/versions/latest/sdk/sqlite/).
- **Document Generation**: `@cantoo/pdf-lib`, `docx`, `fflate`.
- **Vision / OCR**: `@react-native-ml-kit/text-recognition`, `react-native-document-scanner-plugin`.
- **UI & Icons**: Lucide Icons (`lucide-react-native`), React Native SVG, React Native Gesture Handler.

### 🚀 Getting Started

1. **Prerequisites**:
   - [Node.js](https://nodejs.org/) 22 LTS (the version CI uses).
   - npm: the repository ships a `package-lock.json`, so install with `npm ci`.
   - Android Studio / Xcode configured for native development.

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Start Expo development server**:
   ```bash
   npx expo start
   ```

4. **Run on Android**:
   ```bash
   npx expo run:android
   ```

5. **Run on iOS**:
   ```bash
   npx expo run:ios
   ```

---

### 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

