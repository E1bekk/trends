// Комнаты: смотрим ленту вместе. Ведущий листает — остальные едут следом.
const db = require('./_db.js');
const { who, whyNot } = require('./_auth.js');

const BOT = String(process.env.BOT_USERNAME || 'scroll_app_bot').replace(/^@/, '');
const APP = String(process.env.APP_SHORT || 'app');
const link = id => `https://t.me/${BOT}/${APP}?startapp=rm_${id}`;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const me = who(req);
  if (!me) return res.status(401).json({ error: 'Telegram не подтвердил, кто ты: ' + whyNot(req) });
  const q = req.query || {};

  try {
    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});

      // собрать комнату: либо из полки, либо из присланного списка
      if (body.make) {
        let ids = Array.isArray(body.videos) ? body.videos.map(String).slice(0, 60) : [];
        if (!ids.length && body.shelf) {
          const rows = await db.rpc('shelf_open', { p_user: me.id, p_shelf: String(body.shelf), p_limit: 60, p_skip: 0 });
          ids = (rows || []).map(v => v.id);
        }
        if (!ids.length) return res.status(400).json({ error: 'нечего смотреть — выбери полку или ролики' });
        const r = await db.rpc('room_make', { p_user: me.id, p_title: String(body.make).slice(0, 60), p_videos: ids });
        return res.status(200).json({ ...(r || {}), link: r && r.id ? link(r.id) : null });
      }

      if (body.join) {
        const r = await db.rpc('room_join', { p_user: me.id, p_name: me.name, p_photo: me.photo, p_room: String(body.join) });
        return res.status(200).json({ ...(r || {}), link: r && r.id ? link(r.id) : null });
      }
      if (body.leave) { await db.rpc('room_leave', { p_user: me.id, p_room: String(body.leave) }); return res.status(200).json({ ok: true }); }
      if (body.move) {
        await db.rpc('room_move', { p_user: me.id, p_room: String(body.move), p_pos: parseInt(body.pos, 10) || 0 });
        return res.status(200).json({ ok: true });
      }
      if (body.react) {
        const r = await db.rpc('room_react', { p_user: me.id, p_room: String(body.react), p_video: String(body.video || ''), p_emoji: String(body.emoji || '❤️') });
        return res.status(200).json(r || {});
      }
      return res.status(400).json({ error: 'непонятный запрос' });
    }

    const id = String(q.id || '');
    if (!id) return res.status(400).json({ error: 'не указана комната' });

    if (q.what === 'videos') {
      const videos = await db.rpc('room_videos', { p_user: me.id, p_room: id });
      return res.status(200).json({ videos: videos || [], link: link(id) });
    }

    const st = await db.rpc('room_state', { p_user: me.id, p_room: id, p_since: parseInt(q.since, 10) || 0 });
    res.status(200).json(st || { ok: false });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
};
