// Чистка и разметка контента — то, что делает ленту «бесшовной».
// Подпись к видео в Telegram почти всегда с рекламой канала: «подпишись», @ник, ссылки.
// Здесь всё это вырезается, остаётся только смысл. Плюс каждому видео проставляются
// темы (по смыслу, а не по каналу), язык и ключ для склейки одинаковых репостов.

// Обрезка строки, которая не ломает эмодзи пополам: считаем по символам, а не по байтам.
// Половинка эмодзи — это не текст, и база такую запись не принимает вовсе.
const cut = (s, n) => { const a = [...String(s || '')]; return a.length <= n ? a.join('') : a.slice(0, n).join(''); };

// ---------- подпись ----------
const PROMO = [
  /подпи[сш][а-я]*(сь|йся|ться|ка|ывайт)/i, /обуна бўл/i, /наш канал/i, /больше видео/i, /жми\s/i, /переходи/i,
  /ставь\s+(лайк|реакц)/i, /реакци[ий]/i, /забирай/i, /только у нас/i, /читать далее/i, /源/,
  /obuna bo['’]?ling/i, /kanalga/i, /subscribe/i, /join\s+(us|now|here)/i, /follow\s+us/i,
  /^\s*реклама/i, /erid[: ]/i, /промокод/i, /скидк[аи]\s+\d/i, /бесплатн\w*\s+курс/i
];
const LINK = /(https?:\/\/\S+|t\.me\/\S+|@[A-Za-z][\w\d_]{3,})/g;

function cleanCaption(raw) {
  let t = String(raw || '').replace(/​|‎|‏/g, '');
  // строки, которые целиком про подписку и ссылки, выкидываем
  const keep = t.split('\n').filter(line => {
    const l = line.trim();
    if (!l) return false;
    if (PROMO.some(re => re.test(l))) return false;
    const bare = l.replace(LINK, '').replace(/[^\p{L}\p{N}]/gu, '');
    return bare.length >= 2 || /^[\p{Emoji_Presentation}\s]+$/u.test(l) === false;
  });
  t = keep.join('\n').replace(LINK, ' ');
  // хвост из эмодзи-стрелок и разделителей
  t = t.replace(/[⬇️⬆️👇👆➡️⬅️🔽🔼▪️▫️•·|—–-]{2,}/g, ' ')
       .replace(/[ \t]{2,}/g, ' ').replace(/\n{2,}/g, '\n').trim();
  return cut(t, 180);
}
// подпись осталась пустой или это была чистая реклама
function isPromoOnly(raw, cleaned) {
  const r = String(raw || '');
  if (!r.trim()) return false;                         // видео без подписи — нормально
  if (cleaned.replace(/[^\p{L}\p{N}]/gu, '').length >= 8) return false;
  return PROMO.some(re => re.test(r)) || (r.match(LINK) || []).length > 0;
}

// ---------- темы ----------
// Слово (или начало слова) → тема. Работает для русского, узбекского и английского.
const DICT = {
  koty: ['кот', 'кош', 'котён', 'котик', 'мурл', 'cat', 'kitten', 'mushuk'],
  sobaki: ['собак', 'пёс', 'пес ', 'щен', 'dog', 'puppy', 'kuchuk'],
  zhivotnye: ['зверь', 'животн', 'попуг', 'хомяк', 'лошад', 'корова', 'медвед', 'лиса', 'animal', 'hayvon'],
  fail: ['фейл', 'упал', 'падени', 'неудач', 'провал', 'fail', 'epic fail', 'yiqil'],
  mem: ['мем', 'meme', 'мемас', 'рофл', 'шутк', 'анекдот', 'прикол', 'ugar', 'hazil', 'kulgu'],
  tanec: ['танц', 'танец', 'dance', 'raqs', 'хореогр'],
  muzyka: ['песн', 'музык', 'трек', 'клип', 'song', 'music', 'qoshiq', 'кавер'],
  futbol: ['футбол', ' гол ', 'голы', 'матч', 'мяч', 'football', 'soccer', 'futbol', 'лиг', 'пеналь'],
  mma: ['бой', 'нокаут', 'ufc', 'mma', 'боец', 'ринг', 'октагон', 'бокс', 'boks'],
  sport_other: ['баскет', 'волейбол', 'теннис', 'хокке', 'борьб', 'куреш', 'тренировк'],
  igry: ['игр', 'game', 'гейм', 'катк', 'геймпл', 'oyin'],
  cs: ['cs2', 'csgo', 'counter-strike', 'контр', 'эйс', 'клатч'],
  dota: ['dota', 'дот', 'инвокер', 'мид '],
  pubg: ['pubg', 'пубг', 'пабг'],
  mlbb: ['mobile legends', 'mlbb', 'мобайл леджен'],
  fortnite: ['fortnite', 'фортнайт'],
  roblox: ['roblox', 'роблокс'],
  brawl: ['brawl', 'бравл'],
  avto: ['машин', 'авто', 'тачк', 'мотор', 'дрифт', 'гонк', 'car ', 'cars', 'avto', 'mashina', 'bmw', 'mercedes'],
  eda: ['рецепт', 'готов', 'вкусн', 'блюд', 'кухн', 'тесто', 'food', 'recipe', 'ovqat', 'плов', 'выпечк'],
  lajfhak: ['лайфхак', 'совет', 'способ', 'трюк', 'hack', 'как сделать'],
  deti: ['ребён', 'ребен', 'дет', 'малыш', 'kid', 'bola'],
  priroda: ['природ', 'океан', 'гор', 'лес', 'закат', 'nature', 'tabiat'],
  zalip: ['залип', 'satisf', 'идеальн', 'гипно', 'asmr', 'успока'],
  strakh: ['страшн', 'жутк', 'ужас', 'мистик', 'scary', 'qorqinchli'],
  milo: ['мил', 'умилит', 'няш', 'cute', 'yoqimli'],
  tryuk: ['трюк', 'паркур', 'скейт', 'экстрим', 'сальто', 'stunt', 'parkour'],
  rozygrysh: ['розыгрыш', 'пранк', 'prank', 'разыгр'],
  stendap: ['стендап', 'монолог', 'комик', 'standup', 'камеди'],
  tehnika: ['телефон', 'робот', 'нейросет', 'гаджет', 'айфон', 'iphone', 'нейронк']
};
const GAME_TAGS = {
  'CS2': 'cs', 'Dota 2': 'dota', 'PUBG Mobile': 'pubg', 'Mobile Legends': 'mlbb',
  'Fortnite': 'fortnite', 'Roblox': 'roblox', 'Brawl Stars': 'brawl', 'Valorant': 'valorant'
};

function tagsFor(caption, cat, game) {
  const t = ' ' + String(caption || '').toLowerCase().replace(/ё/g, 'е') + ' ';
  const out = new Set();
  for (const [tag, words] of Object.entries(DICT)) if (words.some(w => t.includes(w))) out.add(tag);
  if (game && GAME_TAGS[game]) out.add(GAME_TAGS[game]);
  if (cat) out.add(cat);
  return [...out].slice(0, 10);
}

// ---------- язык ----------
function detectLang(caption, fallback) {
  const t = String(caption || '');
  if (!t.replace(/[^\p{L}]/gu, '')) return fallback || 'ru';
  if (/[ўҳ]/i.test(t) || /\b(bo['’]?l|uchun|qilib|yaxshi|bugun|haqida|kerak|boʻ)\b/i.test(t)) return 'uz';
  if (/[әұіһ]/i.test(t)) return 'kk';
  if (/[ңөү]/i.test(t)) return 'ky';
  if (/[қғ]/i.test(t)) return 'uz';
  if (/[а-яё]/i.test(t)) return 'ru';
  if (/[a-z]/i.test(t)) return 'en';
  return fallback || 'ru';
}

// ---------- склейка одинаковых роликов из разных каналов ----------
function dupKey(duration, ratio, caption) {
  const words = String(caption || '').toLowerCase().replace(/[^\p{L}\p{N} ]/gu, ' ')
    .split(/\s+/).filter(w => w.length > 3).slice(0, 6).join('-');
  const shape = `${Math.round(duration || 0)}x${Math.round((ratio || 0.5625) * 100)}`;
  return words ? `${shape}:${words}` : `${shape}:~`;
}

module.exports = { cleanCaption, isPromoOnly, tagsFor, detectLang, dupKey, cut, DICT };
