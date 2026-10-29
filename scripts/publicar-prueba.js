// Publica los cambios SOLO en "Picks Prueba" (canal "preview"). La app de
// todos no se entera. Uso:  npm run prueba -- "qué cambié"
const { spawnSync } = require('child_process');

const message = process.argv.slice(2).join(' ').trim() || 'Cambios de prueba';
const result = spawnSync('npx', ['eas', 'update', '--channel', 'preview', '--message', JSON.stringify(message)], { // entre comillas: con shell, los espacios cortaban el mensaje
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, APP_VARIANT: 'prueba' },
});
process.exit(result.status ?? 1);
