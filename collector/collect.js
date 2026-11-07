// Сборщик Scroll. Запускается в GitHub Actions каждые 20 минут.
// Обходит каналы-источники, чистит подписи от рекламы, размечает видео по смыслу,
// склеивает одинаковые репосты и складывает всё в базу. Пул видео растёт сам.
const { parseChannel } = require('../api/_tg.js');
const { cleanCaption, isPromoOnly, tagsFor, detectLang, dupKey } = require('../api/_clean.js');
const db = require('../api/_db.js');
const CHANNELS = require('../api/_channels.js');

const PARALLEL = 10;
const MAX_DURATION = 180;
const PER_CHANNEL = 40;

async function fetchPage(username, before) {
  const url = `https://t.me/s/${username}${before ? `?before=${before}` : ''}`;
  const r = await fetch(url, {
    signal: AbortSignal.timeout(15000),
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ScrollBot/1.0)', 'Accept-Language': 'ru' }
  });
  if (!r.ok) throw new Error(`${username}: HTTP ${r.status}`);
  return r.text();
}

async function loadChannel(cfg) {
  let channel = null, posts = [], before = 0;
  for (let i = 0; i < (cfg.pages || 2); i++) {
    const res = parseChannel(await fetchPage(cfg.username, before), cfg.username);
    if (!channel) channel = res.channel;
    if (!res.posts.length) break;
    posts = res.posts.concat(posts);
    before = Math.min(...res.posts.map(p => p.id));
  }
  if (!channel) throw new Error(`${cfg.username}: пустая страница`);
  const seen = new Set();
  posts = posts.filter(p => !seen.has(p.id) && seen.add(p.id));
  const views = posts.map(p => p.views).filter(Boolean).sort((a, b) => a - b);
  const reach = views.length ? views[Math.floor(views.length / 2)] : 0;
  return { cfg, channel, posts, reach };
}

function toVideoRows({ cfg, channel, posts }) {
  const rows = [];
  for (const p of posts.slice().sort((a, b) => b.id - a.id)) {
    if (!p.video || !(p.duration > 0) || p.duration > MAX_DURATION) continue;
    if (cfg.cat === 'news') continue;                       // новости в ленту не идут
    const caption = cleanCaption(p.text);
    if (isPromoOnly(p.text, caption)) continue;             // пост-реклама — мимо
    if (rows.length >= PER_CHANNEL) break;
    rows.push({
      id: `${cfg.username}/${p.id}`,
      author: cfg.username,
      post_id: p.id,
      caption,
      tags: tagsFor(caption, cfg.cat, cfg.game),
      cat: cfg.cat,
      game: cfg.game || null,
      lang: detectLang(caption, cfg.country === 'uz' ? 'uz' : cfg.country === 'kz' ? 'kk' : cfg.country === 'kg' ? 'ky' : 'ru'),
      country: cfg.country,
      duration: p.duration,
      ratio: p.ratio,
      video_url: p.video,
      thumb_url: p.thumb || null,
      posted_at: p.date || null,
      tg_views: p.views || 0,
      tg_reactions: p.reacts || 0,
      dup_key: dupKey(p.duration, p.ratio, caption)
    });
  }
  return rows;
}

async function main() {
  const t0 = Date.now();
  // 1) связь с базой — проверяем первым делом, чтобы не собирать зря
  try { await db.check(); console.log('база: связь есть'); }
  catch (e) { console.error('БАЗА НЕДОСТУПНА:', e.message); process.exit(1); }

  const queue = CHANNELS.slice(), loaded = [], errors = [];
  await Promise.all(Array.from({ length: PARALLEL }, async () => {
    while (queue.length) {
      const cfg = queue.shift();
      try { loaded.push(await loadChannel(cfg)); }
      catch (e) { errors.push(String(e.message || e)); }
    }
  }));

  // 2) что удалось скачать — печатаем ДО записи в базу, иначе при сбое записи не видно причины
  console.log(`каналов скачано ${loaded.length} из ${CHANNELS.length}, за ${((Date.now() - t0) / 1000).toFixed(1)}с`);
  if (errors.length) console.log(`не ответили ${errors.length}:`, errors.slice(0, 8).join(' | '));
  if (!loaded.length) { console.error('НИ ОДИН КАНАЛ НЕ ОТВЕТИЛ — похоже, Telegram не пускает сервер GitHub'); process.exit(1); }

  const authors = loaded.map(({ cfg, channel, reach }) => ({
    username: cfg.username, title: channel.title || cfg.username, avatar: channel.avatar || null,
    subscribers: channel.subscribers || 0, reach, country: cfg.country, cat: cfg.cat,
    game: cfg.game || null, pages: cfg.pages || 2, active: true, updated_at: new Date().toISOString()
  }));

  let videos = [];
  for (const item of loaded) videos = videos.concat(toVideoRows(item));

  // один и тот же ролик часто висит в нескольких каналах — считаем, в скольких
  const spread = {};
  for (const v of videos) spread[v.dup_key] = (spread[v.dup_key] || new Set()).add(v.author);
  for (const v of videos) v.spread = spread[v.dup_key].size;

  // 3) запись
  await db.upsertAll('authors', authors, 'username');
  console.log(`авторов записано ${authors.length}`);
  await db.upsertAll('videos', videos, 'id');
  await db.rpc('refresh_scores');
  if (new Date().getUTCHours() === 4) await db.rpc('cleanup');    // уборка раз в сутки

  console.log(`ГОТОВО: видео ${videos.length}, повторов ${videos.filter(v => v.spread > 1).length}, ` +
    `всего за ${((Date.now() - t0) / 1000).toFixed(1)}с`);
}
main().catch(e => { console.error(e); process.exit(1); });
