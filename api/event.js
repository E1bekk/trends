// Что человек делает с роликами: досмотрел, пролистал, лайкнул, сохранил, поделился.
// Приложение копит события и присылает пачкой раз в несколько секунд.
const db = require('./_db.js');
const { who, whyNot } = require('./_auth.js');

const KINDS = ['watch', 'like', 'save', 'share', 'open'];
const num = (v, max) => Math.min(max, Math.max(0, Number(v) || 0));

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'только POST' });

  const me = who(req);
  if (!me) return res.status(401).json({ error: 'Telegram не подтвердил, кто ты: ' + whyNot(req) });

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const events = (Array.isArray(body.events) ? body.events : [])
    .filter(e => e && typeof e.v === 'string' && e.v.length < 80 && KINDS.includes(e.kind))
    .slice(0, 50)
    .map(e => ({
      v: e.v, kind: e.kind,
      sec: num(e.sec, 3600),
      ratio: num(e.ratio, 1),
      on: e.on === undefined ? true : Boolean(e.on)
    }));
  if (!events.length) return res.status(200).json({ ok: true, saved: 0 });

  try {
    // защита от спама: не больше 60 обращений в минуту с одного человека
    if (await db.rpc('hit_limit', { p_user: me.id, p_kind: 'event', p_max: 60, p_seconds: 60 }))
      return res.status(429).json({ error: 'слишком часто' });

    await db.rpc('log_events', {
      p_user: me.id, p_name: me.name, p_photo: me.photo, p_lang: me.lang, p_events: events
    });
    res.status(200).json({ ok: true, saved: events.length });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
};
