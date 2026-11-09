// Чаты: друзья, личная переписка и компании.
// Друзья появляются по ссылке-приглашению — так же, как в Telegram зовут в чат.
import { useCallback, useEffect, useRef, useState } from 'react';
import { I, Avatar } from './Icons';
import { StickerPanel } from './Stickers';
import { ago } from '../lib/format';
import { getChats, getFriends, getInvite, openChat, sendMsg, chatWith, makeGroup, getShelves, makeRoom, setNotify } from '../lib/api';
import { shareUrl, haptic, backButton, askWrite } from '../lib/tg';
import { canRecord, startRec } from '../lib/voice';

const Empty = ({ emoji, title, text, children }) => (
  <div className="empty"><span className="empty-emoji">{emoji}</span><b>{title}</b><p>{text}</p>{children}</div>
);


const mmss = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

// Голосовое: дорожка рисуется из уровней громкости, записанных при съёмке
function Voice({ url, sec, wave, mine }) {
  const [on, setOn] = useState(false);
  const [pos, setPos] = useState(0);
  const a = useRef(null);
  const bars = (wave && wave.length ? wave : Array.from({ length: 28 }, (_, i) => 20 + ((i * 37) % 60)));

  const toggle = () => {
    if (!a.current) {
      a.current = new Audio(url);
      a.current.onended = () => { setOn(false); setPos(0); };
      a.current.ontimeupdate = () => setPos(a.current.currentTime / (a.current.duration || sec || 1));
    }
    if (on) { a.current.pause(); setOn(false); } else { a.current.play().catch(() => {}); setOn(true); }
  };
  useEffect(() => () => { if (a.current) a.current.pause(); }, []);

  return (
    <span className={'bubble voice' + (mine ? ' mine' : '')}>
      <button onClick={toggle} aria-label={on ? 'Пауза' : 'Слушать'}>
        {on ? <I.close width="15" height="15" /> : <I.play width="15" height="15" />}
      </button>
      <span className="wave">
        {bars.map((v, i) => (
          <i key={i} className={i / bars.length <= pos ? 'done' : ''} style={{ height: Math.max(3, Math.min(20, v / 5)) + 'px' }} />
        ))}
      </span>
      <small>{mmss(sec || 0)}</small>
    </span>
  );
}

