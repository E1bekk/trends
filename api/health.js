// Страница проверки: что настроено, а что нет. Ключи не показываются — только «есть / нет».
const db = require('./_db.js');

const FUNCS = [
  ['feed_for',      { p_user: null, p_mode: 'foryou', p_vibe: null, p_limit: 1, p_skip: 0 }, 'db/feed.sql'],
  ['log_events',    { p_user: 0, p_name: null, p_photo: null, p_lang: null, p_events: [] }, 'db/feed.sql'],
  ['fade_taste',    {}, 'db/feed.sql'],
  ['my_videos',     { p_user: 0, p_kind: 'save', p_limit: 1, p_skip: 0 }, 'db/my.sql'],
  ['my_profile',    { p_user: 0 }, 'db/my.sql'],
  ['toggle_follow', null, 'db/my.sql'],                       // меняет данные — только наличие
  ['news_feed',     { p_topic: null, p_country: null, p_limit: 1, p_skip: 0 }, 'db/news.sql'],
  ['news_topics',   {}, 'db/news.sql'],
  ['comments_of',   { p_video: 'нет/0', p_user: null, p_limit: 1, p_skip: 0 }, 'db/comments.sql'],
  ['comment_add',   null, 'db/comments.sql'],
  ['comment_like',  null, 'db/comments.sql'],
  ['bump_video',    null, 'db/schema.sql'],
  ['refresh_scores', null, 'db/schema.sql'],
  ['hit_limit',     null, 'db/schema.sql'],
  ['delete_user',   null, 'db/schema.sql']
];
const TABLES = ['videos', 'authors', 'users', 'news', 'actions', 'seen', 'comments', 'chats', 'messages', 'sticker_packs'];

// Колонку не указываем: у разных таблиц ключ называется по-разному,
// а запрос несуществующей колонки выглядел бы как отсутствие всей таблицы.
async function count(table) {
  try {
    await db.rest(`${table}?limit=1`);
    return 'есть';
  } catch (e) {
    return /PGRST205|PGRST116|relation .* does not exist|404/.test(e.message) ? 'НЕТ ТАБЛИЦЫ' : 'ошибка: ' + e.message.slice(0, 70);
  }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  const out = {
    ключи: {
      SUPABASE_URL: !!process.env.SUPABASE_URL,
      SUPABASE_SERVICE_KEY: !!process.env.SUPABASE_SERVICE_KEY,
      BOT_TOKEN: !!process.env.BOT_TOKEN,
      ADMIN_IDS: !!process.env.ADMIN_IDS,
      GEMINI_API_KEY: !!process.env.GEMINI_API_KEY,
      BOT_TOKEN_похож_на_токен: /^\d{6,12}:[A-Za-z0-9_-]{30,}$/.test(process.env.BOT_TOKEN || ''),
      BOT_TOKEN_номер_бота: String(process.env.BOT_TOKEN || '').split(':')[0] || 'нет'
    },
    база: 'не проверяли', таблицы: {}, функции: {}, надо_выполнить: []
  };
  try { await db.check(); out.база = 'связь есть'; }
  catch (e) { out.база = 'НЕТ СВЯЗИ: ' + e.message; return res.status(200).json(out); }

  for (const t of TABLES) out.таблицы[t] = await count(t);

  const missing = new Set();
  for (const [t, v] of Object.entries(out.таблицы)) {
    if (v !== 'НЕТ ТАБЛИЦЫ') continue;
    missing.add(t === 'news' ? 'db/news.sql' : 'db/schema.sql');
  }
  for (const [fn, args, file] of FUNCS) {
    if (args === null) { out.функции[fn] = 'не проверяли (меняет данные)'; continue; }
    try { await db.rpc(fn, args); out.функции[fn] = 'есть'; }
    catch (e) {
      if (/PGRST202|Could not find the function|404/.test(e.message)) { out.функции[fn] = 'НЕТ ФУНКЦИИ'; missing.add(file); }
      else out.функции[fn] = 'есть (но ответила ошибкой: ' + e.message.slice(0, 80) + ')';
    }
  }
  out.надо_выполнить = [...missing];
  out.итог = missing.size ? `Не выполнены файлы: ${[...missing].join(', ')} — открой их в Supabase → SQL Editor → Run`
                          : 'Всё на месте';
  res.status(200).json(out);
};
