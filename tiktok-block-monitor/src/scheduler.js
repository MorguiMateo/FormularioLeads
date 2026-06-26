/**
 * Planificador con ventanas horarias y aleatoriedad.
 *
 * Las comprobaciones solo ocurren dentro de las franjas configuradas
 * (p. ej. "08:00-12:00,18:00-24:00") y a horas aleatorias dentro de ellas,
 * para no dejar un patrón de tiempo uniforme (la principal delación ante
 * los sistemas anti-bot de TikTok).
 */

/** Convierte "08:00-12:00,18:00-24:00" en [{start, end}] (minutos desde 00:00). */
export function parseWindows(raw) {
  const windows = [];
  for (const part of String(raw).split(',')) {
    const m = part.trim().match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
    if (!m) continue;
    const start = Number(m[1]) * 60 + Number(m[2]);
    const end = Number(m[3]) * 60 + Number(m[4]);
    if (end > start) windows.push({ start, end });
  }
  // Orden cronológico para calcular bien la siguiente franja.
  return windows.sort((a, b) => a.start - b.start);
}

function minutesOfDay(date) {
  return date.getHours() * 60 + date.getMinutes();
}

/** ¿La fecha cae dentro de alguna franja permitida? */
export function isWithinWindow(date, windows) {
  const mins = minutesOfDay(date);
  return windows.some((w) => mins >= w.start && mins < w.end);
}

/** Fecha del inicio de franja `startMin` para `date` + `dayOffset` días. */
function windowStartDate(date, startMin, dayOffset) {
  const d = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() + dayOffset,
    0,
    0,
    0,
    0
  );
  d.setMinutes(startMin);
  return d;
}

/** Próximo inicio de franja estrictamente posterior a `now`. */
export function nextWindowStart(now, windows) {
  for (let dayOffset = 0; dayOffset <= 1; dayOffset++) {
    for (const w of windows) {
      const start = windowStartDate(now, w.start, dayOffset);
      if (start > now) return start;
    }
  }
  // Salvaguarda (no debería ocurrir con franjas válidas).
  return new Date(now.getTime() + 60 * 60 * 1000);
}

function randBetween(min, max) {
  return min + Math.random() * (max - min);
}

/**
 * Calcula el instante de la PRÓXIMA comprobación.
 *  - Si un hueco aleatorio cae dentro de una franja, se usa esa hora.
 *  - Si caería fuera, se salta al inicio de la siguiente franja (+ pequeño
 *    desfase aleatorio para no empezar siempre en el minuto exacto).
 */
export function nextRunTime(
  now,
  windows,
  { minGapMinutes, maxGapMinutes, startJitterMinutes = 12 } = {}
) {
  if (windows.length === 0) {
    // Sin franjas válidas: comportamiento degradado, hueco simple.
    return new Date(now.getTime() + randBetween(minGapMinutes, maxGapMinutes) * 60000);
  }

  const gapMs = randBetween(minGapMinutes, maxGapMinutes) * 60000;
  const candidate = new Date(now.getTime() + gapMs);

  if (isWithinWindow(candidate, windows)) return candidate;

  const start = nextWindowStart(now, windows);
  const jitterMs = Math.random() * startJitterMinutes * 60000;
  return new Date(start.getTime() + jitterMs);
}
