// Профиль: сохранённое, лайки, история, цифры и подписка на автора.
const db = require('./_db.js');
const { who, whyNot } = require('./_auth.js');

const KINDS = ['save', 'like', 'history'];

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const me = who(req);
  if (!me) return res.status(401).json({ error: 'Telegram не подтвердил, кто ты: ' + whyNot(req) });
  const q = req.query || {};

  try {
    // подписаться или отписаться
    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      // разрешил боту писать — включаем уведомления
      if (body.write !== undefined) {
        await db.rpc('notify_set', { p_user: me.id, p_can: !!body.write, p_want: body.notify === undefined ? null : !!body.notify });
        return res.status(200).json({ ok: true });
      }

      const author = String(body.follow || '');
      if (!/^[A-Za-z0-9_]{3,40}$/.test(author)) return res.status(400).json({ error: 'плохое имя канала' });
      if (await db.rpc('hit_limit', { p_user: me.id, p_kind: 'follow', p_max: 60, p_seconds: 300 }))
        return res.status(429).json({ error: 'слишком часто' });
      const on = await db.rpc('toggle_follow', { p_user: me.id, p_author: author });
      return res.status(200).json({ ok: true, following: on });
    }

    if (q.what === 'profile') {
      const info = await db.rpc('my_profile', { p_user: me.id });
      return res.status(200).json({ me: { id: me.id, name: me.name, photo: me.photo }, profile: info || {} });
    }

    const videos = await db.rpc('my_videos', {
      p_user: me.id,
      p_kind: KINDS.includes(q.kind) ? q.kind : 'save',
      p_limit: Math.min(50, Math.max(1, parseInt(q.limit, 10) || 30)),
      p_skip: Math.min(5000, Math.max(0, parseInt(q.skip, 10) || 0))
    });
    res.status(200).json({ videos: videos || [] });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
};
