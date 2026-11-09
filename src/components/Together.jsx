// Комната: смотрим ленту вместе. Ведущий листает — остальные едут за ним,
// реакции видят все. Раз в две секунды спрашиваем, что происходит в комнате.
import { useCallback, useEffect, useRef, useState } from 'react';
import Feed from './Feed';
import { Avatar } from './Icons';
import { getRoomVideos, getRoomState, moveRoom, reactRoom, leaveRoom } from '../lib/api';
import { shareUrl, haptic } from '../lib/tg';

const EMOJI = ['😂', '🔥', '❤️', '😮', '💀'];

export function Together({ id, onClose }) {
  const [list, setList] = useState(null);
  const [link, setLink] = useState('');
  const [st, setSt] = useState(null);
  const [err, setErr] = useState('');
  const [flying, setFly] = useState([]);       // чужие реакции, которые сейчас летят
  const me = useRef({ pos: 0, since: 0 });

  useEffect(() => {
    getRoomVideos(id).then(r => { setList(r.videos || []); setLink(r.link || ''); }).catch(e => setErr(e.message));
  }, [id]);

  // пульс комнаты: где ведущий, кто смотрит, что нажимали
  useEffect(() => {
    let gone = false;
    const beat = async () => {
      try {
        const r = await getRoomState(id, me.current.since);
        if (gone) return;
        if (!r.ok) return setErr(r.why || 'комната закрылась');
        setSt(r);
        me.current.since = r.last || me.current.since;
        const fresh = (r.reactions || []).filter(x => x.emoji);
        if (fresh.length) {
          setFly(p => p.concat(fresh.map(x => ({ ...x, key: x.id + '-' + Math.random() }))).slice(-12));
          setTimeout(() => setFly(p => p.slice(fresh.length)), 2200);
        }
      } catch (e) { if (!gone) setErr(e.message); }
    };
    beat();
    const t = setInterval(beat, 2000);
    return () => { gone = true; clearInterval(t); };
  }, [id]);

  // куда я перешёл — говорим комнате (но не чаще раза в секунду)
  const told = useRef(0);
  const onIndex = useCallback(i => {
    me.current.pos = i;
    if (Date.now() - told.current < 900) return;
    told.current = Date.now();
    moveRoom(id, i).catch(() => {});
  }, [id]);

  const react = async e => {
    haptic('light');
    setFly(p => p.concat({ key: 'my' + Date.now(), emoji: e, name: 'ты' }));
    setTimeout(() => setFly(p => p.slice(1)), 2200);
    const v = list && list[me.current.pos];
    reactRoom(id, v ? v.id : '', e).catch(() => {});
  };

  const quit = () => { leaveRoom(id).catch(() => {}); onClose(); };

  if (err && !list) return (
    <div className="splash"><div className="logo xl">S</div><b>{err}</b>
      <button className="btn btn-grad" onClick={onClose}>Закрыть</button></div>
  );
  if (!list) return <div className="splash"><div className="logo xl">S</div><b>Захожу в комнату…</b></div>;
  if (!list.length) return (
    <div className="splash"><div className="logo xl">S</div><b>В комнате пусто</b>
      <button className="btn btn-grad" onClick={onClose}>Закрыть</button></div>
  );

  const follow = st && !st.i_host ? st.host_pos : undefined;

  return (
    <>
      <Feed list={list} start={0} onClose={quit} onIndex={onIndex} goTo={follow} />

      <div className="rbar">
        <div className="rwho">
          <b>{(st && st.title) || 'Смотрим вместе'}</b>
          <small>{st && st.i_host ? 'ты ведущий' : st ? 'ведёт ' + st.host_name : '…'}</small>
        </div>
        <div className="rpeople">
          {((st && st.people) || []).slice(0, 5).map(p => (
            <span key={p.id} title={p.name}><Avatar ch={{ avatar: p.photo, title: p.name }} size={26} /></span>
          ))}
        </div>
        {link && <button className="mini" onClick={() => shareUrl(link, 'Залетай смотреть вместе')}>позвать</button>}
        <button className="mini" onClick={quit}>выйти</button>
      </div>

      <div className="remoji">
        {EMOJI.map(e => <button key={e} onClick={() => react(e)}>{e}</button>)}
      </div>

      <div className="rfly">
        {flying.map(f => <span key={f.key}>{f.emoji}</span>)}
      </div>
    </>
  );
}
