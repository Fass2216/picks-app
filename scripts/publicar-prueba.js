// Publica los cambios SOLO en "Picks Prueba" (canal "preview"). La app de
// todos no se entera. Uso:  npm run prueba -- "qué cambié"
const { spawnSync } = require('child_process');

// El mensaje va entre comillas en un solo texto: sin eso, la terminal lo
// partía en palabras sueltas ("Unexpected arguments").
const message = (process.argv.slice(2).join(' ').trim() || 'Cambios de prueba').replace(/["`$\\]/g, "'");
const result = spawnSync(`npx eas update --channel preview --message "${message}"`, {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, APP_VARIANT: 'prueba' },
});
process.exit(result.status ?? 1);
