// Стикеры: человек приносит свой набор из Telegram, и набор работает у него в чатах.
// В общую библиотеку набор попадает только после проверки ИИ — так договорились.
const db = require('./_db.js');
const { who, whyNot } = require('./_auth.js');
const { screenPack, FALLBACK } = require('./_screen.js');
const { reviewPack } = require('./_ai.js');

const TOKEN = () => String(process.env.BOT_TOKEN || '').trim();
const MAX_STICKERS = 30;        // больше за один заход не тянем — иначе запрос не успеет
const PARALLEL = 6;

// Принимаем и ссылку, и просто имя набора
function packName(raw) {
  const s = String(raw || '').trim();
  const m = s.match(/(?:t\.me|telegram\.me)\/addstickers\/([A-Za-z0-9_]+)/i);
  const name = m ? m[1] : s.replace(/^@/, '');
  return /^[A-Za-z0-9_]{1,64}$/.test(name) ? name : null;
}

async function bot(method, params) {
  if (!TOKEN()) throw new Error('не задан BOT_TOKEN');
  const r = await fetch(`https://api.telegram.org/bot${TOKEN()}/${method}`, {
    method: 'POST', signal: AbortSignal.timeout(10000),
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(params)
  });
  const j = await r.json().catch(() => null);
  if (!j || !j.ok) throw new Error((j && j.description) || `Telegram ответил ${r.status}`);
  return j.result;
}

// Берём у стикера то, что покажем: саму картинку, а для анимированных — их превью
function pick(st) {
  if (st.is_animated) {
    const t = st.thumbnail || st.thumb;
    return t ? { file: t.file_id, kind: 'static', w: t.width, h: t.height } : null;
  }
  return { file: st.file_id, kind: st.is_video ? 'video' : 'static', w: st.width, h: st.height };
}

async function fetchOne(st, i, pack) {
  const got = pick(st);
  if (!got) return null;
  const info = await bot('getFile', { file_id: got.file });
  const r = await fetch(`https://api.telegram.org/file/bot${TOKEN()}/${info.file_path}`, { signal: AbortSignal.timeout(12000) });
  if (!r.ok) throw new Error('файл не скачался');
  const buf = Buffer.from(await r.arrayBuffer());
  const ext = (info.file_path.split('.').pop() || 'webp').toLowerCase();
  const type = ext === 'webm' ? 'video/webm' : ext === 'png' ? 'image/png' : 'image/webp';
  const url = await db.putFile('stickers', `${pack}/${st.file_unique_id}.${ext}`, buf, type);
  return { id: st.file_unique_id, emoji: st.emoji || '', url, file_id: got.file,
           kind: got.kind, w: got.w || 512, h: got.h || 512, pos: i };
}

