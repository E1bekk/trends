// Полки: своя подборка роликов, которой делятся одной ссылкой.
import { useCallback, useEffect, useState } from 'react';
import { I } from './Icons';
import { getShelves, getShelf, makeShelf, putOnShelf, pullFromShelf, dropShelf, renameShelf,
         getMine, getChats, sendMsg } from '../lib/api';
import { shareUrl, ask, haptic } from '../lib/tg';

// ---------- одна полка ----------
function One({ id, onBack, onOpen }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [pick, setPick] = useState(null);    // выбор, что добавить
  const [to, setTo] = useState(null);        // выбор чата

  const load = useCallback(() => getShelf(id).then(setData).catch(e => setErr(e.message)), [id]);
  useEffect(() => { load(); }, [load]);

  const addFrom = async () => {
    try { const r = await getMine({ kind: 'save', limit: 50 }); setPick(r.videos || []); }
    catch (e) { setErr(e.message); }
  };
  const put = async v => { await putOnShelf(id, v.id).catch(e => setErr(e.message)); haptic('light'); load(); };
  const pull = async v => { await pullFromShelf(id, v.id).catch(e => setErr(e.message)); load(); };

  const toChat = async () => {
    try { const r = await getChats(); setTo(r.chats || []); } catch (e) { setErr(e.message); }
  };
  const sendTo = async c => {
    setTo(null);
    try { await sendMsg({ chat: c.id, shelf: id }); setErr('Отправил в «' + c.title + '»'); }
    catch (e) { setErr(e.message); }
  };

  if (!data) return <div className="page"><p className="room-err">{err || 'Открываю…'}</p></div>;
  const s = data.shelf;

  return (
    <div className="page">
      <div className="chats-top">
        <button className="mini" onClick={onBack}><I.back width="16" height="16" /> Назад</button>
        <div>
          <button className="mini" onClick={toChat}>в чат</button>
          <button className="mini grad" onClick={() => shareUrl(data.link, 'Глянь подборку: ' + s.title)}>поделиться</button>
        </div>
      </div>
      <h1 className="sh-name">{s.title}</h1>
      <p className="snote">{s.items} роликов · открыли {s.opens || 0} · забрали {s.taken || 0}</p>
      {err && <p className="room-err">{err}</p>}

      {to && (
        <div className="picks pad">
          {to.length ? to.map(c => <button key={c.id} className="pick" onClick={() => sendTo(c)}>{c.title}</button>)
                     : <p className="snote">Чатов пока нет.</p>}
        </div>
      )}

      <div className="shgrid">
        {data.videos.map((v, i) => (
          <div key={v.id} className="shcard">
            <button onClick={() => onOpen(data.videos, i)}>
              {v.thumb_url ? <img src={v.thumb_url} alt="" loading="lazy" /> : <span className="shno" />}
            </button>
            {s.mine && <button className="shx" onClick={() => pull(v)} aria-label="Снять с полки">✕</button>}
          </div>
        ))}
      </div>

      {s.mine && (pick
        ? <>
            <p className="snote">Выбери из сохранённого:</p>
            <div className="shgrid">
              {pick.map(v => (
                <div key={v.id} className="shcard">
                  <button onClick={() => put(v)}>
                    {v.thumb_url ? <img src={v.thumb_url} alt="" loading="lazy" /> : <span className="shno" />}
                    <i className="shplus">+</i>
                  </button>
                </div>
              ))}
            </div>
            <button className="btn btn-grad wide-m" onClick={() => setPick(null)}>Готово</button>
          </>
        : <button className="btn btn-grad wide-m" onClick={addFrom}>Добавить ролики</button>)}
    </div>
  );
}

// ---------- список полок ----------
export function Shelves({ onOpen, openId, onLeave }) {
  const [list, setList] = useState([]);
  const [cur, setCur] = useState(openId || null);
  const [err, setErr] = useState('');
  const [name, setName] = useState('');

  const load = useCallback(() => getShelves().then(r => setList(r.shelves || [])).catch(e => setErr(e.message)), []);
  useEffect(() => { load(); }, [load]);

  const make = async () => {
    try { const r = await makeShelf(name.trim() || 'Полка'); setName(''); await load(); setCur(r.shelf.id); }
    catch (e) { setErr(e.message); }
  };
  const remove = async s => {
    if (!(await ask('Удалить полку «' + s.title + '»?'))) return;
    await dropShelf(s.id).catch(() => {}); load();
  };

  if (cur) return <One id={cur} onOpen={onOpen} onBack={() => { setCur(null); if (onLeave) onLeave(); load(); }} />;

  return (
    <>
      <div className="sadd pad">
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Название полки" maxLength={60} />
        <button className="mini grad" onClick={make}>Создать</button>
      </div>
      {err && <p className="room-err">{err}</p>}
      {list.length
        ? <div className="clist">
            {list.map(s => (
              <div key={s.id} className="crow shrow">
                <button className="shrow-go" onClick={() => setCur(s.id)}>
                  {s.cover ? <img src={s.cover} alt="" /> : <span className="shno sm" />}
                  <div><b>{s.title}</b><small>{s.items} роликов</small></div>
                </button>
                <div className="cmeta">
                  <button className="mini" onClick={() => shareUrl(s.link, 'Глянь подборку: ' + s.title)}><I.share width="14" height="14" /></button>
                  <button className="mini" onClick={() => remove(s)}>✕</button>
                </div>
              </div>
            ))}
          </div>
        : <p className="snote pad">Полка — это своя подборка роликов. Создай и кидай туда то, что зацепило: одной ссылкой делишься с кем угодно.</p>}
    </>
  );
}

export { One as ShelfView };
