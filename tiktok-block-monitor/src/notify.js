import { config } from './config.js';
import { STATUS_LABEL } from './constants.js';

/**
 * Notifica una transición de estado por consola y, si está configurado,
 * mediante un webhook (Discord/Slack/genérico).
 */
export async function notifyTransition(username, transition) {
  const { from, to } = transition;
  let headline;
  if (to === 'blocked') {
    headline = `🚫 @${username} te ha BLOQUEADO`;
  } else if (from === 'blocked' && to === 'visible') {
    headline = `✅ @${username} te ha DESBLOQUEADO`;
  } else {
    headline = `ℹ️  @${username}: ${STATUS_LABEL[from] ?? from} → ${STATUS_LABEL[to] ?? to}`;
  }

  console.log('\n' + '─'.repeat(50));
  console.log(headline);
  console.log('─'.repeat(50) + '\n');

  if (config.notifyWebhookUrl) {
    await sendWebhook(config.notifyWebhookUrl, headline).catch((err) =>
      console.error('No se pudo enviar el webhook:', err.message)
    );
  }
}

async function sendWebhook(url, message) {
  // Discord espera { content }, Slack espera { text }. Enviamos ambos campos
  // para máxima compatibilidad con webhooks genéricos.
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: message, text: message }),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
}
