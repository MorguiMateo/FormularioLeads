import { launchContext, launchAnonContext } from './browser.js';
import { config } from './config.js';
export { STATUS_LABEL } from './constants.js';

// Frases (multi-idioma) que TikTok muestra cuando un perfil no es visible.
const NOT_FOUND_MARKERS = [
  "couldn't find this account",
  'could not find this account',
  'no se ha podido encontrar la cuenta',
  'no se pudo encontrar esta cuenta',
  'esta cuenta no existe',
  'cuenta no encontrada',
];

const SELECTORS_PRESENT = [
  '[data-e2e="user-title"]',
  '[data-e2e="user-subtitle"]',
  '[data-e2e="followers-count"]',
];

// Señales de que TikTok nos está limitando (captcha / verificación / 429).
const RATE_LIMIT_MARKERS = [
  'rate limit exceeded',
  'access denied',
  'verify to continue',
  'security check',
  'too many requests',
  'verificación de seguridad',
  'comprueba que eres humano',
];

const CAPTCHA_SELECTORS = [
  '.captcha_verify_container',
  '#captcha-verify-container',
  '[id*="captcha"]',
  'div[class*="captcha"]',
];

function randBetween(min, max) {
  return Math.floor(min + Math.random() * (max - min));
}

/**
 * Imita brevemente comportamiento humano: espera variable, un par de
 * movimientos de ratón y un scroll suave. Reduce la huella de automatización.
 */
async function humanize(page) {
  await page.waitForTimeout(randBetween(1800, 4200));
  try {
    const w = 1280;
    const h = 800;
    await page.mouse.move(randBetween(50, w - 50), randBetween(50, h - 50));
    await page.waitForTimeout(randBetween(200, 700));
    await page.mouse.move(randBetween(50, w - 50), randBetween(50, h - 50));
    await page.evaluate((y) => window.scrollBy(0, y), randBetween(300, 900));
    await page.waitForTimeout(randBetween(400, 1200));
  } catch {
    // Movimientos cosméticos: si fallan, no es crítico.
  }
}

/**
 * Determina el estado de un perfil en la página actual:
 *  - 'exists'       : el perfil se ve correctamente.
 *  - 'notfound'     : TikTok dice que no puede encontrar la cuenta.
 *  - 'rate-limited' : captcha / verificación / 429 -> nos están limitando.
 *  - 'unknown'      : no se pudo determinar (error de red, layout nuevo).
 */
async function detectProfileState(page, httpStatus) {
  // 0) ¿Nos están limitando? (captcha, verificación o 429)
  if (httpStatus === 429) return 'rate-limited';
  for (const sel of CAPTCHA_SELECTORS) {
    if (await page.$(sel)) return 'rate-limited';
  }

  // 1) ¿Aparece la cabecera del perfil?
  for (const sel of SELECTORS_PRESENT) {
    const el = await page.$(sel);
    if (el) {
      const txt = (await el.textContent())?.trim();
      if (txt) return 'exists';
    }
  }

  // 2) Texto de la página: ¿limitación o "no encontrado"?
  const bodyText = (await page.evaluate(() => document.body.innerText || ''))
    .toLowerCase();
  if (RATE_LIMIT_MARKERS.some((m) => bodyText.includes(m))) {
    return 'rate-limited';
  }
  if (NOT_FOUND_MARKERS.some((m) => bodyText.includes(m))) {
    return 'notfound';
  }

  // 3) Datos embebidos por TikTok en el HTML.
  const hasUserData = await page.evaluate(() => {
    const el = document.getElementById(
      '__UNIVERSAL_DATA_FOR_REHYDRATION__'
    );
    if (!el) return false;
    return el.textContent.includes('"userInfo"');
  });
  if (hasUserData) return 'exists';

  return 'unknown';
}

async function gotoProfile(page, username) {
  const response = await page.goto(`https://www.tiktok.com/@${username}`, {
    waitUntil: 'domcontentloaded',
    timeout: 45000,
  });
  const httpStatus = response ? response.status() : null;

  if (config.humanize) {
    await humanize(page);
  } else {
    // Margen mínimo para que cargue el contenido renderizado por JS.
    await page.waitForTimeout(2500);
  }
  return detectProfileState(page, httpStatus);
}

/**
 * Comprueba el estado de bloqueo de un único usuario usando el método
 * comparativo: vemos el perfil con tu sesión y sin ella.
 *
 *  - anónimo existe + tu sesión NO lo ve  => 'blocked' (te ha bloqueado)
 *  - ambos lo ven                          => 'visible' (no estás bloqueado)
 *  - anónimo no lo encuentra               => 'unavailable' (cuenta borrada/baneada)
 */
export async function checkUser(username, { headless = config.headless } = {}) {
  const result = {
    username,
    status: 'unknown',
    anonymous: 'unknown',
    authenticated: 'unknown',
    sessionValid: null,
    checkedAt: new Date().toISOString(),
  };

  // --- Paso 1: vista anónima (sin sesión) ---
  {
    const { browser, context } = await launchAnonContext({ headless });
    const page = await context.newPage();
    try {
      result.anonymous = await gotoProfile(page, username);
    } catch (err) {
      result.anonymous = 'unknown';
      result.error = `anon: ${err.message}`;
    } finally {
      await browser.close();
    }
  }

  // --- Paso 2: vista autenticada (tu sesión) ---
  {
    const { browser, context, hasSession } = await launchContext({ headless });
    result.sessionValid = hasSession;
    const page = await context.newPage();
    try {
      result.authenticated = await gotoProfile(page, username);
      // Validación extra: ¿la sesión sigue activa?
      if (hasSession) {
        const loggedIn = await page.evaluate(() => {
          const el = document.getElementById(
            '__UNIVERSAL_DATA_FOR_REHYDRATION__'
          );
          if (!el) return null;
          return el.textContent.includes('"isLogin":true');
        });
        if (loggedIn === false) result.sessionValid = false;
      }
    } catch (err) {
      result.authenticated = 'unknown';
      result.error = `${result.error ? result.error + '; ' : ''}auth: ${err.message}`;
    } finally {
      await browser.close();
    }
  }

  result.status = resolveStatus(result);
  return result;
}

function resolveStatus({ anonymous, authenticated, sessionValid }) {
  if (anonymous === 'rate-limited' || authenticated === 'rate-limited') {
    return 'rate-limited';
  }
  if (sessionValid === false) return 'session-expired';
  if (anonymous === 'notfound') return 'unavailable';
  if (anonymous === 'exists' && authenticated === 'notfound') return 'blocked';
  if (anonymous === 'exists' && authenticated === 'exists') return 'visible';
  return 'unknown';
}
