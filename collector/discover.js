// Проверка найденных каналов. Берём тех, кого наши каналы репостят чаще всего,
// смотрим их открытую страницу и решаем: брать в ленту или отказать.
// Ничего «на глаз» — только понятные правила, причина отказа всегда записывается.
const { parseChannel } = require('../api/_tg.js');
const { isPromoOnly, cleanCaption } = require('../api/_clean.js');
const { screenPack, FALLBACK } = require('../api/_screen.js');
const db = require('../api/_db.js');
const fs = require('fs');

const PACK = 15;                      // столько кандидатов за заход
const MIN_SUBS = 2000;                // меньше — скорее всего личный блог
const MIN_VIDEOS = 5;                 // столько видео на первой странице
const FRESH_DAYS = 14;                // канал должен быть живым

const report = md => { if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n'); console.log(md.replace(/[#|*`]/g, '')); };

async function look(name) {
  const r = await fetch(`https://t.me/s/${name}`, {
    signal: AbortSignal.timeout(12000),
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ScrollBot/1.0)' }
  });
  if (!r.ok) throw new Error('страница ' + r.status);
  return parseChannel(await r.text(), name);
}

function judge({ channel, posts }, words) {
  const videos = posts.filter(p => p.video);
  const last = posts.map(p => p.date).filter(Boolean).sort().pop();
  const ageDays = last ? (Date.now() - new Date(last)) / 864e5 : 999;
  const stats = { videos: videos.length, subs: channel.subscribers || 0, last: last || null };

  // название и описание гоняем через тот же список слов, что и наборы стикеров
  const bad = screenPack({ name: channel.username || '', title: `${channel.title || ''} ${channel.description || ''}`, total: posts.length }, words);
  if (bad.status === 'blocked') return { ...stats, status: 'rejected', why: bad.reason };

  if (!posts.length) return { ...stats, status: 'rejected', why: 'страница закрыта или пустая' };
  if (stats.subs && stats.subs < MIN_SUBS) return { ...stats, status: 'rejected', why: `мало подписчиков (${stats.subs})` };
  if (videos.length < MIN_VIDEOS) return { ...stats, status: 'rejected', why: `мало видео (${videos.length})` };
  if (ageDays > FRESH_DAYS) return { ...stats, status: 'rejected', why: `давно не постят (${Math.round(ageDays)} дн.)` };

  // канал ради рекламы нам не нужен
  const promo = posts.filter(p => p.text && isPromoOnly(p.text, cleanCaption(p.text))).length;
  if (promo / posts.length > 0.5) return { ...stats, status: 'rejected', why: 'почти одна реклама' };

  return { ...stats, status: 'added', why: `видео ${videos.length}, подписчиков ${stats.subs}` };
}

async function main() {
  await db.check();
  const rows = await db.rpc('cand_take', { p_limit: PACK }) || [];
  if (!rows.length) return report('## Новых кандидатов нет');

  const words = FALLBACK.concat(((await db.select('blocklist', 'select=word,hard').catch(() => [])) || [])
    .map(w => [w.word, w.hard ? 1 : 0]));

  const lines = [];
  let added = 0;
  for (const c of rows) {
    let v, page = null;
    try { page = await look(c.username); v = judge(page, words); }
    catch (e) { v = { status: 'rejected', why: 'не открылся: ' + e.message, videos: 0, subs: 0, last: null }; }

    await db.rpc('cand_decide', {
      p_name: c.username, p_status: v.status, p_reason: v.why,
      p_videos: v.videos || 0, p_subs: v.subs || 0, p_last: v.last,
      p_title: (page && page.channel && page.channel.title) || null,
      p_avatar: (page && page.channel && page.channel.avatar) || null
    });
    if (v.status === 'added') added++;
    lines.push(`| @${c.username} | ${c.seen} | ${v.status === 'added' ? '✅ взяли' : '—'} | ${v.why} |`);
    await new Promise(r => setTimeout(r, 400));          // не частим к Telegram
  }

  report(`## Новые каналы\n\nПроверено ${rows.length}, взяли ${added}.\n\n` +
    `| канал | репостов | итог | почему |\n|---|---|---|---|\n${lines.join('\n')}`);
}

main().catch(e => { report(`## ❌ Поиск каналов упал\n\n\`\`\`\n${e.message}\n\`\`\``); process.exit(1); });
