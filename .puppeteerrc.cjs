const {join} = require('path');

/**
 * @type {import("puppeteer").Configuration}
 */
module.exports = {
  // Cambia la ubicación de descarga de Chrome a la carpeta del proyecto
  // para que Render no la borre al terminar la fase de build.
  cacheDirectory: join(__dirname, '.cache', 'puppeteer'),
};
