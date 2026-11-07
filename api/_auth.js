// Кто именно к нам пришёл. Telegram подписывает данные о пользователе ключом бота —
// проверяем подпись, иначе кто угодно смог бы лайкать и писать комментарии от чужого имени.
const crypto = require('crypto');
const MAX_AGE = 24 * 3600;        // подпись старше суток не принимаем

function verify(initData, token = process.env.BOT_TOKEN) {
  if (!initData || !token) return null;
  const q = new URLSearchParams(initData);
  const hash = q.get('hash');
  if (!hash) return null;
  q.delete('hash');
  q.delete('signature');
  const check = [...q.entries()].map(([k, v]) => `${k}=${v}`).sort().join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
  const mine = crypto.createHmac('sha256', secret).update(check).digest('hex');
  const a = Buffer.from(mine, 'hex'), b = Buffer.from(hash, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const age = Math.floor(Date.now() / 1000) - Number(q.get('auth_date') || 0);
  if (!(age >= -300 && age < MAX_AGE)) return null;
  let user = null;
  try { user = JSON.parse(q.get('user') || 'null'); } catch (e) { return null; }
  if (!user || !user.id) return null;
  return {
    id: Number(user.id),
    name: [user.first_name, user.last_name].filter(Boolean).join(' ').slice(0, 64) || 'Гость',
    photo: user.photo_url || null,
    lang: (user.language_code || 'ru').slice(0, 5),
    start: q.get('start_param') || ''
  };
}

// Достаём пользователя из запроса. Приложение шлёт подпись заголовком X-Init-Data.
function who(req) {
  const raw = req.headers['x-init-data'] || (req.body && req.body.initData) || '';
  return verify(Array.isArray(raw) ? raw[0] : raw);
}

// Короткий код для ссылки на полку или комнату: без похожих букв, чтобы не путать на слух
const ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz';
const code = (n = 7) => Array.from(crypto.randomBytes(n)).map(b => ALPHABET[b % ALPHABET.length]).join('');

module.exports = { verify, who, code };
