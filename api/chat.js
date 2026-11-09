// Друзья и чаты: список, переписка, отправка сообщений и видео.
const db = require('./_db.js');
const { who, whyNot } = require('./_auth.js');

const BOT = String(process.env.BOT_USERNAME || 'scroll_app_bot').replace(/^@/, '');
const APP = String(process.env.APP_SHORT || 'app');
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

      // перешли по ссылке-приглашению — становимся друзьями
      if (body.accept) {
        const r = await db.rpc('invite_accept', {
          p_user: me.id, p_name: me.name, p_photo: me.photo, p_code: String(body.accept).slice(0, 32)
        });
        return res.status(200).json(r || { ok: false, why: 'не вышло' });
      }

      // открыть личный чат с другом
      if (body.friend) {
        const chat = await db.rpc('chat_with', { p_user: me.id, p_friend: Number(body.friend) });
        return res.status(200).json({ ok: true, chat });
      }

      // собрать компанию
      if (body.group) {
        const members = Array.isArray(body.members) ? body.members.slice(0, 50).map(Number).filter(Boolean) : [];
        if (!members.length) return res.status(400).json({ error: 'некого добавить' });
        const chat = await db.rpc('chat_group', { p_user: me.id, p_title: String(body.group).slice(0, 60), p_members: members });
        return res.status(200).json({ ok: true, chat });
      }

      // отметить прочитанным
      if (body.read) {
        await db.rpc('chat_read', { p_user: me.id, p_chat: String(body.read) });
        return res.status(200).json({ ok: true });
      }

      // написать в чат
      const chat = String(body.chat || '');
      if (!chat) return res.status(400).json({ error: 'не указан чат' });
      if (await db.rpc('hit_limit', { p_user: me.id, p_kind: 'msg', p_max: 120, p_seconds: 300 }))
        return res.status(429).json({ error: 'слишком часто' });

      // голосовое приходит записью с телефона — кладём в хранилище и ссылку в сообщение
      let media = null, sec = null, wave = null;
      if (body.voice) {
        const raw = String(body.voice);
        const base64 = raw.includes(',') ? raw.slice(raw.indexOf(',') + 1) : raw;
        const buf = Buffer.from(base64, 'base64');
        if (!buf.length) return res.status(400).json({ error: 'пустая запись' });
        if (buf.length > 4 * 1024 * 1024) return res.status(413).json({ error: 'запись слишком длинная' });
        const type = /ogg/.test(raw.slice(0, 40)) ? 'audio/ogg' : /mp4|m4a/.test(raw.slice(0, 40)) ? 'audio/mp4' : 'audio/webm';
        const ext = type.split('/')[1].replace('mpeg', 'mp3');
        media = await db.putFile('voice', `${chat}/${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}.${ext}`, buf, type);
        sec = Math.min(300, Math.max(0.3, Number(body.sec) || 1));
        wave = Array.isArray(body.wave) ? body.wave.slice(0, 48).map(n => Math.max(0, Math.min(100, Math.round(Number(n) || 0)))) : null;
      }

      const kind = body.voice ? 'voice' : body.sticker ? 'sticker' : body.video ? 'video' : body.shelf ? 'shelf' : 'text';
      const msg = await db.rpc('chat_send', {
        p_user: me.id, p_name: me.name, p_photo: me.photo, p_chat: chat, p_kind: kind,
        p_body: typeof body.text === 'string' ? body.text : null,
        p_video: body.video ? String(body.video) : null,
        p_shelf: body.shelf ? String(body.shelf) : null,
        p_media: media, p_sec: sec, p_wave: wave,
        p_sticker: body.sticker ? String(body.sticker) : null,
        p_reply: body.reply ? Number(body.reply) : null
      });
      return res.status(200).json({ ok: true, message: msg });
    }

    // ролик, присланный в чат — открываем его как обычное видео
    if (q.what === 'video') {
      const rows = await db.rpc('video_one', { p_user: me.id, p_id: String(q.id || '') });
      const v = (rows || [])[0];
      if (!v) return res.status(404).json({ error: 'ролик не найден' });
      return res.status(200).json({ video: v });
    }

    if (q.what === 'friends') {
      const friends = await db.rpc('friends_of', { p_user: me.id });
      return res.status(200).json({ friends: friends || [] });
    }

    // ссылка-приглашение: по ней человек попадает прямо в приложение и становится другом
    if (q.what === 'invite') {
      const code = await db.rpc('invite_make', { p_user: me.id });
      return res.status(200).json({ code, link: `https://t.me/${BOT}/${APP}?startapp=inv_${code}` });
    }

    if (q.what === 'open') {
      const chat = String(q.chat || '');
      if (!chat) return res.status(400).json({ error: 'не указан чат' });
      const messages = await db.rpc('chat_open', {
        p_user: me.id, p_chat: chat, p_limit: num(q.limit, 50, 100), p_skip: num(q.skip, 0, 5000)
      });
      await db.rpc('chat_read', { p_user: me.id, p_chat: chat });
      return res.status(200).json({ messages: (messages || []).reverse() });   // снизу — свежие
    }

    const chats = await db.rpc('chats_of', { p_user: me.id });
    res.status(200).json({ chats: chats || [], me: { id: me.id, name: me.name, photo: me.photo } });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
};
