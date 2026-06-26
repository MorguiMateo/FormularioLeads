import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const ROOT = path.resolve(__dirname, '..');
export const DATA_DIR = path.join(ROOT, 'data');
export const STORAGE_STATE = path.join(ROOT, 'storage-state.json');
export const STATE_FILE = path.join(DATA_DIR, 'state.json');

// Carga muy simple de un archivo .env (sin dependencias externas).
function loadDotEnv() {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf8');
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadDotEnv();

function parseTargets(raw) {
  if (!raw) return [];
  return raw
    .split(',')
    .map((t) => t.trim().replace(/^@/, '').toLowerCase())
    .filter(Boolean);
}

export const config = {
  targets: parseTargets(process.env.TARGETS),
  headless: String(process.env.HEADLESS ?? 'true').toLowerCase() !== 'false',
  intervalMinutes: Number(process.env.INTERVAL_MINUTES ?? 30),
  notifyWebhookUrl: process.env.NOTIFY_WEBHOOK_URL || '',
  userAgent:
    process.env.USER_AGENT ||
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
};

export function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}
