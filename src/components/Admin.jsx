// Админка: цифры, жалобы, наборы стикеров, блокировка роликов и каналов.
// Виден только тем, чей номер в ADMIN_IDS — сервер проверяет это сам.
import { useCallback, useEffect, useState } from 'react';
import { fmt } from '../lib/format';
import { getStats, getReports, getAdminPacks, findVideos, getCands, modCand, modPack, modComment, modVideo, modAuthor } from '../lib/api';
import { ask } from '../lib/tg';

const TABS = [['stats', 'Цифры'], ['reports', 'Жалобы'], ['packs', 'Наборы'], ['cands', 'Каналы'], ['videos', 'Ролики']];
const hhmm = sec => sec >= 3600 ? Math.round(sec / 3600) + ' ч' : Math.round(sec / 60) + ' мин';
const day = d => new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });

function Cells({ data }) {
  const rows = [
    ['всего людей', fmt(data.users_total)], ['сейчас в сети', fmt(data.users_online)],
    ['новых сегодня', fmt(data.new_today)], ['смотрели сегодня', fmt(data.users_today)],
    ['насмотрели сегодня', hhmm(data.watch_today || 0)], ['лайков сегодня', fmt(data.likes_today)],
    ['комментариев', fmt(data.comments_today)], ['сообщений', fmt(data.messages_today)],
    ['роликов в базе', fmt(data.videos_total)], ['из них за сутки', fmt(data.videos_fresh)],
    ['каналов', fmt(data.authors)], ['дружб', fmt(data.friends)],
    ['полок', fmt(data.shelves)], ['комнат сейчас', fmt(data.rooms_live)],
    ['наборов в общей', fmt(data.packs)], ['жалоб за неделю', fmt(data.reports_open)]
  ];
  return <div className="acells">{rows.map(([k, v]) => <div key={k}><b>{v}</b><small>{k}</small></div>)}</div>;
}

// простая дорожка по дням — без картинок, одними столбиками
function Bars({ days, pick, name }) {
  const list = [...days].reverse().slice(-21);
  const max = Math.max(1, ...list.map(pick));
  return (
    <div className="abars">
      <span className="atitle">{name} · максимум {fmt(max)}</span>
      <div className="abar-row">
        {list.map(d => (
          <i key={d.day} style={{ height: Math.max(3, Math.round(pick(d) / max * 72)) + 'px' }} title={`${day(d.day)}: ${pick(d)}`} />
        ))}
      </div>
      <span className="anote">{list.length ? day(list[0].day) + ' — ' + day(list[list.length - 1].day) : 'пока пусто'}</span>
    </div>
  );
}

