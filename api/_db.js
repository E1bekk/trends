// Тонкая обёртка над Supabase: ходим по обычному HTTP, без лишних библиотек.
// Ключи берутся из переменных окружения и НИКОГДА не лежат в коде и не попадают в GitHub.
// Адрес приводим в порядок: лишний слэш в конце или скопированный хвост /rest/v1
// — самая частая ошибка при настройке, из-за неё всё падает с непонятным 404.
const URL = String(process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
const KEY = String(process.env.SUPABASE_SERVICE_KEY || '').trim();
const ready = () => Boolean(URL && KEY);

// Текст из интернета бывает битым: оборванные эмодзи и управляющие символы.
// Postgres такую запись не принимает целиком, поэтому чистим перед отправкой.
const BAD = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
function scrub(v) {
  if (typeof v === 'string') return v.replace(BAD, '');
  if (Array.isArray(v)) return v.map(scrub);
  if (v && typeof v === 'object') { const o = {}; for (const k in v) o[k] = scrub(v[k]); return o; }
  return v;
}

async function rest(path, { method = 'GET', body, prefer } = {}) {
  if (!ready()) throw new Error('База не настроена: нет SUPABASE_URL или SUPABASE_SERVICE_KEY');
  const r = await fetch(`${URL}/rest/v1/${path}`, {
    method,
    // Ключи нового образца (sb_secret_...) — не JWT, и заголовок Authorization с ними
    // некоторые версии шлюза отвергают. Старые ключи — JWT, им Authorization нужен.
    headers: {
      apikey: KEY,
      ...(KEY.startsWith('sb_') ? {} : { Authorization: `Bearer ${KEY}` }),
      'Content-Type': 'application/json', ...(prefer ? { Prefer: prefer } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(scrub(body))
  });
  const text = await r.text();
  if (!r.ok) {
    const hint = r.status === 401 || r.status === 403 ? ' — похоже, неверный SUPABASE_SERVICE_KEY'
      : r.status === 404 ? ' — похоже, неверный SUPABASE_URL или в базе нет такой таблицы (схема не выполнена?)'
      : '';
    throw new Error(`${method} ${path} → ${r.status}${hint}. Ответ: ${text.slice(0, 200)}`);
  }
  return text ? JSON.parse(text) : null;
}

const select = (table, query = '') => rest(`${table}${query ? '?' + query : ''}`);
const insert = (table, rows) => rest(table, { method: 'POST', body: rows, prefer: 'return=minimal' });
const upsert = (table, rows, onConflict) =>
  rest(`${table}${onConflict ? `?on_conflict=${onConflict}` : ''}`, { method: 'POST', body: rows, prefer: 'resolution=merge-duplicates,return=minimal' });
const patch = (table, query, body) => rest(`${table}?${query}`, { method: 'PATCH', body, prefer: 'return=minimal' });
const remove = (table, query) => rest(`${table}?${query}`, { method: 'DELETE', prefer: 'return=minimal' });
const rpc = (fn, args = {}) => rest(`rpc/${fn}`, { method: 'POST', body: args });

// Шлём порциями: Supabase не принимает большой кусок целиком и отвечает
// «Empty or invalid json». Ограничиваем и по числу записей, и по весу.
const MAX_ROWS = 100;
const MAX_BYTES = 150 * 1024;

// Если порция не прошла — делим пополам и пробуем снова. Так большой кусок дойдёт по частям,
// а если дело в одной битой записи, мы дойдём до неё и покажем её целиком.
async function sendBatch(table, rows, onConflict) {
  try {
    await upsert(table, rows, onConflict);
  } catch (e) {
    if (rows.length === 1) throw new Error(`${e.message}\n  не принята запись: ${JSON.stringify(rows[0]).slice(0, 400)}`);
    const half = Math.ceil(rows.length / 2);
    await sendBatch(table, rows.slice(0, half), onConflict);
    await sendBatch(table, rows.slice(half), onConflict);
  }
}

async function upsertAll(table, rows, onConflict) {
  // одинаковые ключи в одной порции Postgres не принимает — оставляем последнюю запись
  if (onConflict && rows.length) {
    const seen = new Map();
    for (const r of rows) seen.set(r[onConflict], r);
    rows = [...seen.values()];
  }
  const batches = [];
  let cur = [], bytes = 0;
  for (const r of rows) {
    const n = JSON.stringify(r).length + 1;
    if (cur.length && (cur.length >= MAX_ROWS || bytes + n > MAX_BYTES)) { batches.push(cur); cur = []; bytes = 0; }
    cur.push(r); bytes += n;
  }
  if (cur.length) batches.push(cur);
  for (const b of batches) await sendBatch(table, b, onConflict);
  return { rows: rows.length, batches: batches.length };
}

// Короткая проверка связи: сразу говорим, что не так, а не падаем на полпути
// Как выглядит ключ — без самого ключа: по этому видно, тот ли вставили
function keyInfo() {
  if (!KEY) return 'ключ не задан';
  const kind = KEY.startsWith('sb_secret_') ? 'секретный (sb_secret_)'
    : KEY.startsWith('sb_publishable_') ? 'ПУБЛИЧНЫЙ (sb_publishable_) — нужен секретный!'
    : KEY.startsWith('eyJ') ? 'старого образца (JWT)'
    : 'непонятного вида';
  return `ключ ${kind}, длина ${KEY.length}`;
}

async function check() {
  if (!URL) throw new Error('не задан SUPABASE_URL');
  if (!KEY) throw new Error('не задан SUPABASE_SERVICE_KEY');
  if (!/^https:\/\/[\w-]+\.supabase\.(co|in)$/.test(URL))
    throw new Error(`SUPABASE_URL выглядит странно: "${URL}". Ожидается вид https://xxxx.supabase.co`);
  try {
    await select('authors', 'select=username&limit=1');
  } catch (e) {
    throw new Error(`${e.message}\n  адрес: ${URL}\n  ${keyInfo()}`);
  }
  return true;
}

module.exports = { ready, check, keyInfo, scrub, rest, select, insert, upsert, upsertAll, patch, remove, rpc, URL };
