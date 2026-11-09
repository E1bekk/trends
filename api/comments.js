// Комментарии под видео: список, отправка, лайк, удаление своего, жалоба на чужое.
const db = require('./_db.js');
const { who } = require('./_auth.js');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  const q = req.query || {};
  const me = who(req);

  try {
    if (req.method === 'GET') {
      const video = String(q.v || '');
      if (!/^[A-Za-z0-9_]{3,40}\/\d{1,12}$/.test(video)) return res.status(400).json({ error: 'плохой адрес видео' });
      const list = await db.rpc('comments_of', {
        p_video: video, p_user: me ? me.id : null,
        p_limit: Math.min(50, Math.max(1, parseInt(q.limit, 10) || 30)),
        p_skip: Math.min(1000, Math.max(0, parseInt(q.skip, 10) || 0))
      });
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ comments: list || [] });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'только GET и POST' });
    if (!me) return res.status(401).json({ error: 'нет подписи Telegram' });
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});

    if (body.like) {
      const on = await db.rpc('comment_like', { p_user: me.id, p_id: Number(body.like) });
      return res.status(200).json({ ok: true, liked: on });
    }
    if (body.remove) {
      const ok = await db.rpc('comment_remove', { p_user: me.id, p_id: Number(body.remove) });
      return res.status(200).json({ ok });
    }
    if (body.report) {
      const hidden = await db.rpc('comment_report', { p_user: me.id, p_id: Number(body.report), p_reason: String(body.reason || '').slice(0, 200) });
      return res.status(200).json({ ok: true, hidden });
    }

    const text = String(body.text || '').trim();
    if (!text) return res.status(400).json({ error: 'пустой комментарий' });
    // защита от спама: не больше 10 комментариев в минуту
    if (await db.rpc('hit_limit', { p_user: me.id, p_kind: 'comment', p_max: 10, p_seconds: 60 }))
      return res.status(429).json({ error: 'слишком часто, подожди немного' });

    const added = await db.rpc('comment_add', {
      p_user: me.id, p_name: me.name, p_photo: me.photo,
      p_video: String(body.v || ''), p_body: text.slice(0, 1000),
      p_reply: body.reply ? Number(body.reply) : null
    });
    res.status(200).json({ ok: true, comment: added });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
};