export function Admin() {
  const [tab, setTab] = useState('stats');
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    setErr(''); setData(null);
    try {
      if (tab === 'stats') setData(await getStats(30));
      else if (tab === 'reports') setData(await getReports());
      else if (tab === 'packs') setData(await getAdminPacks(''));
      else if (tab === 'cands') setData(await getCands('new'));
      else setData({ videos: [] });
    } catch (e) { setErr(e.message); }
  }, [tab]);
  useEffect(() => { load(); }, [load]);

  const search = async () => {
    if (!q.trim()) return;
    try { setData(await findVideos(q.trim())); } catch (e) { setErr(e.message); }
  };

  const pack = async (name, status) => {
    const why = status === 'blocked' ? 'запрещён админом' : status === 'shared' ? null : 'только себе';
    if (status === 'blocked' && !(await ask('Запретить набор «' + name + '» у всех?'))) return;
    try { await modPack(name, status, why); setNote(name + ' → ' + status); load(); }
    catch (e) { setErr(e.message); }
  };

  return (
    <div className="page admin">
      <div className="chats-top"><h1>Админка</h1></div>
      <div className="atabs">
        {TABS.map(([id, name]) => (
          <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{name}</button>
        ))}
      </div>
      {err && <p className="room-err">{err}</p>}
      {note && <p className="snote pad">{note}</p>}
      {!data && !err && <p className="snote pad">Считаю…</p>}

      {tab === 'stats' && data && data.now && (
        <>
          <Cells data={data.now} />
          <Bars days={data.days} name="Людей в день" pick={d => d.users} />
          <Bars days={data.days} name="Минут просмотра" pick={d => Math.round((d.watch_sec || 0) / 60)} />
          <Bars days={data.days} name="Новых людей" pick={d => d.new_users} />
          <span className="atitle pad">Каналы недели</span>
          <div className="clist">
            {((data.top && data.top.authors) || []).map(a => (
              <div key={a.author} className="crow"><div><b>@{a.author}</b><small>{fmt(a.views)} просмотров · {a.videos} роликов</small></div>
                <button className="mini" onClick={() => modAuthor(a.author, true).then(load)}>выключить</button></div>
            ))}
          </div>
          <span className="atitle pad">Что заходит</span>
          <div className="clist">
            {((data.top && data.top.cats) || []).map(c => (
              <div key={c.cat} className="crow"><div><b>{c.cat}</b><small>{fmt(c.views)} просмотров · {c.videos} роликов</small></div></div>
            ))}
          </div>
        </>
      )}

      {tab === 'reports' && data && data.reports && (
        <div className="clist">
          {!data.reports.length && <p className="snote pad">Жалоб нет.</p>}
          {data.reports.map(r => (
            <div key={r.id} className="crow">
              <div>
                <b>{r.kind === 'pack' ? 'Набор' : 'Комментарий'} · {r.title || r.target}</b>
                <small>{r.body || '—'} · жалоб {r.count} · {r.status}</small>
              </div>
              <div className="slib-btns">
                {r.kind === 'pack'
                  ? <>
                      <button className="mini" onClick={() => pack(r.target, 'blocked')}>запретить</button>
                      <button className="mini" onClick={() => pack(r.target, 'shared')}>ок</button>
                    </>
                  : <>
                      <button className="mini" onClick={() => modComment(Number(r.target), true).then(load)}>скрыть</button>
                      <button className="mini" onClick={() => modComment(Number(r.target), false).then(load)}>вернуть</button>
                    </>}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'packs' && data && data.packs && (
        <div className="clist">
          {data.packs.map(p => (
            <div key={p.name} className="crow">
              {p.cover ? <img className="apack" src={p.cover} alt="" /> : <span className="shno sm" />}
              <div><b>{p.title}</b><small>{p.status} · {p.total} шт · взяли {p.adds} · жалоб {p.reports}</small></div>
              <div className="slib-btns">
                <button className="mini" onClick={() => pack(p.name, 'shared')}>в общую</button>
                <button className="mini" onClick={() => pack(p.name, 'blocked')}>бан</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'cands' && data && data.cands && (
        <>
          <p className="snote pad">Каналы, которые чаще всего репостят наши. Ночью приложение проверяет их само — тут можно решить руками.</p>
          <div className="clist">
            {!data.cands.length && <p className="snote pad">Пока никого.</p>}
            {data.cands.map(c => (
              <div key={c.username} className="crow">
                <div>
                  <b>@{c.username}</b>
                  <small>репостов {c.seen}{c.subscribers ? ' · подписчиков ' + fmt(c.subscribers) : ''}{c.reason ? ' · ' + c.reason : ''}</small>
                </div>
                <div className="slib-btns">
                  <button className="mini" onClick={() => modCand(c.username, 'added', { subs: c.subscribers }).then(load)}>взять</button>
                  <button className="mini" onClick={() => modCand(c.username, 'rejected').then(load)}>нет</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === 'videos' && (
        <>
          <div className="sadd pad">
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="канал, слово или id ролика" />
            <button className="mini grad" onClick={search}>Найти</button>
          </div>
          <div className="clist">
            {((data && data.videos) || []).map(v => (
              <div key={v.id} className="crow">
                <div><b>@{v.author}</b><small>{v.caption || '—'} · {fmt(v.views)} просм.{v.blocked ? ' · скрыт' : ''}</small></div>
                <button className="mini" onClick={() => modVideo(v.id, !v.blocked).then(search)}>
                  {v.blocked ? 'вернуть' : 'скрыть'}
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
