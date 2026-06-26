#!/usr/bin/env node
import fs from 'node:fs';
import { config, STORAGE_STATE } from './config.js';
import { STATUS_LABEL } from './constants.js';
import { loadState, saveState, recordResult } from './store.js';
import { notifyTransition } from './notify.js';
import { getTargets, addTarget, removeTarget } from './targets.js';

const command = process.argv[2] || 'check';
const arg = process.argv[3];

async function runCheck() {
  if (!fs.existsSync(STORAGE_STATE)) {
    console.error(
      '\n⚠️  No hay sesión guardada. Ejecuta primero:  npm run login\n'
    );
    process.exit(1);
  }

  const targets = getTargets();
  if (targets.length === 0) {
    console.error(
      '\n⚠️  No hay usuarios que vigilar. Añade alguno con:\n' +
        '   npm run add -- usuario\n' +
        '   (o define TARGETS en el archivo .env)\n'
    );
    process.exit(1);
  }

  // Importación diferida: solo cargamos Playwright cuando hace falta navegar.
  const { checkUser } = await import('./scraper.js');

  console.log(`\nComprobando ${targets.length} cuenta(s)...\n`);
  const state = loadState();

  for (const username of targets) {
    process.stdout.write(`• @${username} ... `);
    try {
      const result = await checkUser(username);
      console.log(STATUS_LABEL[result.status] ?? result.status);

      const transition = recordResult(state, result);
      if (transition) await notifyTransition(username, transition);

      if (result.status === 'session-expired') {
        console.error(
          '\n⚠️  Tu sesión ha caducado. Ejecuta:  npm run login\n'
        );
        break;
      }
    } catch (err) {
      console.log(`error: ${err.message}`);
    }
  }

  saveState(state);
  console.log('\nListo. Estado guardado en data/state.json\n');
}

async function runWatch() {
  const minutes = config.intervalMinutes;
  console.log(
    `\nModo vigilancia: comprobando cada ${minutes} minuto(s). Ctrl+C para salir.\n`
  );
  // Bucle infinito con espera entre rondas.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    await runCheck();
    await sleep(minutes * 60 * 1000);
  }
}

function runList() {
  const targets = getTargets();
  const state = loadState();
  if (targets.length === 0) {
    console.log('\nNo hay cuentas configuradas.\n');
    return;
  }
  console.log('\nCuentas vigiladas:\n');
  for (const username of targets) {
    const s = state[username];
    const label = s ? (STATUS_LABEL[s.status] ?? s.status) : 'sin comprobar';
    const when = s ? `  (${s.checkedAt})` : '';
    console.log(`  @${username} — ${label}${when}`);
  }
  console.log('');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function printHelp() {
  console.log(`
tiktok-block-monitor — detecta si una cuenta de TikTok te bloqueó/desbloqueó

Uso:
  npm run login              Inicia sesión en TikTok (una sola vez)
  npm run check              Comprueba todas las cuentas una vez
  npm run watch              Comprueba en bucle según INTERVAL_MINUTES
  npm run list               Muestra el último estado conocido
  npm run add -- <usuario>   Añade una cuenta a vigilar
  npm run remove -- <usuario>  Deja de vigilar una cuenta
`);
}

async function main() {
  switch (command) {
    case 'check':
      await runCheck();
      break;
    case 'watch':
      await runWatch();
      break;
    case 'list':
      runList();
      break;
    case 'add':
      if (!arg) return printHelp();
      console.log(
        addTarget(arg)
          ? `Añadido: @${arg}`
          : `@${arg} ya estaba en la lista.`
      );
      break;
    case 'remove':
      if (!arg) return printHelp();
      console.log(
        removeTarget(arg) ? `Eliminado: @${arg}` : `@${arg} no estaba en la lista.`
      );
      break;
    default:
      printHelp();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
