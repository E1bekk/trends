// Отправщик уведомлений: берёт из очереди письма и шлёт их ботом в Telegram.
// Запускается по расписанию. Если Telegram не ответил — письмо останется
// в очереди и уйдёт со следующего захода (но не больше трёх попыток).
const db = require('../api/_db.js');

const TOKEN = String(process.env.BOT_TOKEN || '').trim();
const BOT = String(process.env.BOT_USERNAME || 'scroll_app_bot').replace(/^@/, '');
const APP = String(process.env.APP_SHORT || 'app');
const PACK = 30;

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function send(to, text, button, param) {
  const body = {
    chat_id: to, text, parse_mode: 'HTML', disable_notification: false,
    ...(button ? { reply_markup: { inline_keyboard: [[{ text: button, url: `https://t.me/${BOT}/${APP}${param ? '?startapp=' + encodeURIComponent(param) : ''}` }]] } } : {})
  };
  const r = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: 'POST', signal: AbortSignal.timeout(12000),
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  const j = await r.json().catch(() => null);
  if (j && j.ok) return { ok: true };
  const why = (j && j.description) || `HTTP ${r.status}`;
  // человек заблокировал бота — больше ему не пишем
  if (/bot was blocked|user is deactivated|chat not found/i.test(why)) {
    await db.rpc('notify_set', { p_user: to, p_can: false, p_want: null }).catch(() => {});
  }
  return { ok: false, why };
}

async function main() {
  if (!TOKEN) throw new Error('не задан BOT_TOKEN');
  await db.check();

  let sent = 0, failed = 0;
  const rows = await db.rpc('outbox_take', { p_limit: PACK }) || [];
  for (const m of rows) {
    const r = await send(m.user_id, m.body, m.button, m.param);
    if (r.ok) sent++; else failed++;
    await db.rpc('outbox_done', { p_id: m.id, p_error: r.ok ? null : String(r.why).slice(0, 200) });
    await sleep(60);                      // Telegram не любит больше ~30 сообщений в секунду
  }

  const line = `Писем в очереди: ${rows.length} · отправлено: ${sent} · не ушло: ${failed}`;
  console.log(line);
  if (process.env.GITHUB_STEP_SUMMARY) {
    require('fs').appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Уведомления\n\n${line}\n`);
  }
}

main().catch(e => { console.error('Не получилось:', e.message); process.exit(1); });
