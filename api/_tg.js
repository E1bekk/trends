// Разбор публичной страницы канала t.me/s/<имя> — без аккаунта Telegram и без API-ключей.
// Достаём: название, аватар, подписчиков канала; у постов — видео, обложку, длительность,
// пропорции кадра, просмотры, реакции, текст, дату и «переслано из».
// Просмотры и реакции Telegram нужны только алгоритму — человеку показываем наши цифры.
const unesc = s => String(s || '')
  .replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')
  .replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
  .replace(/&#(\d+);/g, (m, c) => String.fromCodePoint(+c)).replace(/&#x([0-9a-f]+);/gi, (m, c) => String.fromCodePoint(parseInt(c, 16)))
  .replace(/[ \t]+\n/g, '\n').trim();
const num = s => {
  const m = String(s || '').trim().match(/^([\d.,]+)\s*([KMB])?/i); if (!m) return 0;
  const v = parseFloat(m[1].replace(',', '.')); const k = { K: 1e3, M: 1e6, B: 1e9 }[(m[2] || '').toUpperCase()] || 1;
  return Math.round(v * k);
};
const pick = (s, re) => { const m = s.match(re); return m ? m[1] : ''; };
const dur = s => { const p = String(s || '').split(':').map(Number); return p.reduce((a, b) => a * 60 + b, 0) || 0; };

function parseChannel(html, username) {
  const head = html.slice(0, html.indexOf('tgme_channel_history') > 0 ? html.indexOf('tgme_channel_history') : 20000);
  const channel = {
    username,
    title: unesc(pick(head, /tgme_channel_info_header_title[^>]*>([\s\S]*?)<\/div>/)),
    avatar: pick(head, /tgme_page_photo_image[\s\S]*?<img src="([^"]+)"/),
    description: unesc(pick(head, /tgme_channel_info_description[^>]*>([\s\S]*?)<\/div>/)).slice(0, 300),
    subscribers: 0
  };
  const counters = [...head.matchAll(/counter_value">([^<]+)<\/span>\s*<span class="counter_type">([^<]+)</g)];
  for (const c of counters) if (/subscriber|member|подписч/i.test(c[2])) channel.subscribers = num(c[1]);
  const posts = [];
  const parts = html.split('<div class="tgme_widget_message_wrap');
  for (const part of parts.slice(1)) {
    const id = pick(part, /data-post="[^"/]+\/(\d+)"/); if (!id) continue;
    const text = unesc(pick(part, /tgme_widget_message_text[^>]*>([\s\S]*?)<\/div>/)).slice(0, 1000);
    const views = num(pick(part, /tgme_widget_message_views">([^<]+)</));
    const date = pick(part, /<time datetime="([^"]+)"/);
    const src = pick(part, /<video[^>]+src="([^"]+)"/);
    // реакции: нужны алгоритму как подсказка «зашло или нет», на экран не выводятся
    let reacts = 0;
    for (const m of part.matchAll(/class="tgme_reaction"[^>]*>([\s\S]*?)<\/span>/g)) {
      const tail = m[1].replace(/<[^>]+>/g, '').trim().match(/([\d.,]+\s*[KMB]?)$/i);   // «😁204» — число в конце
      reacts += tail ? num(tail[1]) : 1;
    }
    const from = unesc(pick(part, /tgme_widget_message_forwarded_from_name[^>]*>([\s\S]*?)<\/a>/)).slice(0, 60);
    // ссылка на канал-источник: по ней находим новые каналы, которые стоит добавить
    const fromUser = (pick(part, /tgme_widget_message_forwarded_from_name"[^>]*href="https:\/\/t\.me\/([A-Za-z0-9_]{4,32})/) || '');
    const p = { id: +id, text, views, date, reacts };
    if (from) p.from = from;
    if (fromUser) p.from_user = fromUser;
    if (src) {
      p.video = src.replace(/&amp;/g, '&');
      p.thumb = pick(part, /tgme_widget_message_video_thumb"[^>]*background-image:url\('([^']+)'/);
      p.duration = dur(pick(part, /message_video_duration[^>]*>([^<]+)</));
      const pad = parseFloat(pick(part, /tgme_widget_message_video_wrap"[^>]*padding-top:([\d.]+)%/));
      p.ratio = pad ? +(100 / pad).toFixed(3) : 0.5625;   // ширина/высота
    } else {
      const photo = pick(part, /tgme_widget_message_photo_wrap[^>]*background-image:url\('([^']+)'/);
      if (photo) p.photo = photo;
    }
    posts.push(p);
  }
  return { channel, posts };
}
module.exports = { parseChannel, num };
