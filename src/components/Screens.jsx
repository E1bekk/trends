// Два экрана: Обзор (подборки и поиск по темам) и Профиль (своё).
import { useEffect, useMemo, useRef, useState } from 'react';
import { I, Avatar } from './Icons';
import { fmt, dur, ago, CATS, catName, catEmoji, catColor, tagLabel } from '../lib/format';
import { getFeed, getMine, getProfile, getNews, getNewsTopics, addCover, delCover, setBio, deleteMe } from '../lib/api';
import { pickPhoto } from '../lib/photo';
import { Shelves } from './Shelves';
import { Admin } from './Admin';
import * as St from '../lib/store';
import { tgUser, openTg, haptic, ask, tg } from '../lib/tg';

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
      {tab === 'shelf'
        ? <Shelves onOpen={onOpen} />
        : loading
        ? <div className="masonry">{[0, 1].map(k => <div key={k} className="mcol">{[1.5, 1.1, 1.6].map((t, i) => <span key={i} className="sk sk-card" style={{ aspectRatio: `1 / ${t}` }} />)}</div>)}</div>
        : <Masonry items={shown} onOpen={onOpen}
            empty={<Empty emoji="🔍" title="Ничего не нашлось" text="Попробуй другое слово или тему." />} />}
    </div>
  );
}


// ---------- фон профиля: свои фото наверху страницы ----------
function Cover({ covers, onChange }) {
  const [i, setI] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const has = covers.length > 0;

  const add = async () => {
    setErr('');
    try {
      const photo = await pickPhoto();
      if (!photo) return;
      setBusy(true);
      const r = await addCover(photo);
      haptic('light');
      onChange(r.covers || []);
      setI((r.covers || []).length - 1);
    } catch (e) { setErr(e.message || 'не вышло загрузить'); }
    finally { setBusy(false); }
  };

  const drop = async () => {
    const url = covers[i];
    if (!url) return;
    if (!(await ask('Убрать это фото с фона?'))) return;
    setBusy(true); setErr('');
    try { const r = await delCover(url); onChange(r.covers || []); setI(0); }
    catch (e) { setErr(e.message || 'не вышло убрать'); }
    finally { setBusy(false); }
  };

  const track = e => { const w = e.currentTarget.clientWidth || 1; setI(Math.round(e.currentTarget.scrollLeft / w)); };

  return (
    <div className={'pcover' + (has ? ' has' : '')}>
      {has
        ? <div className="cov-strip" onScroll={track}>
            {covers.map(u => <img key={u} src={u} alt="" decoding="async" />)}
          </div>
        : <i className="cov-glow" />}
      <span className="cov-fade" />

      {covers.length > 1 && <div className="cov-dots">{covers.map((u, k) => <i key={u} className={k === i ? 'on' : ''} />)}</div>}

      {has
        ? <div className="cov-btns">
            <button onClick={drop} disabled={busy} aria-label="Убрать это фото">✕</button>
            <button onClick={add} disabled={busy} aria-label="Добавить фото">{busy ? '·' : '+'}</button>
          </div>
        : <button className="cov-add" onClick={add} disabled={busy}>
            {busy ? 'Загружаю…' : '🖼 Добавить фото на фон'}
          </button>}

      {err && <span className="cov-err">{err}</span>}
    </div>
  );
}


// ---------- пара слов о себе ----------
function Bio({ text, onSave }) {
  const [edit, setEdit] = useState(false);
  const [val, setVal] = useState(text || '');
  useEffect(() => { setVal(text || ''); }, [text]);

  const save = async () => {
    setEdit(false);
    try { const r = await setBio(val); onSave(r.bio || ''); } catch (e) {}
  };

  if (edit) return (
    <div className="bio-edit">
      <input value={val} onChange={e => setVal(e.target.value)} placeholder="Пара слов о себе" maxLength={140} autoFocus />
      <button className="mini grad" onClick={save}>ок</button>
    </div>
  );
  return (
    <button className={'bio' + (text ? '' : ' empty')} onClick={() => setEdit(true)}>
      {text || '+ пара слов о себе'}
    </button>
  );
}

// ---------- удаление аккаунта ----------
function DeleteMe() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const go = async () => {
    if (!(await ask('Удалить аккаунт? Пропадут лайки, сохранённое, полки, друзья и переписки.'))) return;
    if (!(await ask('Точно? Это навсегда, вернуть не получится.'))) return;
    setBusy(true);
    try {
      await deleteMe();
      if (tg && tg.close) tg.close(); else window.location.reload();
    } catch (e) { setErr(e.message); setBusy(false); }
  };

  return (
    <div className="danger">
      <button onClick={go} disabled={busy}>{busy ? 'Удаляю…' : 'Удалить аккаунт'}</button>
      {err && <p className="room-err">{err}</p>}
    </div>
  );
}

