import fs from 'node:fs';
import { ensureDataDir, STATE_FILE } from './config.js';

/**
 * El estado persistido tiene la forma:
 * {
 *   "usuario": { "status": "visible", "checkedAt": "...", "history": [...] }
 * }
 */
export function loadState() {
  if (!fs.existsSync(STATE_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return {};
  }
}

export function saveState(state) {
  ensureDataDir();
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

/**
 * Registra un resultado y devuelve la transición detectada (o null).
 * transition = { from, to } cuando el estado cambió respecto a la última vez.
 */
export function recordResult(state, result) {
  const prev = state[result.username];
  const transition =
    prev && prev.status !== result.status
      ? { from: prev.status, to: result.status }
      : null;

  const history = (prev?.history ?? []).slice(-49);
  history.push({ status: result.status, at: result.checkedAt });

  state[result.username] = {
    status: result.status,
    anonymous: result.anonymous,
    authenticated: result.authenticated,
    checkedAt: result.checkedAt,
    history,
  };

  return transition;
}
