// Комментарии под видео: выезжают снизу, как в TikTok.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { I, Avatar } from './Icons';
import { fmt, ago } from '../lib/format';
import { getComments, addComment, likeComment, removeComment, reportComment } from '../lib/api';
import { haptic, tgUser } from '../lib/tg';

export default function Comments({ video, onClose, onCount }) {
  const [list, setList] = useState(null);
  const [text, setText] = useState('');
  const [reply, setReply] = useState(null);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState('');
  const inputRef = useRef(null);
  const me = tgUser();

  useEffect(() => {
    let gone = false;
    getComments(video.id)
      .then(r => { if (!gone) setList(r.comments || []); })
      .catch(e => { if (!gone) { setList([]); setErr(e.message); } });
    return () => { gone = true; };
  }, [video.id]);

  const send = async () => {
    const t = text.trim();
    if (!t || sending) return;
    setSending(true); setErr('');
    try {
      const r = await addComment(video.id, t, reply ? reply.id : null);
      if (r.comment) {
        setList(l => [r.comment, ...(l || [])]);
        onCount && onCount(1);
      }
      setText(''); setReply(null); haptic();
    } catch (e) { setErr(e.message); }
    finally { setSending(false); }
  };

  const like = async c => {
    setList(l => l.map(x => x.id === c.id ? { ...x, liked: !x.liked, likes: Math.max(0, x.likes + (x.liked ? -1 : 1)) } : x));
    haptic();
    try { await likeComment(c.id); } catch (e) {
      setList(l => l.map(x => x.id === c.id ? { ...x, liked: c.liked, likes: c.likes } : x));
    }
  };
  const drop = async c => {
    if (!confirm('Удалить свой комментарий?')) return;
    setList(l => l.filter(x => x.id !== c.id)); onCount && onCount(-1);
    try { await removeComment(c.id); } catch (e) {}
  };
  const complain = async c => {
    if (!confirm('Пожаловаться на этот комментарий?')) return;
    setList(l => l.filter(x => x.id !== c.id));
    try { await reportComment(c.id); } catch (e) {}
  };

  // Рисуем поверх всей страницы, а не внутри ленты — иначе нижнее меню накроет поле ввода
  return createPortal(
    <div className="sheet-wrap" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()}>
        <div className="sheet-grab" />
        <div className="sheet-head">
          <b>{list === null ? 'Комментарии' : list.length ? `${fmt(list.length)} коммент.` : 'Комментарии'}</b>
          <button onClick={onClose}><I.close width="20" height="20" /></button>
        </div>

        <div className="clist">
          {list === null && <div className="cload">{[0, 1, 2].map(i => <span key={i} className="sk sk-c" />)}</div>}
          {list && !list.length && (
            <div className="empty"><div className="empty-emoji">💬</div><b>Пока тихо</b><p>Будь первым, кто напишет.</p></div>
          )}
          {list && list.map(c => (
            <div key={c.id} className="citem">
              <Avatar ch={{ avatar: c.user_photo, title: c.user_name }} size={34} />
              <div className="cbody">
                <div className="cname">{c.user_name || 'Гость'}<i>{ago(c.at)}</i></div>
                <p className="ctext">{c.body}</p>
                <div className="cact">
                  <button onClick={() => { setReply(c); inputRef.current && inputRef.current.focus(); }}>Ответить</button>
                  {c.mine
                    ? <button onClick={() => drop(c)}>Удалить</button>
                    : <button onClick={() => complain(c)}>Пожаловаться</button>}
                </div>
              </div>
              <button className={'clike' + (c.liked ? ' on' : '')} onClick={() => like(c)}>
                <I.heart fill={c.liked} width="17" height="17" /><span>{c.likes || ''}</span>
              </button>
            </div>
          ))}
        </div>

        {err && <div className="cerr">{err}</div>}
        {reply && (
          <div className="creply">Ответ для <b>{reply.user_name}</b>
            <button onClick={() => setReply(null)}><I.close width="14" height="14" /></button></div>
        )}
        <div className="cform">
          <Avatar ch={{ avatar: me?.photo, title: me?.name || 'Я' }} size={30} />
          <input ref={inputRef} value={text} maxLength={1000} placeholder="Написать комментарий…"
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') send(); }} />
          <button className="csend" disabled={!text.trim() || sending} onClick={send}>
            <I.plane width="18" height="18" /></button>
        </div>
      </div>
    </div>,
    document.body
  );
}
