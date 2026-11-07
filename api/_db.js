// Тонкая обёртка над Supabase: ходим по обычному HTTP, без лишних библиотек.
// Ключи берутся из переменных окружения и НИКОГДА не лежат в коде и не попадают в GitHub.
// Адрес приводим в порядок: лишний слэш в конце или скопированный хвост /rest/v1
// — самая частая ошибка при настройке, из-за неё всё падает с непонятным 404.
const URL = String(process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
const KEY = String(process.env.SUPABASE_SERVICE_KEY || '').trim();
const ready = () => Boolean(URL && KEY);

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
    body: body === undefined ? undefined : JSON.stringify(body)
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

// отправляем большими пачками, но не бесконечными — иначе запрос не пролезет
async function upsertAll(table, rows, onConflict, size = 400) {
  for (let i = 0; i < rows.length; i += size) await upsert(table, rows.slice(i, i + size), onConflict);
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

module.exports = { ready, check, keyInfo, rest, select, insert, upsert, upsertAll, patch, remove, rpc, URL };
