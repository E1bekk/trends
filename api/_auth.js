// Кто именно к нам пришёл. Telegram подписывает данные о пользователе ключом бота —
// проверяем подпись, иначе кто угодно смог бы лайкать и писать комментарии от чужого имени.
const crypto = require('crypto');
const MAX_AGE = 24 * 3600;        // подпись старше суток не принимаем

// Возвращает { user } либо { why } — внятную причину отказа.
// Без причины невозможно понять, что чинить: ключ бота, способ открытия или время.
function inspect(initData, token = process.env.BOT_TOKEN) {
  if (!token) return { why: 'на сервере не задан BOT_TOKEN' };
  if (!/^\d{6,12}:[A-Za-z0-9_-]{30,}$/.test(token)) return { why: 'BOT_TOKEN на сервере не похож на токен бота' };
  if (!initData) return { why: 'Telegram не передал данные — приложение открыто как обычная ссылка, а не как мини-приложение' };
  const q = new URLSearchParams(initData);
  const hash = q.get('hash');
  if (!hash) return { why: 'в данных от Telegram нет подписи' };
  q.delete('hash');
  q.delete('signature');
  const check = [...q.entries()].map(([k, v]) => `${k}=${v}`).sort().join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
  const mine = crypto.createHmac('sha256', secret).update(check).digest('hex');
  let a, b;
  try { a = Buffer.from(mine, 'hex'); b = Buffer.from(hash, 'hex'); } catch (e) { return { why: 'подпись испорчена' }; }
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b))
    return { why: 'подпись не сошлась — скорее всего BOT_TOKEN на сервере не от этого бота' };
  const age = Math.floor(Date.now() / 1000) - Number(q.get('auth_date') || 0);
  if (!(age >= -300 && age < MAX_AGE)) return { why: 'подпись устарела — закрой и открой приложение заново' };
  let user = null;
  try { user = JSON.parse(q.get('user') || 'null'); } catch (e) { return { why: 'не разобрать данные пользователя' }; }
  if (!user || !user.id) return { why: 'Telegram не сообщил, кто пользователь' };
  return { user: {
    id: Number(user.id),
    name: [user.first_name, user.last_name].filter(Boolean).join(' ').slice(0, 64) || 'Гость',
    photo: user.photo_url || null,
    lang: (user.language_code || 'ru').slice(0, 5),
    start: q.get('start_param') || ''
  } };
}

const verify = (initData, token) => (inspect(initData, token).user || null);

// Достаём пользователя из запроса. Приложение шлёт подпись заголовком X-Init-Data.
function rawInit(req) {
  const raw = req.headers['x-init-data'] || (req.body && req.body.initData) || '';
  return Array.isArray(raw) ? raw[0] : raw;
}
function who(req) { return inspect(rawInit(req)).user || null; }
// почему не пустили — текст для сообщения об ошибке
function whyNot(req) { return inspect(rawInit(req)).why || 'неизвестно'; }

// Короткий код для ссылки на полку или комнату: без похожих букв, чтобы не путать на слух
const ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz';
const code = (n = 7) => Array.from(crypto.randomBytes(n)).map(b => ALPHABET[b % ALPHABET.length]).join('');

module.exports = { verify, inspect, who, whyNot, code };
