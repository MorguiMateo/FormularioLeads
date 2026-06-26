import fs from 'node:fs';
import { chromium } from 'playwright';
import { config, STORAGE_STATE } from './config.js';

/**
 * Lanza Chromium reutilizando la sesión guardada (storage-state.json).
 * Devuelve { browser, context } — recuerda cerrar el browser al terminar.
 */
export async function launchContext({ headless = config.headless } = {}) {
  const browser = await chromium.launch({
    headless,
    // En el entorno remoto Chromium ya está instalado vía PLAYWRIGHT_BROWSERS_PATH.
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
    args: ['--disable-blink-features=AutomationControlled'],
  });

  const hasSession = fs.existsSync(STORAGE_STATE);
  const context = await browser.newContext({
    userAgent: config.userAgent,
    viewport: { width: 1280, height: 800 },
    locale: 'es-ES',
    storageState: hasSession ? STORAGE_STATE : undefined,
  });

  // Pequeño parche anti-detección.
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  return { browser, context, hasSession };
}

/**
 * Lanza Chromium con un contexto limpio, SIN reutilizar tu sesión.
 * Se usa para la vista anónima del método comparativo.
 */
export async function launchAnonContext({ headless = config.headless } = {}) {
  const browser = await chromium.launch({
    headless,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
    args: ['--disable-blink-features=AutomationControlled'],
  });
  const context = await browser.newContext({
    userAgent: config.userAgent,
    viewport: { width: 1280, height: 800 },
    locale: 'es-ES',
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });
  return { browser, context };
}
