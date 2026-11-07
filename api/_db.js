// Тонкая обёртка над Supabase: ходим по обычному HTTP, без лишних библиотек.
// Ключи берутся из переменных окружения и НИКОГДА не лежат в коде и не попадают в GitHub.
const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_KEY;
const ready = () => Boolean(URL && KEY);

async function rest(path, { method = 'GET', body, prefer } = {}) {
  if (!ready()) throw new Error('База не настроена: нет SUPABASE_URL или SUPABASE_SERVICE_KEY');
  const r = await fetch(`${URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: KEY, Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json', ...(prefer ? { Prefer: prefer } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${text.slice(0, 300)}`);
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

module.exports = { ready, rest, select, insert, upsert, upsertAll, patch, remove, rpc };
