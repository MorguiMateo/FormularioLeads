import { chromium } from 'playwright';
import { config, STORAGE_STATE } from './config.js';

/**
 * Abre un navegador visible para que inicies sesión manualmente en TikTok.
 * Cuando termines, vuelve a la terminal y pulsa ENTER: la sesión se guarda
 * en storage-state.json y se reutiliza en las comprobaciones de bloqueo.
 */
async function main() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    userAgent: config.userAgent,
    viewport: { width: 1280, height: 800 },
    locale: 'es-ES',
  });
  const page = await context.newPage();

  await page.goto('https://www.tiktok.com/login', {
    waitUntil: 'domcontentloaded',
  });

  console.log('\n========================================================');
  console.log('  Inicia sesión en TikTok en la ventana del navegador.');
  console.log('  Cuando veas tu perfil cargado, vuelve aquí.');
  console.log('========================================================\n');

  await waitForEnter('Pulsa ENTER cuando hayas iniciado sesión... ');

  await context.storageState({ path: STORAGE_STATE });
  console.log(`\nSesión guardada en: ${STORAGE_STATE}`);
  console.log('Ya puedes ejecutar:  npm run check\n');

  await browser.close();
}

function waitForEnter(prompt) {
  return new Promise((resolve) => {
    process.stdout.write(prompt);
    process.stdin.resume();
    process.stdin.once('data', () => {
      process.stdin.pause();
      resolve();
    });
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
