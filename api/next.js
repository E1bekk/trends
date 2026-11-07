// Лента: отдаём порцию роликов, уже подобранную под человека.
// Вся умная часть живёт в базе (функция feed_for), здесь только проверка и передача.
const db = require('./_db.js');
const { who } = require('./_auth.js');

const MODES = ['foryou', 'trends', 'fresh', 'follow'];

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  const q = req.query || {};
  try {
    const me = who(req);                       // без подписи Telegram — просто гость, лента общая
    const videos = await db.rpc('feed_for', {
      p_user: me ? me.id : null,
      p_mode: MODES.includes(q.mode) ? q.mode : 'foryou',
      p_vibe: /^[a-z_]{2,20}$/.test(q.vibe || '') ? q.vibe : null,
      p_limit: Math.min(30, Math.max(1, parseInt(q.limit, 10) || 20)),
      p_skip: Math.min(2000, Math.max(0, parseInt(q.skip, 10) || 0))
    });
    // у гостя лента одинаковая — её можно подержать в кэше, у своего человека нельзя
    res.setHeader('Cache-Control', me ? 'private, no-store' : 's-maxage=60, stale-while-revalidate=300');
    res.status(200).json({
      videos: videos || [],
      me: me ? { id: me.id, name: me.name, photo: me.photo } : null
    });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
};
