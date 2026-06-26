# tiktok-block-monitor

Proyecto Node.js para **detectar si una cuenta de TikTok te ha bloqueado o
desbloqueado**. Vigila uno o varios usuarios y te avisa cuando cambia el
estado (por consola y, opcionalmente, por webhook de Discord/Slack).

## ¿Cómo lo detecta?

TikTok no tiene una API pública que diga "fulano te bloqueó", así que se usa un
**método comparativo** con un navegador automatizado (Playwright):

1. Se abre el perfil **sin tu sesión** (anónimo).
2. Se abre el mismo perfil **con tu sesión** iniciada.
3. Se comparan los resultados:

| Anónimo | Con tu sesión | Conclusión |
|---------|---------------|------------|
| Se ve   | Se ve         | `visible` — no estás bloqueado |
| Se ve   | "No se encuentra la cuenta" | `blocked` — **te ha bloqueado** |
| No se ve| —             | `unavailable` — cuenta borrada/suspendida |

Al detectar un cambio respecto a la comprobación anterior (p. ej. de `blocked`
a `visible`), se interpreta como un **desbloqueo** y se te notifica.

> ⚠️ Es una heurística basada en cómo se comporta la web de TikTok. Si TikTok
> cambia su interfaz, puede que haya que actualizar los selectores en
> `src/scraper.js`. Úsalo solo con tu propia cuenta y de forma responsable;
> hacer demasiadas peticiones seguidas puede provocar captchas o bloqueos
> temporales por parte de TikTok.

## Requisitos

- Node.js 18 o superior.
- Playwright (se instala con las dependencias). En un entorno nuevo, instala el
  navegador con `npx playwright install chromium`.

## Instalación

```bash
cd tiktok-block-monitor
npm install
npx playwright install chromium   # descarga Chromium si no lo tienes
cp .env.example .env              # edita .env a tu gusto
```

## Uso

### 1. Inicia sesión (solo la primera vez)

```bash
npm run login
```

Se abre una ventana de Chromium. Inicia sesión en TikTok normalmente y, cuando
veas tu perfil, vuelve a la terminal y pulsa **ENTER**. La sesión se guarda en
`storage-state.json` (este archivo es privado: está en `.gitignore`).

### 2. Añade las cuentas a vigilar

```bash
npm run add -- nombre_de_usuario
npm run add -- otra_cuenta
```

También puedes definirlas en `.env` con `TARGETS=usuario1,usuario2`.

### 3. Comprueba

```bash
npm run check     # una comprobación
npm run list      # muestra el último estado conocido
npm run watch     # vigila dentro de las franjas horarias (recomendado)
```

## Anti-detección (importante)

TikTok detecta el scraping sobre todo por **patrones**: timing uniforme,
ráfagas de peticiones, captchas ignorados e IPs de datacenter. El modo `watch`
incorpora varias defensas para pasar desapercibido:

- **Franjas horarias** (`CHECK_WINDOWS`): solo comprueba dentro de las horas que
  definas (por defecto `08:00-12:00` y `18:00-24:00`).
- **Timing aleatorio**: cada comprobación cae a una hora distinta dentro de la
  franja, con huecos de `MIN_GAP_MINUTES`–`MAX_GAP_MINUTES` (nada de intervalos
  fijos, que son la mayor delación).
- **Tope diario** (`DAILY_MAX`): nunca supera N comprobaciones al día.
- **Retardo aleatorio entre cuentas** (`ACCOUNT_DELAY_*`): evita ráfagas.
- **Circuit breaker**: si detecta un **429 o captcha**, se pausa
  `BACKOFF_HOURS_MIN`–`BACKOFF_HOURS_MAX` horas automáticamente.
- **Comportamiento humano** (`HUMANIZE`): esperas variables, scroll y ratón.

Recomendaciones operativas que **no** dependen del código:

1. Ejecútalo desde **tu IP de casa** (residencial), nunca desde un VPS/datacenter.
2. Usa `HEADLESS=false` para reducir la huella de navegador automatizado.
3. Vigila **pocas cuentas** (< ~15); cada cuenta son 2 cargas de página.

## Modo daemon (segundo plano)

