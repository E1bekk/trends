// Проверка наборов стикеров перед тем, как пустить их к людям.
// Набор проходит три ступени: запрещён сразу / на проверку человеком / можно.
// Сам по себе набор в ОБЩИЙ доступ не попадает никогда — туда его переводит админ
// или три независимых добавления без жалоб. Здесь только автоматическая отсечка.

// Название пишут как угодно, лишь бы проскочило: «p_o_r_n», «п0рн», «pоrn» с русской «о».
// Поэтому приводим всё к одному виду: убираем разделители, цифры-подмены и переводим в латиницу.
const CYR = {
  а:'a', б:'b', в:'v', г:'g', д:'d', е:'e', ё:'e', ж:'zh', з:'z', и:'i', й:'i', к:'k', л:'l', м:'m',
  н:'n', о:'o', п:'p', р:'r', с:'s', т:'t', у:'u', ф:'f', х:'h', ц:'c', ч:'ch', ш:'sh', щ:'sch',
  ъ:'', ы:'y', ь:'', э:'e', ю:'yu', я:'ya',
  ў:'u', қ:'q', ғ:'g', ҳ:'h', ә:'a', ө:'o', ұ:'u', ү:'u', і:'i', ң:'n', һ:'h', ї:'i', є:'e'
};
const LEET = { '0':'o', '1':'i', '3':'e', '4':'a', '5':'s', '@':'a', '$':'s', '!':'i' };

function norm(s) {
  return String(s || '').toLowerCase()
    .replace(/[@$!013-5]/g, c => LEET[c] || c)
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .split('').map(c => (CYR[c] !== undefined ? CYR[c] : c)).join('');
}

// запасной список — работает, даже если таблица в базе пустая
const FALLBACK = [
  ['porn', 1], ['porno', 1], ['xxx', 1], ['nsfw', 1], ['hentai', 1], ['ahegao', 1], ['erotic', 1],
  ['eroti', 1], ['intim', 1], ['bdsm', 1], ['onlyfans', 1], ['nude', 1], ['loli', 1], ['lolik', 1],
  ['gore', 1], ['guro', 1], ['raschlen', 1], ['mutilat', 1], ['decapit', 1],
  ['suicid', 1], ['selfharm', 1], ['nazi', 1], ['hitler', 1], ['svastik', 1], ['swastika', 1], ['heil', 1],
  ['mefedron', 1], ['geroin', 1], ['kokain', 1], ['cocaine', 1], ['narkot', 1],
  ['seks', 0], ['sex', 0], ['trup', 0], ['krov', 0], ['blood', 0], ['ubii', 0], ['kill', 0],
  ['adult', 0], ['vzrosl', 0], ['18+', 0], ['18', 0]
];

const HARD_EMOJI = ['🔞'];
const SOFT_EMOJI = ['🍑', '🍆', '💦', '🩸', '🔪', '🚬'];

// words: [[слово, 1|0], ...] — 1 запрещаем сразу, 0 отправляем на проверку. Пусто → берём запасной.
function screenPack({ name = '', title = '', emojis = [], total = 0 }, words) {
  const list = (words && words.length ? words : FALLBACK);
  const raw = `${name} ${title}`.toLowerCase();
  const flat = norm(`${name} ${title}`);
  const hit = [];

  for (const [w, hard] of list) {
    const word = String(w);
    const found = /\d/.test(word)
      // слова с цифрами («18+») ищем целым куском, иначе «Cats 2018» попадёт под раздачу
      ? new RegExp(`(^|[^\\d\\p{L}])${word.replace(/[+*?.()[\]\\^$|]/g, '\\$&')}`, 'u').test(raw)
      : norm(word).length >= 3 && flat.includes(norm(word));
    if (found) hit.push({ word, hard: !!Number(hard) });
  }

  const em = emojis.filter(Boolean);
  if (em.some(e => HARD_EMOJI.includes(e))) hit.push({ word: '🔞', hard: true });
  const soft = em.filter(e => SOFT_EMOJI.includes(e)).length;
  if (em.length >= 5 && soft / em.length >= 0.3) hit.push({ word: 'много недвусмысленных эмодзи', hard: false });

  const hard = hit.filter(h => h.hard);
  if (hard.length) return { status: 'blocked', reason: 'запрещено: ' + hard.map(h => h.word).join(', ') };
  if (hit.length) return { status: 'new', reason: 'на проверку: ' + hit.map(h => h.word).join(', ') };
  if (!total) return { status: 'new', reason: 'пустой набор' };
  return { status: 'ok', reason: null };
}

module.exports = { screenPack, norm, FALLBACK };
