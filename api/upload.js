// Фон профиля: человек сам ставит свои фото наверх страницы.
// Телефон сжимает фото перед отправкой, сюда приходит уже небольшая картинка.
const db = require('./_db.js');
const { who, whyNot } = require('./_auth.js');

const MAX = 3 * 1024 * 1024;           // 3 МБ на фото
// Тип картинки определяем по первым байтам, а не по тому, что написал браузер
function sniff(b) {
  if (b.length > 3 && b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return ['image/jpeg', 'jpg'];
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) return ['image/png', 'png'];
  if (b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return ['image/webp', 'webp'];
  return null;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'только POST' });

  const me = who(req);
  if (!me) return res.status(401).json({ error: 'Telegram не подтвердил, кто ты: ' + whyNot(req) });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});

    // убрать фото с фона
    if (body.del) {
      const covers = await db.rpc('cover_del', { p_user: me.id, p_url: String(body.del) });
      await db.delImage(String(body.del));
      return res.status(200).json({ ok: true, covers: covers || [] });
    }

    // пара слов о себе
    if (typeof body.bio === 'string') {
      const bio = await db.rpc('bio_set', { p_user: me.id, p_text: body.bio });
      return res.status(200).json({ ok: true, bio: bio || '' });
    }

    const raw = String(body.photo || '');
    const base64 = raw.includes(',') ? raw.slice(raw.indexOf(',') + 1) : raw;
    if (!base64) return res.status(400).json({ error: 'нет фото' });
    if (base64.length > MAX * 1.4) return res.status(413).json({ error: 'фото слишком большое' });

    const buf = Buffer.from(base64, 'base64');
    if (buf.length > MAX) return res.status(413).json({ error: 'фото слишком большое' });
    const kind = sniff(buf);
    if (!kind) return res.status(400).json({ error: 'это не картинка' });

    if (await db.rpc('hit_limit', { p_user: me.id, p_kind: 'cover', p_max: 20, p_seconds: 3600 }))
      return res.status(429).json({ error: 'слишком часто, попробуй попозже' });

    const name = `u${me.id}/${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}.${kind[1]}`;
    const url = await db.putImage(name, buf, kind[0]);
    const covers = await db.rpc('cover_add', { p_user: me.id, p_url: url });
    res.status(200).json({ ok: true, url, covers: covers || [] });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
};
