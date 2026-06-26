#!/usr/bin/env node
import fs from 'node:fs';
import { config, STORAGE_STATE } from './config.js';
import { STATUS_LABEL } from './constants.js';
import { loadState, saveState, recordResult } from './store.js';
import { notifyTransition } from './notify.js';
import { getTargets, addTarget, removeTarget } from './targets.js';
import {
  parseWindows,
  isWithinWindow,
  nextRunTime,
  nextWindowStart,
} from './scheduler.js';

const command = process.argv[2] || 'check';
const arg = process.argv[3];

// Marca temporal corta para los logs del daemon.
function ts() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randBetween(min, max) {
  return Math.floor(min + Math.random() * (max - min));
}

function fmtClock(date) {
  return date.toLocaleString('es-ES', { hour12: false });
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

  for (let i = 0; i < targets.length; i++) {
    const username = targets[i];
    try {
      const result = await checkUser(username);
      console.log(
        `[${ts()}] • @${username} — ${STATUS_LABEL[result.status] ?? result.status}`
      );

      const transition = recordResult(state, result);
      if (transition) await notifyTransition(username, transition);

      if (result.status === 'rate-limited') {
        outcome = 'rate-limited';
        break; // dejamos de insistir; el daemon entrará en backoff
      }
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

    // Retardo aleatorio entre cuentas (no tras la última).
    if (i < targets.length - 1) {
      const delay = randBetween(
        config.accountDelayMinSec * 1000,
        config.accountDelayMaxSec * 1000
      );
      await sleep(delay);
    }
  }

  saveState(state);
  return outcome;
}

// Inicio de la primera franja del día siguiente (para reanudar tras el tope diario).
function tomorrowFirstWindow(now, windows) {
  const w = windows[0];
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  d.setMinutes(w.start);
  return d;
}

async function runWatch() {
  const windows = parseWindows(config.checkWindows);
  if (windows.length === 0) {
    console.error(
      `[${ts()}] ⚠️  CHECK_WINDOWS no es válido: "${config.checkWindows}". ` +
        'Usa el formato HH:MM-HH:MM,HH:MM-HH:MM'
    );
    process.exit(1);
  }

  console.log(`[${ts()}] Vigilancia activa. Ctrl+C para salir.`);
  console.log(`[${ts()}]   Franjas:     ${config.checkWindows}`);
  console.log(
    `[${ts()}]   Hueco:       ${config.minGapMinutes}-${config.maxGapMinutes} min (aleatorio)`
  );
  console.log(`[${ts()}]   Tope diario: ${config.dailyMax} comprobaciones`);

  let stopping = false;
  let wakeUp = null; // resuelve la espera antes de tiempo
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
      const timer = setTimeout(resolve, Math.max(0, ms));
      wakeUp = () => {
        clearTimeout(timer);
        resolve();
      };
    });

  let backoffUntil = 0; // epoch ms; mientras estemos en pausa por 429/captcha
  let dayKey = new Date().toDateString();
  let dailyCount = 0;

  while (!stopping) {
    const now = new Date();

    // Reinicio del contador diario al cambiar de día.
    if (now.toDateString() !== dayKey) {
      dayKey = now.toDateString();
      dailyCount = 0;
    }

    // ¿En pausa por limitación de TikTok?
    if (now.getTime() < backoffUntil) {
      console.log(
        `[${ts()}] En pausa (backoff) hasta ${fmtClock(new Date(backoffUntil))}.`
      );
      await waitInterruptible(backoffUntil - now.getTime());
      continue;
    }

    let next;
    if (dailyCount >= config.dailyMax) {
      // Tope diario alcanzado: esperamos a la primera franja de mañana.
      next = tomorrowFirstWindow(now, windows);
      console.log(
        `[${ts()}] Tope diario (${config.dailyMax}) alcanzado. Reanudo ${fmtClock(next)}.`
      );
    } else if (isWithinWindow(now, windows)) {
      // Estamos dentro de franja: toca comprobar.
      let outcome = 'ok';
      try {
        outcome = await runCheck();
      } catch (err) {
        console.error(`[${ts()}] Error inesperado en la ronda: ${err.message}`);
      }
      dailyCount++;

      if (outcome === 'rate-limited') {
        const hours =
          config.backoffHoursMin +
          Math.random() * (config.backoffHoursMax - config.backoffHoursMin);
        backoffUntil = Date.now() + hours * 3600 * 1000;
        console.warn(
          `[${ts()}] ⚠️  TikTok nos está limitando. Pausa de ${hours.toFixed(
            1
          )} h hasta ${fmtClock(new Date(backoffUntil))}.`
        );
        continue;
      }

      next = nextRunTime(now, windows, {
        minGapMinutes: config.minGapMinutes,
        maxGapMinutes: config.maxGapMinutes,
      });
    } else {
      // Fuera de franja: esperar al próximo inicio (con ligero desfase aleatorio).
      next = nextRunTime(now, windows, {
        minGapMinutes: config.minGapMinutes,
        maxGapMinutes: config.maxGapMinutes,
      });
    }

    if (stopping) break;
    console.log(`[${ts()}] Próxima comprobación: ${fmtClock(next)}`);
    await waitInterruptible(next.getTime() - Date.now());
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
  npm run watch              Vigila dentro de las franjas horarias (CHECK_WINDOWS)
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
