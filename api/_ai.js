// ИИ-проверка набора стикеров перед общим доступом.
// Картинки набора уходят в Gemini одним запросом, он отвечает оценкой по категориям.
// Главное правило: при любой ошибке, отказе или непонятном ответе набор НЕ одобряется,
// а уходит к человеку. Молча пропустить наверх ничего не может.
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const KEY = () => process.env.GEMINI_API_KEY;
const MAX_IMAGES = 16;
const MAX_BYTES = 2 * 1024 * 1024;

// Две разные планки.
// BAN — то, за что Telegram сносит бота, а нас может достать закон. Такое нельзя вообще нигде.
// SHARE — планка для ОБЩЕЙ панели: туда пускаем только чистое.
// Между ними — «только себе»: набор работает у человека, но в общую панель не идёт.
const BAN = { minors: 30, adult: 85, gore: 85, hate: 85, drugs: 95 };
const SHARE = 30;
const KEYS = ['adult', 'gore', 'hate', 'drugs', 'minors'];

const PROMPT = `Ты модератор стикеров в развлекательном приложении для подростков и взрослых в Центральной Азии.
Перед тобой картинки из одного набора стикеров. Оцени весь набор целиком.

Оцени от 0 до 100, насколько уверенно в наборе присутствует:
- adult: нагота, половые органы, половой акт, откровенно сексуальные позы или намёки (включая рисованное и аниме)
- gore: кровь, раны, расчленение, трупы, жестокость, насилие над людьми или животными
- hate: нацистская символика, свастика, расистские или оскорбляющие нацию и религию изображения
- drugs: наркотики, их употребление или реклама
- minors: сексуализация детей в любом виде

0 — точно нет, 100 — точно есть. Обычные мемы, мультяшки, животные, еда, лёгкий юмор и грубоватые шутки без наготы — это 0.
Нарисованный мультяшный персонаж с оружием или капля крови в шуточном меме — это не больше 20 по gore.

Ответь ТОЛЬКО одним JSON-объектом, без пояснений и без разметки:
{"adult":0,"gore":0,"hate":0,"drugs":0,"minors":0,"summary":"одна короткая фраза по-русски"}`;

async function grab(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error('image ' + r.status);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length > MAX_BYTES) throw new Error('image too big');
  const type = r.headers.get('content-type') || '';
  const mime = /png|jpeg|jpg|webp|gif/.test(type) ? type.split(';')[0] : 'image/webp';
  return { inline_data: { mime_type: mime, data: buf.toString('base64') } };
}

function decide(scores, note) {
  const n = k => Math.max(0, Math.min(100, Number(scores[k]) || 0));
  const list = ks => ks.map(k => `${k} ${n(k)}`).join(', ');

  const banned = KEYS.filter(k => n(k) >= BAN[k]);
  if (banned.length) return { status: 'blocked', use: false, reason: `запрещено совсем: ${list(banned)}` };

  const hot = KEYS.filter(k => n(k) >= SHARE);
  if (hot.length) return {
    status: 'private', use: true,
    reason: `только себе, в общую панель нельзя: ${list(hot)}${note ? ' — ' + note : ''}`
  };
  return { status: 'shared', use: true, reason: null };
}

async function reviewPack({ name = '', title = '', items = [] }) {
  if (!KEY()) return { status: 'new', use: false, reason: 'ИИ не настроен — нужна ручная проверка', ai: null };
  const pics = [];
  for (const it of items.slice(0, MAX_IMAGES)) {
    try { pics.push(await grab(it.url)); } catch (e) { /* одна картинка не скачалась — не беда */ }
  }
  if (pics.length < 2) return { status: 'new', use: false, reason: 'не удалось посмотреть картинки — нужна ручная проверка', ai: null };

  let data;
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: 'POST',
      signal: AbortSignal.timeout(25000),
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY() },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: `${PROMPT}\n\nНазвание набора: ${title || name}` }, ...pics] }],
        generationConfig: { temperature: 0, maxOutputTokens: 300, responseMimeType: 'application/json' },
        safetySettings: ['HARM_CATEGORY_HARASSMENT', 'HARM_CATEGORY_HATE_SPEECH',
          'HARM_CATEGORY_SEXUALLY_EXPLICIT', 'HARM_CATEGORY_DANGEROUS_CONTENT']
          .map(category => ({ category, threshold: 'BLOCK_NONE' }))
      })
    });
    if (!r.ok) throw new Error('gemini ' + r.status);
    data = await r.json();
  } catch (e) {
    return { status: 'new', use: false, reason: 'ИИ не ответил — нужна ручная проверка', ai: null };
  }

  // Gemini сам отказался смотреть — это уже говорит о том, что в наборе что-то не то
  const cand = (data.candidates || [])[0];
  if (data.promptFeedback && data.promptFeedback.blockReason)
    return { status: 'blocked', use: false, reason: 'ИИ отказался смотреть набор', ai: data.promptFeedback };
  if (cand && cand.finishReason && !['STOP', 'MAX_TOKENS'].includes(cand.finishReason))
    return { status: 'blocked', use: false, reason: 'ИИ отказался смотреть набор', ai: { finishReason: cand.finishReason } };

  const text = ((cand && cand.content && cand.content.parts) || []).map(p => p.text || '').join('').trim();
  let scores;
  try { scores = JSON.parse(text.replace(/^```(?:json)?|```$/g, '').trim()); }
  catch (e) { return { status: 'new', use: false, reason: 'ответ ИИ непонятен — нужна ручная проверка', ai: { text: text.slice(0, 200) } }; }
  if (!scores || typeof scores !== 'object' || ['adult', 'gore', 'hate', 'drugs', 'minors'].every(k => scores[k] === undefined))
    return { status: 'new', use: false, reason: 'ответ ИИ неполный — нужна ручная проверка', ai: scores || null };

  const out = decide(scores, scores.summary);
  return { ...out, ai: { ...scores, model: MODEL, seen: pics.length, at: new Date().toISOString() } };
}

module.exports = { reviewPack, decide, BAN, SHARE };