Para que vigile solo, sin tener una terminal abierta, hay dos opciones con
**systemd** (Linux). Requisito previo: haber ejecutado `npm run login` y tener
al menos una cuenta con `npm run add`.

### Opción A — servicio continuo (`watch`, **recomendada**)

Un proceso que respeta las franjas, el timing aleatorio, el tope diario y el
backoff (toda la lógica anti-detección):

```bash
npm run daemon:install        # instala y arranca el servicio de usuario
journalctl --user -u tiktok-block-monitor -f   # ver logs en vivo
```

### Opción B — timer periódico

systemd lanza comprobaciones puntuales solo en las horas de las franjas, con un
desfase aleatorio (no hay proceso permanente, pero la aleatoriedad es más
gruesa y **no aplica el tope diario ni el backoff**, que son del modo `watch`):

```bash
npm run daemon:timer
systemctl --user list-timers tiktok-block-monitor-check   # próxima ejecución
```

Para ajustar las horas, edita `OnCalendar` en
`deploy/tiktok-block-monitor-check.timer` y reinstala.

### Desinstalar

```bash
npm run daemon:uninstall
```

> Los servicios se instalan como **servicios de usuario** (`systemctl --user`),
> así pueden leer tu sesión guardada (`storage-state.json`). El script intenta
> activar *linger* para que sigan corriendo aunque cierres sesión; si pide
> permisos, ejecuta `sudo loginctl enable-linger $USER`.

### Alternativa: cron

Si prefieres cron en vez de systemd, añade a tu crontab (`crontab -e`):

```cron
*/30 * * * * cd /ruta/a/tiktok-block-monitor && /usr/bin/node src/index.js check >> data/daemon.log 2>&1
```

Los logs del daemon se guardan en `data/daemon.log`.

## Notificaciones

Si rellenas `NOTIFY_WEBHOOK_URL` en `.env` con un webhook de Discord o Slack,
recibirás un mensaje cada vez que alguien te bloquee o te desbloquee.

## Configuración (.env)

| Variable | Descripción | Por defecto |
|----------|-------------|-------------|
| `TARGETS` | Usuarios a vigilar, separados por comas | (vacío) |
| `HEADLESS` | `true` ejecuta sin ventana; `false` la muestra | `true` |
| `CHECK_WINDOWS` | Franjas horarias permitidas (hora local; 24:00 = medianoche) | `08:00-12:00,18:00-24:00` |
| `MIN_GAP_MINUTES` / `MAX_GAP_MINUTES` | Hueco aleatorio entre comprobaciones | `60` / `150` |
| `DAILY_MAX` | Tope de comprobaciones por día | `8` |
| `ACCOUNT_DELAY_MIN_SECONDS` / `ACCOUNT_DELAY_MAX_SECONDS` | Retardo aleatorio entre cuentas | `20` / `60` |
| `BACKOFF_HOURS_MIN` / `BACKOFF_HOURS_MAX` | Pausa al detectar 429/captcha | `6` / `12` |
| `HUMANIZE` | Simular comportamiento humano | `true` |
| `NOTIFY_WEBHOOK_URL` | Webhook para notificaciones | (vacío) |
| `USER_AGENT` | User-Agent del navegador | Chrome de escritorio |

## Estructura

```
tiktok-block-monitor/
├── src/
│   ├── index.js     CLI (check, watch, list, add, remove)
│   ├── login.js     Guarda tu sesión de TikTok
│   ├── browser.js   Lanza Chromium (con y sin sesión)
│   ├── scraper.js   Detección de estado + humanización + 429/captcha
│   ├── scheduler.js Franjas horarias y timing aleatorio
│   ├── store.js     Persistencia del estado e historial
│   ├── targets.js   Gestión de la lista de cuentas
│   ├── notify.js    Notificaciones (consola + webhook)
│   └── config.js    Carga de configuración y .env
├── deploy/          Unidades systemd + script de instalación del daemon
└── data/            Estado y logs (generado, ignorado por git)
```

## Aviso legal

Esta herramienta es para uso personal y educativo. Automatizar TikTok puede ir
en contra de sus Términos de Servicio; úsala bajo tu propia responsabilidad y
solo con tu propia cuenta.
