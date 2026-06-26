#!/usr/bin/env bash
#
# Instala tiktok-block-monitor como servicio systemd de usuario.
#
# Uso:
#   ./deploy/install-systemd.sh            # modo watch (proceso continuo)
#   ./deploy/install-systemd.sh timer      # modo timer (comprobación periódica)
#   ./deploy/install-systemd.sh uninstall  # desinstala todo
#
# Requisitos: haber ejecutado antes `npm install`, `npx playwright install
# chromium` y `npm run login` para tener la sesión guardada.

set -euo pipefail

MODE="${1:-watch}"

# Rutas absolutas del proyecto.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
NODE="$(command -v node)"
USER_NAME="$(id -un)"
UNIT_DIR="$HOME/.config/systemd/user"

if [[ -z "$NODE" ]]; then
  echo "No se encontró 'node' en el PATH." >&2
  exit 1
fi

mkdir -p "$UNIT_DIR" "$DIR/data"

render() {
  # render <plantilla> <destino>
  sed -e "s#__USER__#$USER_NAME#g" \
      -e "s#__DIR__#$DIR#g" \
      -e "s#__NODE__#$NODE#g" \
      "$1" >"$2"
}

case "$MODE" in
  watch)
    render "$SCRIPT_DIR/tiktok-block-monitor.service" \
           "$UNIT_DIR/tiktok-block-monitor.service"
    systemctl --user daemon-reload
    systemctl --user enable --now tiktok-block-monitor.service
    echo "✅ Servicio 'watch' instalado y arrancado."
    echo "   Logs:   journalctl --user -u tiktok-block-monitor -f"
    echo "   Estado: systemctl --user status tiktok-block-monitor"
    ;;

  timer)
    render "$SCRIPT_DIR/tiktok-block-monitor-check.service" \
           "$UNIT_DIR/tiktok-block-monitor-check.service"
    render "$SCRIPT_DIR/tiktok-block-monitor-check.timer" \
           "$UNIT_DIR/tiktok-block-monitor-check.timer"
    systemctl --user daemon-reload
    systemctl --user enable --now tiktok-block-monitor-check.timer
    echo "✅ Timer instalado y activado."
    echo "   Próximas ejecuciones: systemctl --user list-timers tiktok-block-monitor-check"
    echo "   Logs: journalctl --user -u tiktok-block-monitor-check -f"
    ;;

  uninstall)
    systemctl --user disable --now tiktok-block-monitor.service 2>/dev/null || true
    systemctl --user disable --now tiktok-block-monitor-check.timer 2>/dev/null || true
    rm -f "$UNIT_DIR/tiktok-block-monitor.service" \
          "$UNIT_DIR/tiktok-block-monitor-check.service" \
          "$UNIT_DIR/tiktok-block-monitor-check.timer"
    systemctl --user daemon-reload
    echo "🗑️  Servicios desinstalados."
    ;;

  *)
    echo "Modo desconocido: $MODE (usa: watch | timer | uninstall)" >&2
    exit 1
    ;;
esac

# Permite que los servicios de usuario sigan corriendo sin sesión iniciada.
if [[ "$MODE" != "uninstall" ]]; then
  if command -v loginctl >/dev/null 2>&1; then
    loginctl enable-linger "$USER_NAME" 2>/dev/null \
      && echo "ℹ️  Linger activado: el servicio seguirá tras cerrar sesión." \
      || echo "ℹ️  (Opcional) Ejecuta 'sudo loginctl enable-linger $USER_NAME' para que corra sin sesión."
  fi
fi