// ---------- переписка ----------
function Room({ chat, onBack, onOpenVideo }) {
  const [list, setList] = useState([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [panel, setPanel] = useState(false);
  const [rec, setRec] = useState(null);      // идёт запись
  const [recSec, setRecSec] = useState(0);
  const box = useRef(null);
  const lastId = useRef(0);

  const toBottom = () => { const b = box.current; if (b) b.scrollTop = b.scrollHeight; };

  const pull = useCallback(async (quiet) => {
    try {
      const r = await openChat(chat.id);
      const msgs = r.messages || [];
      const top = msgs.length ? msgs[msgs.length - 1].id : 0;
      if (top !== lastId.current) { lastId.current = top; setList(msgs); setTimeout(toBottom, 30); }
      setErr('');
    } catch (e) { if (!quiet) setErr(e.message); }
  }, [chat.id]);

  useEffect(() => { pull(); }, [pull]);
  // новые сообщения подтягиваем сами, пока чат открыт
  useEffect(() => { const t = setInterval(() => pull(true), 4000); return () => clearInterval(t); }, [pull]);
  useEffect(() => backButton(true, onBack), [onBack]);

  const push = async (payload, undo) => {
    setBusy(true); setErr('');
    try {
      const r = await sendMsg({ chat: chat.id, ...payload });
      if (r.message) { setList(p => p.concat(r.message)); lastId.current = r.message.id; setTimeout(toBottom, 30); }
      haptic('light');
    } catch (e) { setErr(e.message); if (undo) undo(); }
    finally { setBusy(false); }
  };

  const send = e => {
    e.preventDefault();
    const body = text.trim();
    if (!body || busy) return;
    setText('');
    push({ text: body }, () => setText(body));
  };

  // запись голосового: нажал — пишем, ещё раз — отправили
  const micOn = async () => {
    if (!canRecord()) return setErr('браузер не умеет записывать звук');
    try {
      setErr(''); setRecSec(0);
      const r = await startRec((lvl, t) => setRecSec(t));
      setRec(r);
    } catch (e) { setErr('не дали доступ к микрофону'); }
  };
  const micOff = async () => {
    if (!rec) return;
    const r = rec; setRec(null);
    const got = await r.stop();
    if (!got || got.sec < 0.6) return;                       // случайное касание не отправляем
    push({ voice: got.dataURL, sec: got.sec, wave: got.wave });
  };
  const micCancel = () => { if (rec) { rec.cancel(); setRec(null); } };

  return (
    <div className="room">
      <header className="room-top">
        <button onClick={onBack} aria-label="Назад"><I.back width="22" height="22" /></button>
        <Avatar ch={{ avatar: chat.photo, title: chat.title }} size={34} />
        <div className="room-who">
          <b>{chat.title}</b>
          {chat.kind === 'group' && <small>{chat.members} участника</small>}
        </div>
      </header>

      <div className="room-body" ref={box}>
        {!list.length && <Empty emoji="👋" title="Пока тихо" text="Напиши первым — или скинь видео из ленты." />}
        {list.map((m, k) => {
          const first = k === 0 || list[k - 1].user_id !== m.user_id;
          return (
            <div key={m.id} className={'msg' + (m.mine ? ' mine' : '') + (first ? ' first' : '')}>
              {!m.mine && first && chat.kind === 'group' && <span className="msg-who">{m.user_name}</span>}
              {m.kind === 'voice' && m.media_url
                ? <Voice url={m.media_url} sec={m.media_sec} wave={m.wave} mine={m.mine} />
                : m.kind === 'sticker' && m.sticker_url
                ? <img className="msg-sticker" src={m.sticker_url} alt="стикер" />
                : m.kind === 'video' && m.video_id
                ? <button className="msg-video" onClick={() => onOpenVideo(m.video_id)}>
                    {m.video_thumb ? <img src={m.video_thumb} alt="" loading="lazy" /> : <span className="msg-noimg" />}
                    <span className="msg-play"><I.play width="22" height="22" /></span>
                    {m.video_caption && <small>{m.video_caption}</small>}
                  </button>
                : m.kind === 'shelf'
                  ? <span className="bubble shelf">🔖 Полка «{m.shelf_title || 'без названия'}» · {m.shelf_items || 0}</span>
                  : <span className="bubble">{m.body}</span>}
              <time>{ago(m.at)}</time>
            </div>
          );
        })}
      </div>

      {err && <p className="room-err">{err}</p>}
      {panel && <StickerPanel onClose={() => setPanel(false)}
        onPick={s2 => { setPanel(false); push({ sticker: s2.id }); }} />}

      {rec
        ? <div className="room-send recording">
            <button type="button" className="ic" onClick={micCancel} aria-label="Отменить"><I.close width="19" height="19" /></button>
            <span className="rec-live"><i /> Запись · {mmss(recSec)}</span>
            <button type="button" className="go" onClick={micOff} aria-label="Отправить"><I.plane width="20" height="20" /></button>
          </div>
        : <form className="room-send" onSubmit={send}>
            <button type="button" className="ic" onClick={() => setPanel(p => !p)} aria-label="Стикеры"><I.spark width="20" height="20" /></button>
            <input value={text} onChange={e => setText(e.target.value)} placeholder="Сообщение" maxLength={2000} />
            {text.trim()
              ? <button className="go" disabled={busy} aria-label="Отправить"><I.plane width="20" height="20" /></button>
              : <button type="button" className="go" onClick={micOn} aria-label="Записать голосовое"><I.mic width="20" height="20" /></button>}
          </form>}
    </div>
  );
}

// ---------- сбор компании ----------
function NewGroup({ friends, onDone, onBack }) {
  const [title, setTitle] = useState('');
  const [picked, setPicked] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const flip = id => setPicked(p => p.includes(id) ? p.filter(x => x !== id) : p.concat(id));

  const go = async () => {
    if (!picked.length || busy) return;
    setBusy(true); setErr('');
    try { const r = await makeGroup(title.trim() || 'Компания', picked); onDone(r.chat); }
    catch (e) { setErr(e.message); setBusy(false); }
  };

  return (
    <div className="room">
      <header className="room-top">
        <button onClick={onBack} aria-label="Назад"><I.back width="22" height="22" /></button>
        <div className="room-who"><b>Новая компания</b><small>выбери, кого позвать</small></div>
      </header>
      <div className="room-body pad">
        <input className="fld" value={title} onChange={e => setTitle(e.target.value)} placeholder="Название" maxLength={60} />
        <div className="picks">
          {friends.map(f => (
            <button key={f.id} className={'pick' + (picked.includes(f.id) ? ' on' : '')} onClick={() => flip(f.id)}>
              <Avatar ch={{ avatar: f.photo, title: f.name }} size={40} />
              <span>{f.name}</span>
              {picked.includes(f.id) && <i><I.check width="14" height="14" /></i>}
            </button>
          ))}
        </div>
        {err && <p className="room-err">{err}</p>}
      </div>
      <div className="room-send">
        <button className="btn btn-grad wide" disabled={!picked.length || busy} onClick={go}>
          {busy ? 'Создаю…' : `Создать${picked.length ? ' · ' + picked.length : ''}`}
        </button>
      </div>
    </div>
  );
}

// ---------- главный экран ----------
export function Chats({ onOpenVideo, onRoom, openId }) {
  const [chats, setChats] = useState([]);
  const [friends, setFriends] = useState([]);
  const [open, setOpen] = useState(null);     // открытая переписка
  const [group, setGroup] = useState(false);  // экран сбора компании
  const [shelves, setShelves] = useState(null); // выбор полки для комнаты
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const load = useCallback(() => Promise.all([getChats(), getFriends()])
    .then(([a, b]) => { setChats(a.chats || []); setFriends(b.friends || []); setErr(''); })
    .catch(e => setErr(e.message))
    .finally(() => setLoading(false)), []);

  useEffect(() => { load(); }, [load]);

  // один раз спрашиваем у Telegram разрешение писать — чтобы бот мог сообщать о новых сообщениях
  useEffect(() => {
    let asked = false;
    try { asked = localStorage.getItem('ask-write') === '1'; } catch (e) {}
    if (asked) return;
    askWrite().then(ok => {
      try { localStorage.setItem('ask-write', '1'); } catch (e) {}
      if (ok) setNotify(true, true).catch(() => {});
    });
  }, []);

  // пришли по ссылке из уведомления — открываем нужный чат
  useEffect(() => {
    if (!openId) return;
    const c = chats.find(x => x.id === openId);
    setOpen(c || { id: openId, kind: 'dm', title: 'Чат' });
  }, [openId, chats]);

  // пока экран открыт, список сам обновляется — видно новые сообщения
  useEffect(() => { if (open || group) return; const t = setInterval(load, 8000); return () => clearInterval(t); }, [open, group, load]);

  const invite = async () => {
    try {
      const r = await getInvite();
      shareUrl(r.link, 'Залетай, тут норм видосы');
    } catch (e) { setErr(e.message); }
  };

  const toFriend = async f => {
    try { const r = await chatWith(f.id); setOpen({ id: r.chat, kind: 'dm', title: f.name, photo: f.photo }); }
    catch (e) { setErr(e.message); }
  };

  // «смотреть вместе»: берём полку и превращаем её в комнату
  const together = async () => {
    try { const r = await getShelves(); setShelves((r.shelves || []).filter(s => s.items > 0)); }
    catch (e) { setErr(e.message); }
  };
  const roomFrom = async sh => {
    setShelves(null);
    try { const r = await makeRoom(sh.title, { shelf: sh.id }); if (r.id) onRoom(r.id); else setErr(r.error || 'не вышло'); }
    catch (e) { setErr(e.message); }
  };

  const back = useCallback(() => { setOpen(null); setGroup(false); load(); }, [load]);

  if (open) return <Room chat={open} onBack={back} onOpenVideo={onOpenVideo} />;
  if (group) return <NewGroup friends={friends} onBack={back}
    onDone={id => { setGroup(false); load(); setOpen({ id, kind: 'group', title: 'Компания', members: 0 }); }} />;

  return (
    <div className="page">
      <div className="chats-top">
        <h1>Чаты</h1>
        <div>
          <button className="mini" onClick={together}><I.play width="15" height="15" /> Вместе</button>
          {friends.length > 1 && <button className="mini" onClick={() => setGroup(true)}><I.users width="16" height="16" /> Компания</button>}
          <button className="mini grad" onClick={invite}>+ Позвать</button>
        </div>
      </div>

      {friends.length > 0 && (
        <div className="fstrip">
          {friends.map(f => (
            <button key={f.id} onClick={() => toFriend(f)}>
              <span className="ring"><Avatar ch={{ avatar: f.photo, title: f.name }} size={52} /></span>
              <small>{f.name}</small>
            </button>
          ))}
        </div>
      )}

      {err && <p className="room-err">{err}</p>}

      {shelves && (
        <div className="picks pad">
          <p className="snote">Какую полку смотрим вместе?</p>
          {shelves.length
            ? shelves.map(s2 => <button key={s2.id} className="pick" onClick={() => roomFrom(s2)}>{s2.title} · {s2.items}</button>)
            : <p className="snote">Сначала собери полку в профиле — комната берёт ролики с неё.</p>}
          <button className="mini" onClick={() => setShelves(null)}>отмена</button>
        </div>
      )}

      {loading
        ? <div className="clist">{[0, 1, 2].map(k => <span key={k} className="sk sk-row" />)}</div>
        : chats.length
          ? <div className="clist">
              {chats.map(c => (
                <button key={c.id} className="crow" onClick={() => setOpen(c)}>
                  <Avatar ch={{ avatar: c.photo, title: c.title }} size={50} />
                  <div>
                    <b>{c.title}</b>
                    <small>{c.last_body || 'пока пусто'}</small>
                  </div>
                  <div className="cmeta">
                    <time>{c.last_at ? ago(c.last_at) : ''}</time>
                    {c.unread > 0 && <i>{c.unread > 99 ? '99+' : c.unread}</i>}
                  </div>
                </button>
              ))}
            </div>
          : <Empty emoji="💬" title={friends.length ? 'Чатов пока нет' : 'Тут пока пусто'}
              text={friends.length ? 'Нажми на друга сверху — и пиши.' : 'Кинь другу ссылку — он попадёт сразу в приложение, и вы станете друзьями.'}>
              {!friends.length && <button className="btn btn-grad" onClick={invite}>Позвать друга</button>}
            </Empty>}
    </div>
  );
}
