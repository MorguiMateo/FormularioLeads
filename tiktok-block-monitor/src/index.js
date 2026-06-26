#!/usr/bin/env node
import fs from 'node:fs';
import { config, STORAGE_STATE } from './config.js';
import { STATUS_LABEL } from './constants.js';
import { loadState, saveState, recordResult } from './store.js';
import { notifyTransition } from './notify.js';
import { getTargets, addTarget, removeTarget } from './targets.js';

const command = process.argv[2] || 'check';
const arg = process.argv[3];

// Marca temporal corta para los logs del daemon.
function ts() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

/**
 * Ejecuta una ronda de comprobaciones.
 * Devuelve: 'ok' | 'no-session' | 'no-targets' | 'session-expired'.
 * Nunca llama a process.exit, para poder reutilizarse en el modo daemon.
 */
async function runCheck() {
  if (!fs.existsSync(STORAGE_STATE)) {
    console.error(
      `[${ts()}] ⚠️  No hay sesión guardada. Ejecuta primero:  npm run login`
    );
    return 'no-session';
  }

  const targets = getTargets();
  if (targets.length === 0) {
    console.error(
      `[${ts()}] ⚠️  No hay cuentas que vigilar. Añade alguna con:  npm run add -- usuario`
    );
    return 'no-targets';
  }

  // Importación diferida: solo cargamos Playwright cuando hace falta navegar.
  const { checkUser } = await import('./scraper.js');

  console.log(`[${ts()}] Comprobando ${targets.length} cuenta(s)...`);
  const state = loadState();
  let outcome = 'ok';

  for (const username of targets) {
    try {
      const result = await checkUser(username);
      console.log(
        `[${ts()}] • @${username} — ${STATUS_LABEL[result.status] ?? result.status}`
      );

      const transition = recordResult(state, result);
      if (transition) await notifyTransition(username, transition);

      if (result.status === 'session-expired') {
        console.error(
          `[${ts()}] ⚠️  Tu sesión ha caducado. Ejecuta:  npm run login`
        );
        outcome = 'session-expired';
        break;
      }
    } catch (err) {
      console.log(`[${ts()}] • @${username} — error: ${err.message}`);
    }
  }

  saveState(state);
  return outcome;
}

async function runWatch() {
  const minutes = config.intervalMinutes;
  console.log(
    `[${ts()}] Modo vigilancia activo: comprobando cada ${minutes} minuto(s). Ctrl+C para salir.`
  );

  let stopping = false;
  let wakeUp = null; // resuelve la espera entre rondas antes de tiempo
  const stop = (signal) => {
    console.log(`\n[${ts()}] Recibido ${signal}, deteniendo vigilancia...`);
    stopping = true;
    if (wakeUp) wakeUp();
  };
  process.on('SIGINT', () => stop('SIGINT'));
  process.on('SIGTERM', () => stop('SIGTERM'));

  // Espera interrumpible: se resuelve al pasar el tiempo o al pedir parada.
  const waitInterruptible = (ms) =>
    new Promise((resolve) => {
      const timer = setTimeout(resolve, ms);
      wakeUp = () => {
        clearTimeout(timer);
        resolve();
      };
    });

  // Bucle resiliente: un fallo en una ronda no detiene el daemon.
  while (!stopping) {
    try {
      await runCheck();
    } catch (err) {
      console.error(`[${ts()}] Error inesperado en la ronda: ${err.message}`);
    }
    if (stopping) break;
    await waitInterruptible(minutes * 60 * 1000);
  }
  console.log(`[${ts()}] Vigilancia detenida.`);
  process.exit(0);
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

Daemon (segundo plano, systemd):
  npm run daemon:install     Servicio continuo (watch)
  npm run daemon:timer       Comprobación periódica con timer
  npm run daemon:uninstall   Desinstala el daemon
`);
}

async function main() {
  switch (command) {
    case 'check': {
      const outcome = await runCheck();
      if (outcome === 'no-session' || outcome === 'no-targets') {
        process.exit(1);
      }
      break;
    }
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
