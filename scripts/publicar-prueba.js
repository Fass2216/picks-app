// Publica los cambios SOLO en "Picks Prueba" (canal "preview"). La app de
// todos no se entera. Uso:  npm run prueba -- "qué cambié"
//
// Ojo: Picks Prueba muestra SIEMPRE lo último que alguien publicó. Si se
// publica desde una rama que no tiene los cambios de otra persona, esos
// cambios desaparecen de Picks Prueba (siguen guardados en su rama). Por eso,
// desde "main" pide confirmación antes de publicar.
const { spawnSync, execSync } = require('child_process');
const readline = require('readline');

// El mensaje va entre comillas en un solo texto: sin eso, la terminal lo
// partía en palabras sueltas ("Unexpected arguments").
const message = (process.argv.slice(2).join(' ').trim() || 'Cambios de prueba').replace(/["`$\\]/g, "'");

function publish() {
  const result = spawnSync(`npx eas update --channel preview --message "${message}"`, {
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, APP_VARIANT: 'prueba' },
  });
  process.exit(result.status ?? 1);
}

let branch = '';
try { branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim(); } catch (e) { /* sin git */ }

if (branch !== 'main') publish();
else {
  console.log('\nEstás en "main": esto va a REEMPLAZAR lo que haya en Picks Prueba');
  console.log('(por ejemplo, los cambios de diseño de Agus, que no están en main).');
  if (!process.stdin.isTTY) {
    console.log('No se publicó. Corrélo desde una terminal para confirmarlo.');
    process.exit(1);
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question('¿Publicar igual? (s/N) ', (answer) => {
    rl.close();
    if (/^s/i.test(answer.trim())) publish();
    else { console.log('No se publicó.'); process.exit(0); }
  });
}
