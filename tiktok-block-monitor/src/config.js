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

function num(envValue, fallback) {
  const n = Number(envValue);
  return Number.isFinite(n) ? n : fallback;
}

export const config = {
  targets: parseTargets(process.env.TARGETS),
  headless: String(process.env.HEADLESS ?? 'true').toLowerCase() !== 'false',
  notifyWebhookUrl: process.env.NOTIFY_WEBHOOK_URL || '',
  userAgent:
    process.env.USER_AGENT ||
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',

  // --- Programación con ventanas horarias y aleatoriedad ---
  // Franjas (hora local) en las que se permite comprobar. 24:00 = medianoche.
  checkWindows: process.env.CHECK_WINDOWS || '08:00-12:00,18:00-24:00',
  // Hueco aleatorio entre comprobaciones, en minutos.
  minGapMinutes: num(process.env.MIN_GAP_MINUTES, 60),
  maxGapMinutes: num(process.env.MAX_GAP_MINUTES, 150),
  // Tope de comprobaciones por día (seguridad anti-baneo).
  dailyMax: num(process.env.DAILY_MAX, 8),

  // --- Retardos entre cuentas (segundos) ---
  accountDelayMinSec: num(process.env.ACCOUNT_DELAY_MIN_SECONDS, 20),
  accountDelayMaxSec: num(process.env.ACCOUNT_DELAY_MAX_SECONDS, 60),

  // --- Backoff si TikTok nos limita (429 / captcha), en horas ---
  backoffHoursMin: num(process.env.BACKOFF_HOURS_MIN, 6),
  backoffHoursMax: num(process.env.BACKOFF_HOURS_MAX, 12),

  // Simular comportamiento humano (scroll, ratón, esperas variables).
  humanize: String(process.env.HUMANIZE ?? 'true').toLowerCase() !== 'false',
};

export function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}
