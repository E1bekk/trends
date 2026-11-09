// Полки: своя подборка роликов, которой делятся одной ссылкой.
const db = require('./_db.js');
const { who, whyNot } = require('./_auth.js');

const BOT = String(process.env.BOT_USERNAME || 'scroll_app_bot').replace(/^@/, '');
const APP = String(process.env.APP_SHORT || 'app');
const link = id => `https://t.me/${BOT}/${APP}?startapp=sh_${id}`;
const num = (v, def, max) => Math.min(max, Math.max(0, parseInt(v, 10) || def));

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

      if (body.make) {
        const sh = await db.rpc('shelf_make', {
          p_user: me.id, p_title: String(body.make).slice(0, 60),
          p_first: body.video ? String(body.video) : null
        });
        return res.status(200).json({ ok: true, shelf: sh, link: sh && link(sh.id) });
      }
      if (body.put) return res.status(200).json(await db.rpc('shelf_put', { p_user: me.id, p_shelf: String(body.put), p_video: String(body.video || '') }) || {});
      if (body.pull) return res.status(200).json(await db.rpc('shelf_pull', { p_user: me.id, p_shelf: String(body.pull), p_video: String(body.video || '') }) || {});
      if (body.rename) { await db.rpc('shelf_rename', { p_user: me.id, p_shelf: String(body.rename), p_title: String(body.title || '') }); return res.status(200).json({ ok: true }); }
      if (body.remove) { await db.rpc('shelf_drop', { p_user: me.id, p_shelf: String(body.remove) }); return res.status(200).json({ ok: true }); }
      if (body.take) {
        const r = await db.rpc('shelf_take', { p_user: me.id, p_shelf: String(body.take) });
        return res.status(200).json(r || {});
      }
      return res.status(400).json({ error: 'непонятный запрос' });
    }

    // содержимое полки — открыть может любой, у кого есть ссылка
    if (q.id) {
      const [info] = await db.select('shelves', `id=eq.${encodeURIComponent(q.id)}&select=id,title,cover,items,user_id,user_name,opens,taken`) || [];
      if (!info) return res.status(404).json({ error: 'полка не найдена' });
      const videos = await db.rpc('shelf_open', {
        p_user: me.id, p_shelf: String(q.id), p_limit: num(q.limit, 50, 100), p_skip: num(q.skip, 0, 500)
      });
      if (info.user_id !== me.id) await db.rpc('bump_shelf_open', { p_shelf: String(q.id) }).catch(() => {});
      return res.status(200).json({ shelf: { ...info, mine: info.user_id === me.id }, videos: videos || [], link: link(info.id) });
    }

    const shelves = await db.rpc('shelves_of', { p_user: me.id });
    res.status(200).json({ shelves: (shelves || []).map(s => ({ ...s, link: link(s.id) })) });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
};
