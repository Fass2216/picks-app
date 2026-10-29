// Revisión antes de publicar o guardar cambios: que App.js se pueda leer y
// que no use nombres que no existen (un `React.createContext` sin importar
// React rompió una actualización y la app volvió sola a la versión vieja).
// Uso:  npm run revisar
const fs = require('fs');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;

const GLOBALS = new Set(('console setTimeout clearTimeout setInterval clearInterval fetch Promise JSON Math Date Object Array ' +
  'String Number Boolean Error Set Map URL URLSearchParams encodeURIComponent decodeURIComponent parseInt parseFloat isNaN ' +
  'Infinity NaN undefined window document navigator requestAnimationFrame cancelAnimationFrame globalThis __DEV__ RegExp ' +
  'Symbol AbortController AbortSignal FormData Blob atob btoa isFinite Intl process require module exports __dirname ' +
  '__filename arguments queueMicrotask WeakMap Uint8Array ArrayBuffer alert performance Response Headers Function Buffer ' +
  'TextDecoder TextEncoder').split(' '));

let failed = false;
for (const file of ['App.js', 'index.js']) {
  let ast;
  try {
    ast = parser.parse(fs.readFileSync(file, 'utf8'), { sourceType: 'module', plugins: ['jsx'] });
  } catch (e) {
    console.error(`✗ ${file}: error de escritura en la línea ${e.loc?.line}: ${e.message}`);
    failed = true;
    continue;
  }
  const missing = {};
  traverse(ast, {
    ReferencedIdentifier(p) {
      const name = p.node.name;
      if (p.parentPath.isJSXClosingElement()) return;
      if (!p.scope.hasBinding(name) && !GLOBALS.has(name)) (missing[name] = missing[name] || []).push(p.node.loc?.start.line);
    },
  });
  const names = Object.keys(missing);
  if (names.length) {
    failed = true;
    names.forEach(n => console.error(`✗ ${file}: "${n}" no está definido (líneas ${missing[n].slice(0, 5).join(', ')})`));
  } else {
    console.log(`✓ ${file} sin errores`);
  }
}
process.exit(failed ? 1 : 0);