// качаем пачками, чтобы не ждать по одному и не завалить Telegram разом
async function fetchAll(list, pack) {
  const out = [];
  for (let i = 0; i < list.length; i += PARALLEL) {
    const part = await Promise.all(list.slice(i, i + PARALLEL).map((st, k) =>
      fetchOne(st, i + k, pack).catch(() => null)));
    out.push(...part.filter(Boolean));
  }
  return out;
}

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

      // забрать набор из общей библиотеки
      if (body.take) return res.status(200).json(await db.rpc('pack_take', { p_user: me.id, p_name: String(body.take) }) || {});
      if (body.drop) { await db.rpc('pack_drop', { p_user: me.id, p_name: String(body.drop) }); return res.status(200).json({ ok: true }); }
      if (body.report) return res.status(200).json(await db.rpc('pack_report', { p_user: me.id, p_name: String(body.report) }) || {});

      // отправить свой набор в общую библиотеку — тут и смотрит ИИ
      if (body.share) {
        const name = packName(body.share);
        if (!name) return res.status(400).json({ error: 'непонятное имя набора' });
        const [p] = await db.rpc('pack_one', { p_name: name }) || [];
        if (!p) return res.status(404).json({ error: 'набор не найден' });
        if (p.status === 'shared') return res.status(200).json({ ok: true, status: 'shared' });
        if (p.status === 'blocked') return res.status(200).json({ ok: false, status: 'blocked', why: p.reason || 'набор запрещён' });

        const items = await db.select('stickers', `pack=eq.${encodeURIComponent(name)}&select=url&order=pos&limit=16`);
        const v = await reviewPack({ name, title: p.title, items: items || [] });
        await db.patch('sticker_packs', `name=eq.${encodeURIComponent(name)}`,
          { status: v.status, reason: v.reason, checked_at: new Date().toISOString() });
        return res.status(200).json({
          ok: v.status === 'shared', status: v.status,
          why: v.status === 'shared' ? null : (v.reason || 'ИИ не пропустил набор в общий доступ')
        });
      }

      // принести свой набор
      const name = packName(body.add);
      if (!name) return res.status(400).json({ error: 'пришли ссылку вида t.me/addstickers/название' });
      if (await db.rpc('hit_limit', { p_user: me.id, p_kind: 'pack', p_max: 10, p_seconds: 3600 }))
        return res.status(429).json({ error: 'слишком часто, попробуй попозже' });

      // если набор уже разобран — просто привязываем к человеку, заново не качаем
      const [have] = await db.rpc('pack_one', { p_name: name }) || [];
      if (have && have.status === 'blocked') return res.status(200).json({ ok: false, status: 'blocked', why: have.reason || 'набор запрещён' });
      if (have && have.total > 0) {
        await db.rpc('pack_take', { p_user: me.id, p_name: name }).catch(() => {});
        if (have.status !== 'shared') await db.rpc('pack_save', {
          p_user: me.id, p_name: name, p_title: have.title, p_kind: have.kind,
          p_total: have.total, p_status: have.status, p_reason: have.reason, p_items: []
        });
        return res.status(200).json({ ok: true, status: have.status, pack: have });
      }

      const set = await bot('getStickerSet', { name });
      const list = (set.stickers || []).slice(0, MAX_STICKERS);
      if (!list.length) return res.status(400).json({ error: 'в наборе нет стикеров' });

      // грубая отсечка по названию и эмодзи — до того, как что-то качать
      const rows = await db.select('blocklist', 'select=word,hard').catch(() => null);
      const words = FALLBACK.concat((rows || []).map(w => [w.word, w.hard ? 1 : 0]));
      const seen = screenPack({ name, title: set.title, total: list.length, emojis: list.map(s => s.emoji) }, words);
      if (seen.status === 'blocked') {
        await db.rpc('pack_save', { p_user: me.id, p_name: name, p_title: set.title,
          p_kind: 'static', p_total: list.length, p_status: 'blocked', p_reason: seen.reason, p_items: [] });
        return res.status(200).json({ ok: false, status: 'blocked', why: seen.reason });
      }

      const items = await fetchAll(list, name);
      if (!items.length) return res.status(502).json({ error: 'не получилось забрать картинки набора' });

      const kind = items.some(i => i.kind === 'video') ? 'video' : 'static';
      const pack = await db.rpc('pack_save', {
        p_user: me.id, p_name: name, p_title: set.title, p_kind: kind,
        p_total: items.length, p_status: 'private', p_reason: seen.reason, p_items: items
      });
      return res.status(200).json({ ok: true, status: 'private', pack, got: items.length, total: (set.stickers || []).length });
    }

    if (q.what === 'shared') {
      const packs = await db.rpc('packs_shared', { p_user: me.id, p_q: String(q.q || '').slice(0, 40), p_limit: 40 });
      return res.status(200).json({ packs: packs || [] });
    }

    const packs = await db.rpc('packs_mine', { p_user: me.id });
    res.status(200).json({ packs: packs || [] });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
};

module.exports.config = { maxDuration: 60 };
