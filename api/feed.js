// Лента прототипа: берём свежие посты прямо с публичных страниц каналов (t.me/s/...).
// Ответ кэшируется на 5 минут, чтобы не дёргать Telegram на каждый запрос.
// В рабочей версии этим займётся сборщик по расписанию, а данные будут лежать в базе.
const { parseChannel } = require('./_tg');
const CHANNELS = require('./_channels');

// сколько страниц истории брать с канала (~20 постов на страницу): развлекательных — больше, новостных — одну
const PAGES = 2;
const PER_CHANNEL = 30; // не больше стольких роликов с одного канала — чтобы ни один не забивал ленту
const PARALLEL = 12; // сколько каналов качаем одновременно
const short = (t, n) => (t && t.length > n ? t.slice(0, n).trimEnd() + '…' : t || ''); // ответ меньше — лента грузится быстрее

async function fetchPage(username, before) {
  const url = `https://t.me/s/${username}${before ? `?before=${before}` : ''}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TrendsBot/0.1)', 'Accept-Language': 'ru' } });
  if (!r.ok) throw new Error(`${username}: HTTP ${r.status}`);
  return r.text();
}

async function loadChannel(cfg) {
  let channel = null, posts = [], before = 0;
  const pages = cfg.pages || PAGES;
  for (let i = 0; i < pages; i++) {
    const res = parseChannel(await fetchPage(cfg.username, before), cfg.username);
    if (!channel) channel = res.channel;
    if (!res.posts.length) break;
    posts = res.posts.concat(posts);
    before = Math.min(...res.posts.map(p => p.id));
  }
  const seen = new Set(); posts = posts.filter(p => !seen.has(p.id) && seen.add(p.id));
  const views = posts.map(p => p.views).filter(Boolean).sort((a, b) => a - b);
  const reach = views.length ? views[Math.floor(views.length / 2)] : 0;               // охват: медиана просмотров поста
  Object.assign(channel, { country: cfg.country, cat: cfg.cat, game: cfg.game || '', reach, err: channel.subscribers ? +(reach / channel.subscribers * 100).toFixed(1) : 0, postsCount: posts.length });
  return { channel, posts };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  // качаем каналы порциями, чтобы не нагружать Telegram
  const results = [], queue = CHANNELS.slice();
  await Promise.all(Array.from({ length: PARALLEL }, async () => {
    while (queue.length) { const c = queue.shift(); try { results.push({ status: 'fulfilled', value: await loadChannel(c) }); } catch (e) { results.push({ status: 'rejected', reason: e }); } }
  }));
  const channels = [], videos = [], news = [], errors = [];
  for (const r of results) {
    if (r.status !== 'fulfilled') { errors.push(String(r.reason && r.reason.message || r.reason)); continue; }
    const { channel, posts } = r.value;
    channels.push(channel);
    let count = 0;
    for (const p of posts.slice().sort((x, y) => y.id - x.id)) {
      const base = { key: `${channel.username}/${p.id}`, channel: channel.username, id: p.id, text: short(p.text, channel.cat === 'news' ? 600 : 160), views: p.views, date: p.date, cat: channel.cat };
      if (channel.game) base.game = channel.game;
      if (p.video && p.duration > 0 && p.duration <= 180 && channel.cat !== 'news') { if (count++ < PER_CHANNEL) videos.push(Object.assign(base, { video: p.video, thumb: p.thumb, duration: p.duration, ratio: p.ratio })); }
      else if (channel.cat === 'news' && p.text && p.text.length > 40) news.push(Object.assign(base, { photo: p.photo || '' }));
    }
  }
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=3600');
  // ?lite=1 — быстрый старт: по 3 лучших свежих ролика с канала, без новостей (~в 6 раз меньше)
  if (req.query && req.query.lite) {
    const reach = Object.fromEntries(channels.map(c => [c.username, c.reach || 1]));
    const score = v => v.views / Math.max(50, reach[v.channel]) * Math.exp(-(Date.now() - new Date(v.date)) / 36e5 / 96);
    const by = {};
    videos.forEach(v => (by[v.channel] = by[v.channel] || []).push(v));
    const lite = [].concat(...Object.values(by).map(l => l.sort((a, b) => score(b) - score(a)).slice(0, 3)));
    return res.status(200).json({ updated: new Date().toISOString(), lite: true, channels, videos: lite, news: [], errors: [] });
  }
  res.status(200).json({ updated: new Date().toISOString(), channels, videos, news, errors });
};
