const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

// Ordo es una app 100% local: no hay backend, ni analítica, ni actualizaciones remotas.
// INTERNET y SYSTEM_ALERT_WINDOW llegan de la plantilla de Expo y de los módulos
// (expo.modules.filesystem, expo.modules.image), así que se quitan solo en release.
// En desarrollo deben seguir ahí: sin INTERNET, el build de debug no alcanza Metro,
// y SYSTEM_ALERT_WINDOW lo necesita el menú de desarrollo.
const RELEASE_MANIFEST = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:tools="http://schemas.android.com/tools">
  <uses-permission android:name="android.permission.INTERNET" tools:node="remove"/>
  <uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW" tools:node="remove"/>
</manifest>
`;

module.exports = function withReleasePermissions(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const dir = path.join(cfg.modRequest.platformProjectRoot, 'app', 'src', 'release');
      await fs.promises.mkdir(dir, { recursive: true });
      await fs.promises.writeFile(path.join(dir, 'AndroidManifest.xml'), RELEASE_MANIFEST, 'utf8');
      return cfg;
    },
  ]);
};
