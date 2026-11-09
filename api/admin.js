// Админка: цифры, жалобы, наборы стикеров, блокировка роликов и каналов.
// Кто админ — задаётся переменной ADMIN_IDS (номера через запятую).
// Если переменная пустая, админов нет вообще: случайно открытой админки не будет.
const db = require('./_db.js');
const { who, whyNot } = require('./_auth.js');

const ADMINS = String(process.env.ADMIN_IDS || '')
  .split(/[,\s]+/).map(s => s.trim()).filter(Boolean).map(Number).filter(n => n > 0);
const isAdmin = id => ADMINS.includes(Number(id));

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const me = who(req);
  if (!me) return res.status(401).json({ error: 'Telegram не подтвердил, кто ты: ' + whyNot(req) });
  if (!isAdmin(me.id)) return res.status(403).json({ error: 'сюда нельзя' });
  const q = req.query || {};

  try {
    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});

      if (body.pack) return res.status(200).json(await db.rpc('mod_pack', {
        p_name: String(body.pack), p_status: String(body.status || 'private'),
        p_reason: body.reason ? String(body.reason).slice(0, 200) : null
      }) || {});

      if (body.comment !== undefined) {
        await db.rpc('mod_comment', { p_id: Number(body.comment), p_hide: !!body.hide });
        return res.status(200).json({ ok: true });
      }
      if (body.video) {
        await db.rpc('mod_video', { p_id: String(body.video), p_blocked: !!body.block });
        return res.status(200).json({ ok: true });
      }
      if (body.author) {
        await db.rpc('mod_author', { p_username: String(body.author), p_blocked: !!body.block });
        return res.status(200).json({ ok: true });
      }
      // решить судьбу найденного канала руками
      if (body.cand) {
        await db.rpc('cand_decide', {
          p_name: String(body.cand), p_status: String(body.status || 'rejected'),
          p_reason: body.reason ? String(body.reason).slice(0, 200) : 'решено вручную',
          p_videos: Number(body.videos) || 0, p_subs: Number(body.subs) || 0,
          p_last: null, p_title: body.title ? String(body.title) : null, p_avatar: null
        });
        return res.status(200).json({ ok: true });
      }

      // пересчитать цифры за последние дни вручную
      if (body.roll) { await db.rpc('roll_days', { p_days: Math.min(90, Number(body.roll) || 3) }); return res.status(200).json({ ok: true }); }
      return res.status(400).json({ error: 'непонятный запрос' });
    }

    if (q.what === 'reports') return res.status(200).json({ reports: await db.rpc('reports_list', { p_limit: 60 }) || [] });
    if (q.what === 'packs') return res.status(200).json({ packs: await db.rpc('packs_list', { p_status: String(q.status || ''), p_limit: 60 }) || [] });
    if (q.what === 'cands') return res.status(200).json({ cands: await db.rpc('cands_list', { p_status: String(q.status || 'new'), p_limit: 60 }) || [] });
    if (q.what === 'videos') return res.status(200).json({ videos: await db.rpc('videos_find', { p_q: String(q.q || ''), p_limit: 40 }) || [] });

    const [now, days, top] = await Promise.all([
      db.rpc('stats_now'),
      db.rpc('stats_days', { p_days: Math.min(90, parseInt(q.days, 10) || 30) }),
      db.rpc('stats_top', { p_limit: 10 })
    ]);
    res.status(200).json({ now: now || {}, days: days || [], top: top || {} });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
};
