const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Excluir la carpeta backend — es Node.js puro, no React Native
// (hay que escapar la ruta antes de meterla en un RegExp: en Windows
// path.resolve() devuelve backslashes, y sin escapar rompen el regex)
function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
const backendPath = escapeRegExp(path.resolve(__dirname, 'backend'));
config.resolver.blockList = [
  new RegExp(`^${backendPath}[\\\\/].*`),
];

module.exports = config;
