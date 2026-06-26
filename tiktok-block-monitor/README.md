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
npm run watch     # comprueba en bucle cada INTERVAL_MINUTES
```

## Notificaciones

Si rellenas `NOTIFY_WEBHOOK_URL` en `.env` con un webhook de Discord o Slack,
recibirás un mensaje cada vez que alguien te bloquee o te desbloquee.

## Configuración (.env)

| Variable | Descripción | Por defecto |
|----------|-------------|-------------|
| `TARGETS` | Usuarios a vigilar, separados por comas | (vacío) |
| `HEADLESS` | `true` ejecuta sin ventana; `false` la muestra | `true` |
| `INTERVAL_MINUTES` | Intervalo del modo `watch` | `30` |
| `NOTIFY_WEBHOOK_URL` | Webhook para notificaciones | (vacío) |
| `USER_AGENT` | User-Agent del navegador | Chrome de escritorio |

## Estructura

```
tiktok-block-monitor/
├── src/
│   ├── index.js     CLI (check, watch, list, add, remove)
│   ├── login.js     Guarda tu sesión de TikTok
│   ├── browser.js   Lanza Chromium (con y sin sesión)
│   ├── scraper.js   Detección de estado por método comparativo
│   ├── store.js     Persistencia del estado e historial
│   ├── targets.js   Gestión de la lista de cuentas
│   ├── notify.js    Notificaciones (consola + webhook)
│   └── config.js    Carga de configuración y .env
└── data/            Estado guardado (generado, ignorado por git)
```

## Aviso legal

Esta herramienta es para uso personal y educativo. Automatizar TikTok puede ir
en contra de sus Términos de Servicio; úsala bajo tu propia responsabilidad y
solo con tu propia cuenta.
