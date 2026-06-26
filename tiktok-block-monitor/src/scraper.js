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

/**
 * Determina el estado de un perfil en la página actual:
 *  - 'exists'   : el perfil se ve correctamente.
 *  - 'notfound' : TikTok dice que no puede encontrar la cuenta.
 *  - 'unknown'  : no se pudo determinar (captcha, error de red, layout nuevo).
 */
async function detectProfileState(page) {
  // 1) ¿Aparece la cabecera del perfil?
  for (const sel of SELECTORS_PRESENT) {
    const el = await page.$(sel);
    if (el) {
      const txt = (await el.textContent())?.trim();
      if (txt) return 'exists';
    }
  }

  // 2) ¿Aparece algún mensaje de "no encontrado"?
  const bodyText = (await page.evaluate(() => document.body.innerText || ''))
    .toLowerCase();
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
  await page.goto(`https://www.tiktok.com/@${username}`, {
    waitUntil: 'domcontentloaded',
    timeout: 45000,
  });
  // Damos un margen para que cargue el contenido renderizado por JS.
  await page.waitForTimeout(2500);
  return detectProfileState(page);
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
  if (sessionValid === false) return 'session-expired';
  if (anonymous === 'notfound') return 'unavailable';
  if (anonymous === 'exists' && authenticated === 'notfound') return 'blocked';
  if (anonymous === 'exists' && authenticated === 'exists') return 'visible';
  return 'unknown';
}
