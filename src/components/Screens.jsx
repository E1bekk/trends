// Два экрана: Обзор (подборки и поиск по темам) и Профиль (своё).
import { useEffect, useMemo, useRef, useState } from 'react';
import { I, Avatar } from './Icons';
import { fmt, dur, CATS, catName, catEmoji, catColor, tagLabel } from '../lib/format';
import { getFeed, getMine, getProfile } from '../lib/api';
import * as St from '../lib/store';
import { tgUser } from '../lib/tg';

// ---------- плитка в два столбца ----------
export function Masonry({ items, onOpen, empty }) {
  const [n, setN] = useState(24);
  const end = useRef(null);
  useEffect(() => { setN(24); }, [items]);
  useEffect(() => {
    const el = end.current; if (!el || n >= items.length) return;
    const io = new IntersectionObserver(e => { if (e[0].isIntersecting) setN(x => x + 24); }, { rootMargin: '900px 0px' });
    io.observe(el); return () => io.disconnect();
  }, [n, items]);
  if (!items.length) return empty || <Empty emoji="🫥" title="Тут пока пусто" />;
  const cols = [[], []], h = [0, 0];
  items.slice(0, n).forEach((v, i) => {
    const tall = v.ratio < 1 ? 1.62 : v.ratio > 1.3 ? 0.82 : 1.15;
    const c = h[0] <= h[1] ? 0 : 1; cols[c].push([v, i, tall]); h[c] += tall;
  });
  return (
    <div className="masonry">
      {cols.map((col, k) => (
        <div key={k} className="mcol">
          {col.map(([v, i, tall]) => (
            <button key={v.id} className="card" style={{ aspectRatio: `1 / ${tall}` }} onClick={() => onOpen(items, i)}>
              {v.thumb_url ? <img src={v.thumb_url} alt="" loading="lazy" decoding="async" /> : <span className="card-ph" />}
              <span className="card-dur">{dur(v.duration)}</span>
              <span className="card-foot">
                {v.caption && <span className="card-text">{v.caption.split('\n')[0]}</span>}
                <span className="card-meta"><I.play width="12" height="12" />{fmt(v.views || 0)}<i>·</i>{catEmoji(v.cat)} {v.game || catName(v.cat)}</span>
              </span>
            </button>
          ))}
        </div>
      ))}
      {n < items.length && <span ref={end} className="masonry-end" />}
    </div>
  );
}
export const Empty = ({ emoji, title, text, action }) => (
  <div className="empty"><div className="empty-emoji">{emoji}</div><b>{title}</b>{text && <p>{text}</p>}{action}</div>
);

// ---------- обзор ----------
const TABS = [['trends', 'Тренды'], ['foryou', 'Для вас'], ['fresh', 'Новое']];
export function Explore({ onOpen }) {
  const [tab, setTab] = useState('trends');
  const [cat, setCat] = useState('');
  const [query, setQuery] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let gone = false;
    setLoading(true);
    getFeed({ mode: tab, vibe: cat, limit: 30 })
      .then(r => { if (!gone) { setItems(r.videos || []); setLoading(false); } })
      .catch(() => { if (!gone) setLoading(false); });
    return () => { gone = true; };
  }, [tab, cat]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(v => (v.caption || '').toLowerCase().includes(q)
      || (v.author_title || '').toLowerCase().includes(q)
      || (v.tags || []).some(t => t.includes(q)));
  }, [items, query]);

  const cats = Object.keys(CATS).filter(c => c !== 'news');
  const ti = TABS.findIndex(t => t[0] === tab);
  return (
    <div className="page">
      <header className="top"><div className="brand"><span className="logo">S</span><span className="word">scroll</span></div></header>
      <label className="search"><I.search width="20" height="20" />
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Поиск по роликам" />
        {query && <button onClick={() => setQuery('')}><I.close width="18" height="18" /></button>}
      </label>
      <div className="tabs" style={{ '--i': ti }}>
        {TABS.map(([id, t]) => <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{t}</button>)}
        <i className="tabs-ind" />
      </div>
      <div className="chips">
        <button className={'chip' + (!cat ? ' on' : '')} onClick={() => setCat('')}>✨ Всё</button>
        {cats.map(c => (
          <button key={c} className={'chip' + (cat === c ? ' on' : '')} style={{ '--c': catColor(c) }} onClick={() => setCat(c)}>
            {catEmoji(c)} {catName(c)}
          </button>
        ))}
      </div>
      {loading
        ? <div className="masonry">{[0, 1].map(k => <div key={k} className="mcol">{[1.5, 1.1, 1.6].map((t, i) => <span key={i} className="sk sk-card" style={{ aspectRatio: `1 / ${t}` }} />)}</div>)}</div>
        : <Masonry items={shown} onOpen={onOpen}
            empty={<Empty emoji="🔍" title="Ничего не нашлось" text="Попробуй другое слово или тему." />} />}
    </div>
  );
}

