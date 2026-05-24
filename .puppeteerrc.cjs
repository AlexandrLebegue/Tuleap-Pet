const { join } = require('node:path')

/**
 * Redirige le cache puppeteer dans le projet pour qu'electron-builder puisse
 * embarquer le binaire navigateur (cf. `extraResources` dans electron-builder.yml).
 *
 * On ne télécharge QUE `chrome-headless-shell` (~150 Mo) : marp-cli n'a besoin
 * que d'un Chromium headless pour rendre les PPTX, pas du Chrome complet (~270 Mo).
 */
module.exports = {
  cacheDirectory: join(__dirname, '.puppeteer-cache'),
  chrome: { skipDownload: true },
  'chrome-headless-shell': { skipDownload: false }
}