// ---------- профиль ----------
const MY = [['save', 'Сохранённое', '🔖'], ['like', 'Лайки', '❤️'], ['history', 'История', '🕘'], ['shelf', 'Полки', '🗂']];
export function Profile({ onOpen }) {
  const [tab, setTab] = useState('save');
  const [items, setItems] = useState([]);
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [srvMe, setSrvMe] = useState(null);
  const [admin, setAdmin] = useState(false);
  const me = tgUser() || srvMe;

  useEffect(() => { getProfile().then(r => { setInfo(r.profile || {}); setSrvMe(r.me || null); }).catch(e => setErr(e.message)); }, []);
  useEffect(() => {
    if (tab === 'shelf') { setLoading(false); return; }
    let gone = false; setLoading(true);
    getMine({ kind: tab, limit: 40 })
      .then(r => { if (!gone) { setItems(r.videos || []); setLoading(false); } })
      .catch(e => { if (!gone) { setErr(e.message); setLoading(false); } });
    return () => { gone = true; };
  }, [tab]);

  const mins = Math.round((info?.watch_sec || 0) / 60);
  const level = (info?.seen || 0) > 500 ? ['👑', 'Залипала'] : (info?.seen || 0) > 150 ? ['🔥', 'Свой'] : (info?.seen || 0) > 30 ? ['⚡', 'Втянулся'] : ['🌱', 'Новенький'];

  if (admin) return (
    <>
      <div className="back-row"><button className="mini" onClick={() => setAdmin(false)}>← назад в профиль</button></div>
      <Admin />
    </>
  );

  if (err) return <div className="page"><Empty emoji="🔌" title="Профиль не загрузился" text={err} />
    <p className="hint">Профиль работает только внутри Telegram — там приложение знает, кто ты.</p></div>;

  return (
    <div className="page">
      <Cover covers={info?.covers || []} onChange={c => setInfo(p => ({ ...(p || {}), covers: c }))} />
      <div className="phead">
        <span className="ring big"><Avatar ch={{ avatar: me?.photo, title: me?.name || 'Гость' }} size={78} /></span>
        <b className="pname">{me?.name || 'Гость'}</b>
        <span className="plevel">{level[0]} {level[1]}</span>
        <Bio text={info?.bio} onSave={b => setInfo(p => ({ ...(p || {}), bio: b }))} />
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
      {tab === 'shelf'
        ? <Shelves onOpen={onOpen} />
        : loading
        ? <div className="masonry">{[0, 1].map(k => <div key={k} className="mcol">{[1.5, 1.2].map((t, i) => <span key={i} className="sk sk-card" style={{ aspectRatio: `1 / ${t}` }} />)}</div>)}</div>
        : <Masonry items={items} onOpen={onOpen}
            empty={<Empty emoji={tab === 'save' ? '🔖' : tab === 'like' ? '❤️' : '🕘'}
              title={tab === 'save' ? 'Ничего не сохранено' : tab === 'like' ? 'Пока без лайков' : 'История пустая'}
              text="Листай ленту — тут появится то, что зацепило." />} />}

      {info?.admin && (
        <div className="danger">
          <button className="adm" onClick={() => setAdmin(true)}>Админка</button>
        </div>
      )}
      <DeleteMe />
    </div>
  );
}

// ---------- новости ----------
const TOPIC = { proisshestviya: ['Происшествия', '🚨'], vlast: ['Власть', '🏛'], dengi: ['Деньги', '💰'],
  sport: ['Спорт', '⚽'], obshestvo: ['Общество', '🏙'], mir: ['В мире', '🌍'], other: ['Разное', '📰'] };

function NewsCard({ n }) {
  const [open, setOpen] = useState(false);
  const [name, em] = TOPIC[n.topic] || TOPIC.other;
  const long = (n.body || '').length > 180;
  return (
    <article className="ncard">
      {n.photo && <img className="nphoto" src={n.photo} alt="" loading="lazy" decoding="async" />}
      <div className="nbody">
        <div className="nmeta"><span className="ntopic">{em} {name}</span><span>{ago(n.posted_at)}</span></div>
        <b className="ntitle">{n.title}</b>
        {n.body && n.body !== n.title && (
          <p className={'ntext' + (open ? ' open' : '')} onClick={() => long && setOpen(!open)}>{n.body}</p>
        )}
        {long && <button className="nmore" onClick={() => setOpen(!open)}>{open ? 'Свернуть' : 'Читать дальше'}</button>}
        <div className="nfoot">
          <span className="nsrc">{n.author_title}</span>
          <button className="nopen" onClick={() => openTg(`${n.author}/${n.id.split('/')[1]}`)}>
            Источник<I.external width="13" height="13" /></button>
        </div>
      </div>
    </article>
  );
}

export function News() {
  const [topic, setTopic] = useState('');
  const [topics, setTopics] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { getNewsTopics().then(r => setTopics(r.topics || [])).catch(() => {}); }, []);
  useEffect(() => {
    let gone = false; setLoading(true);
    getNews({ topic, limit: 40 })
      .then(r => { if (!gone) { setItems(r.news || []); setLoading(false); } })
      .catch(() => { if (!gone) setLoading(false); });
    return () => { gone = true; };
  }, [topic]);

  return (
    <div className="page">
      <header className="top"><div className="brand"><span className="logo">S</span><span className="word">новости</span></div></header>
      <div className="chips">
        <button className={'chip' + (!topic ? ' on' : '')} onClick={() => setTopic('')}>📰 Всё</button>
        {topics.map(t => {
          const [name, em] = TOPIC[t.topic] || TOPIC.other;
          return <button key={t.topic} className={'chip' + (topic === t.topic ? ' on' : '')} onClick={() => setTopic(t.topic)}>{em} {name}</button>;
        })}
      </div>
      {loading
        ? <div className="nlist">{[0, 1, 2].map(i => <span key={i} className="sk sk-news" />)}</div>
        : items.length
          ? <div className="nlist">{items.map(n => <NewsCard key={n.id} n={n} />)}</div>
          : <Empty emoji="📰" title="Новостей пока нет" text="Они появятся, когда сборщик обойдёт каналы." />}
    </div>
  );
}