// ---------- профиль ----------
const MY = [['save', 'Сохранённое', '🔖'], ['like', 'Лайки', '❤️'], ['history', 'История', '🕘']];
export function Profile({ onOpen }) {
  const [tab, setTab] = useState('save');
  const [items, setItems] = useState([]);
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [srvMe, setSrvMe] = useState(null);
  const me = tgUser() || srvMe;

  useEffect(() => { getProfile().then(r => { setInfo(r.profile || {}); setSrvMe(r.me || null); }).catch(e => setErr(e.message)); }, []);
  useEffect(() => {
    let gone = false; setLoading(true);
    getMine({ kind: tab, limit: 40 })
      .then(r => { if (!gone) { setItems(r.videos || []); setLoading(false); } })
      .catch(e => { if (!gone) { setErr(e.message); setLoading(false); } });
    return () => { gone = true; };
  }, [tab]);

  const mins = Math.round((info?.watch_sec || 0) / 60);
  const level = (info?.seen || 0) > 500 ? ['👑', 'Залипала'] : (info?.seen || 0) > 150 ? ['🔥', 'Свой'] : (info?.seen || 0) > 30 ? ['⚡', 'Втянулся'] : ['🌱', 'Новенький'];

  if (err) return <div className="page"><Empty emoji="🔌" title="Профиль не загрузился" text={err} />
    <p className="hint">Профиль работает только внутри Telegram — там приложение знает, кто ты.</p></div>;

  return (
    <div className="page">
      <div className="pcover" />
      <div className="phead">
        <span className="ring big"><Avatar ch={{ avatar: me?.photo, title: me?.name || 'Гость' }} size={78} /></span>
        <b className="pname">{me?.name || 'Гость'}</b>
        <span className="plevel">{level[0]} {level[1]}</span>
      </div>
      <div className="pstats">
        <div><b>{fmt(info?.seen || 0)}</b><small>посмотрел</small></div>
        <div><b>{mins < 60 ? mins + ' мин' : Math.round(mins / 60) + ' ч'}</b><small>времени</small></div>
        <div><b>{fmt(info?.likes || 0)}</b><small>лайков</small></div>
        <div><b>{fmt(info?.follows || 0)}</b><small>подписок</small></div>
      </div>

      {info?.top?.length > 0 && (
        <div className="vibe-box">
          <span className="vibe-title">Твой вайб</span>
          <div className="chips">
            {info.top.map(t => { const [name, em] = tagLabel(t.tag); return <span key={t.tag} className="chip on">{em} {name}</span>; })}
          </div>
        </div>
      )}

      <div className="ptabs">
        {MY.map(([id, name, em]) => (
          <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{em} {name}</button>
        ))}
      </div>
      {loading
        ? <div className="masonry">{[0, 1].map(k => <div key={k} className="mcol">{[1.5, 1.2].map((t, i) => <span key={i} className="sk sk-card" style={{ aspectRatio: `1 / ${t}` }} />)}</div>)}</div>
        : <Masonry items={items} onOpen={onOpen}
            empty={<Empty emoji={tab === 'save' ? '🔖' : tab === 'like' ? '❤️' : '🕘'}
              title={tab === 'save' ? 'Ничего не сохранено' : tab === 'like' ? 'Пока без лайков' : 'История пустая'}
              text="Листай ленту — тут появится то, что зацепило." />} />}
    </div>
  );
}
