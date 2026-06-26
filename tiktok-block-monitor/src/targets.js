import fs from 'node:fs';
import path from 'node:path';
import { config, DATA_DIR, ensureDataDir } from './config.js';

const TARGETS_FILE = path.join(DATA_DIR, 'targets.json');

function normalize(name) {
  return name.trim().replace(/^@/, '').toLowerCase();
}

/**
 * Lista efectiva de usuarios a vigilar: la unión de los definidos en .env
 * (TARGETS) y los añadidos manualmente con el comando `add`.
 */
export function getTargets() {
  let saved = [];
  if (fs.existsSync(TARGETS_FILE)) {
    try {
      saved = JSON.parse(fs.readFileSync(TARGETS_FILE, 'utf8'));
    } catch {
      saved = [];
    }
  }
  return [...new Set([...config.targets, ...saved.map(normalize)])];
}

export function addTarget(name) {
  const username = normalize(name);
  if (!username) throw new Error('Nombre de usuario vacío.');
  const current = getTargets();
  if (current.includes(username)) return false;
  ensureDataDir();
  const saved = fs.existsSync(TARGETS_FILE)
    ? JSON.parse(fs.readFileSync(TARGETS_FILE, 'utf8'))
    : [];
  saved.push(username);
  fs.writeFileSync(TARGETS_FILE, JSON.stringify(saved, null, 2));
  return true;
}

export function removeTarget(name) {
  const username = normalize(name);
  if (!fs.existsSync(TARGETS_FILE)) return false;
  const saved = JSON.parse(fs.readFileSync(TARGETS_FILE, 'utf8')).map(normalize);
  const next = saved.filter((u) => u !== username);
  fs.writeFileSync(TARGETS_FILE, JSON.stringify(next, null, 2));
  return next.length !== saved.length;
}
