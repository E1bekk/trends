import { useEffect, useMemo, useState, useCallback } from 'react';
import { I } from './components/Icons';
import Feed from './components/Feed';
import { Home, Channels, ChannelPage, News, Profile } from './components/Screens';
import { forYou, trending, following } from './lib/reco';
import * as St from './lib/store';

const API = (import.meta.env.VITE_API || '') + '/api/feed';

function Skeleton() {
  return (
    <div className="page">
      <header className="top"><div className="brand"><span className="logo">S</span><span className="word">scroll</span></div></header>
      <div className="stories">{[0, 1, 2, 3, 4].map(i => <span key={i} className="sk sk-story" />)}</div>
      <div className="masonry">{[0, 1].map(c => <div key={c} className="mcol">{[0, 1, 2].map(i => <span key={i} className="sk sk-card" style={{ aspectRatio: `1 / ${(c + i) % 2 ? 1.6 : 1.15}` }} />)}</div>)}</div>
    </div>
  );
}

export default function App() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [nav, setNav] = useState('home');            // home | channels | news | profile
  const [tab, setTab] = useState('foryou');          // Для вас | Тренды | Подписки
  const [cat, setCat] = useState('all');
  const [query, setQuery] = useState('');
  const [feed, setFeed] = useState(null);            // { list, start, mode }
  const [channel, setChannel] = useState(null);
  const [seed, setSeed] = useState(() => Date.now());
  const [, force] = useState(0);

  const load = useCallback(async () => {
    try {
      const r = await fetch(API + '?t=' + Math.floor(Date.now() / 3e5));
      if (!r.ok) throw new Error('HTTP ' + r.status);
      setData(await r.json()); setError('');
    } catch (e) { setError('Не получилось загрузить ленту'); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => St.onChange(() => force(x => x + 1)), []);

  const chMap = useMemo(() => Object.fromEntries((data ? data.channels : []).map(c => [c.username, c])), [data]);
  const videos = data ? data.videos : [];
  const hot = useMemo(() => new Set(trending(videos).slice(0, Math.max(6, Math.round(videos.length * 0.08))).map(v => v.key)), [videos]);
  const cats = useMemo(() => { const m = {}; videos.forEach(v => { m[v.cat] = (m[v.cat] || 0) + 1; }); return Object.keys(m).sort((a, b) => m[b] - m[a]); }, [videos]);

  const items = useMemo(() => {
    let list = tab === 'trends' ? trending(videos) : tab === 'follow' ? following(videos) : forYou(videos, chMap, seed);
    if (cat !== 'all') list = list.filter(v => v.cat === cat);
    const q = query.trim().toLowerCase();
    if (q) list = list.filter(v => (v.text || '').toLowerCase().includes(q) || ((chMap[v.channel] || {}).title || '').toLowerCase().includes(q));
    return list;
  }, [videos, chMap, tab, cat, query, seed, feed === null]); // eslint-disable-line

  // «Истории»: сначала каналы, на которые подписан, потом — у кого самые горячие ролики
  const stories = useMemo(() => {
    const S = St.state(), seen = new Set(), out = [];
    const push = u => { if (!seen.has(u) && chMap[u]) { seen.add(u); out.push({ username: u, seen: videos.filter(v => v.channel === u).every(v => S.seen[v.key]) }); } };
    S.follows.forEach(push); trending(videos).forEach(v => push(v.channel));
    return out.slice(0, 14);
  }, [videos, chMap, feed === null]); // eslint-disable-line

  const byChannel = u => videos.filter(v => v.channel === u).sort((a, b) => new Date(b.date) - new Date(a.date));
  const openFeed = (list, start, mode) => setFeed({ list, start, mode });
  const closeFeed = useCallback(() => { setFeed(null); setSeed(Date.now()); }, []);
  const onExpired = useCallback(() => { load(); }, [load]);   // ссылки на видео живут ограниченное время — обновляем
  const go = id => { setChannel(null); setNav(id); window.scrollTo(0, 0); };

  if (!data) return error
    ? <div className="splash"><div className="logo xl">S</div><b>{error}</b><p>Проверь интернет и попробуй ещё раз</p><button className="btn btn-grad" onClick={load}><I.refresh width="18" height="18" />Повторить</button></div>
    : <div className="app"><Skeleton /></div>;

  const ch = channel && chMap[channel];
  return (
    <div className="app">
      <main key={channel || nav} className="screen">
        {channel ? (
          <ChannelPage ch={ch} videos={byChannel(channel)} news={data.news.filter(n => n.channel === channel)} onBack={() => setChannel(null)}
            onOpen={i => openFeed(byChannel(channel), i, 'channel')} />
        ) : nav === 'home' ? (
          <Home tab={tab} setTab={setTab} cat={cat} setCat={setCat} query={query} setQuery={setQuery} items={items} hot={hot} cats={cats}
            onOpen={i => openFeed(items, i, tab === 'foryou' && !query && cat === 'all' ? 'foryou' : tab)}
            stories={stories} chMap={chMap} onStory={u => openFeed(byChannel(u), 0, 'channel')} />
        ) : nav === 'channels' ? (
          <Channels channels={data.channels} onChannel={setChannel} />
        ) : nav === 'news' ? (
          <News news={data.news} chMap={chMap} />
        ) : (
          <Profile videos={videos} chMap={chMap} onOpenList={(l, i) => openFeed(l, i, 'profile')} onChannel={setChannel} />
        )}
      </main>
      <nav className="tabbar">
        <button className={nav === 'home' && !channel ? 'on' : ''} onClick={() => go('home')}><I.home /><span>Главная</span></button>
        <button className={nav === 'channels' && !channel ? 'on' : ''} onClick={() => go('channels')}><I.channels /><span>Каналы</span></button>
        <button className="tab-vibe" onClick={() => openFeed(forYou(videos, chMap, Date.now()), 0, 'foryou')} aria-label="Смотреть ленту «Для вас»"><span><I.spark width="26" height="26" /></span><small>Вайб</small></button>
        <button className={nav === 'news' && !channel ? 'on' : ''} onClick={() => go('news')}><I.news /><span>Новости</span></button>
        <button className={nav === 'profile' && !channel ? 'on' : ''} onClick={() => go('profile')}><I.user /><span>Профиль</span></button>
      </nav>
      {feed && <Feed {...feed} chMap={chMap} onClose={closeFeed} onExpired={onExpired}
        onChannel={u => { setFeed(null); setChannel(u); window.scrollTo(0, 0); }} />}
    </div>
  );
}
