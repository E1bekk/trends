import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { I } from './components/Icons';
import Feed from './components/Feed';
import { Explore, Channels, ChannelPage, News, Profile } from './components/Screens';
import { forYou, trending, following } from './lib/reco';
import * as St from './lib/store';

const API = (import.meta.env.VITE_API || '') + '/api/feed';
const FEED_TABS = [['follow', 'Подписки'], ['foryou', 'Для вас'], ['trends', 'Тренды']];

export default function App() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [nav, setNav] = useState('feed');            // feed | explore | channels | news | profile
  const [feedTab, setFeedTab] = useState('foryou');   // главная лента: Подписки | Для вас | Тренды
  const [overlay, setOverlay] = useState(null);       // ролик, открытый из обзора / канала / профиля
  const [channel, setChannel] = useState(null);
  const [seed, setSeed] = useState(() => Date.now());
  const [, force] = useState(0);

  // Сначала берём «лёгкую» ленту (~300 лучших роликов, грузится за секунду) и сразу показываем,
  // а полную (2000+ роликов) докачиваем в фоне — лента при этом не прыгает.
  const got = useRef(false);
  const load = useCallback(async (fresh) => {
    const get = async url => { const r = await fetch(url); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); };
    try {
      if (!fresh && !got.current) {
        const lite = await get(API + '?lite=1').catch(() => null);
        if (lite && lite.videos && lite.videos.length && !got.current) { setData(d => d || lite); setError(''); }
      }
      const full = await get(fresh ? API + '?t=' + Date.now() : API);   // без лишних параметров — ответ из кэша мгновенно
      got.current = true; setData(full); setError('');
    } catch (e) { if (!got.current) setError('Не получилось загрузить ленту'); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => St.onChange(() => force(x => x + 1)), []);
  // ссылки на видео живут ограниченное время — раз в 20 минут тихо обновляем ленту
  useEffect(() => { const t = setInterval(() => load(true), 20 * 60 * 1000); return () => clearInterval(t); }, [load]);

  const chMap = useMemo(() => Object.fromEntries((data ? data.channels : []).map(c => [c.username, c])), [data]);
  const videos = useMemo(() => data ? data.videos : [], [data]);
  const fresh = useMemo(() => Object.fromEntries(videos.map(v => [v.key, v])), [videos]);   // свежие ссылки по ключу ролика
  const R = useRef({}); R.current = { videos, chMap };
  const ready = videos.length > 0;

  // главная лента: считаем заново только при смене вкладки или «обновить», а не когда докачались данные
  const mainList = useMemo(() => {
    const { videos, chMap } = R.current;
    return feedTab === 'trends' ? trending(videos) : feedTab === 'follow' ? following(videos) : forYou(videos, chMap, seed);
  }, [feedTab, seed, ready]); // eslint-disable-line
  // бесконечная лента: когда ролики заканчиваются — добавляем ещё (сначала непросмотренные)
  const round = useRef(0);
  const more = useCallback(list => {
    if (feedTab === 'follow') return [];
    const { videos, chMap } = R.current;
    const have = new Set(list.map(v => v.key));
    const rest = videos.filter(v => !have.has(v.key));
    const r = ++round.current;   // у повторных роликов свой ключ, чтобы React не путал их с уже показанными
    return (rest.length ? forYou(rest, chMap, Date.now()) : forYou(videos, chMap, Date.now())).slice(0, 30).map(v => ({ ...v, uid: v.key + '#' + r }));
  }, [feedTab]);

  // ролик не загрузился — возможно, устарела ссылка: берём свежую ленту (не чаще раза в минуту)
  const broken = useRef(0);
  const onBroken = useCallback(() => { if (Date.now() - broken.current > 60000) { broken.current = Date.now(); load(true); } }, [load]);

  const byChannel = u => videos.filter(v => v.channel === u).sort((a, b) => new Date(b.date) - new Date(a.date));
  const openOverlay = (list, start, mode) => setOverlay({ list, start, mode });
  const closeOverlay = useCallback(() => setOverlay(null), []);
  const toChannel = useCallback(u => setChannel(u), []);
  const fromOverlayToChannel = useCallback(u => { setOverlay(null); setChannel(u); window.scrollTo(0, 0); }, []);
  const onTab = useCallback(t => { setFeedTab(t); setSeed(Date.now()); }, []);
  const go = id => { setChannel(null); setOverlay(null); if (id === 'feed' && nav === 'feed') setSeed(Date.now()); setNav(id); window.scrollTo(0, 0); };

  if (!data) return error
    ? <div className="splash"><div className="logo xl">S</div><b>{error}</b><p>Проверь интернет и попробуй ещё раз</p><button className="btn btn-grad" onClick={() => load(true)}><I.refresh width="18" height="18" />Повторить</button></div>
    : <div className="splash"><div className="logo xl pulse">S</div><div className="word big">scroll</div></div>;

  const ch = channel && chMap[channel];
  const onFeed = nav === 'feed' && !channel;
  return (
    <div className={'app' + (onFeed ? ' on-feed' : '')}>
      {/* главная — лента на весь экран; не размонтируем, чтобы при возврате остаться на том же ролике */}
      <div style={{ display: onFeed ? 'block' : 'none' }}>
        <Feed list={mainList} chMap={chMap} fresh={fresh} mode={feedTab} embedded tabs={FEED_TABS} onTab={onTab}
          onChannel={toChannel} onBroken={onBroken} onMore={more} paused={!onFeed || !!overlay} />
      </div>
      {!onFeed && (
        <main key={channel || nav} className="screen">
          {channel ? (
            <ChannelPage ch={ch} videos={byChannel(channel)} news={data.news.filter(n => n.channel === channel)} onBack={() => setChannel(null)}
              onOpen={i => openOverlay(byChannel(channel), i, 'channel')} />
          ) : nav === 'explore' ? (
            <Explore videos={videos} chMap={chMap} onOpen={(l, i) => openOverlay(l, i, 'explore')} onStory={u => openOverlay(byChannel(u), 0, 'channel')} />
          ) : nav === 'channels' ? (
            <Channels channels={data.channels} onChannel={setChannel} />
          ) : nav === 'news' ? (
            <News news={data.news} chMap={chMap} />
          ) : (
            <Profile videos={videos} chMap={chMap} onOpenList={(l, i) => openOverlay(l, i, 'profile')} onChannel={setChannel} />
          )}
        </main>
      )}
      <nav className="tabbar">
        <button className={onFeed ? 'on' : ''} onClick={() => go('feed')}><I.home /><span>Лента</span></button>
        <button className={nav === 'channels' && !channel ? 'on' : ''} onClick={() => go('channels')}><I.channels /><span>Каналы</span></button>
        <button className={'tab-center' + (nav === 'explore' && !channel ? ' on' : '')} onClick={() => go('explore')} aria-label="Обзор: поиск и подборки">
          <span><I.compass width="26" height="26" /></span><small>Обзор</small></button>
        <button className={nav === 'news' && !channel ? 'on' : ''} onClick={() => go('news')}><I.news /><span>Новости</span></button>
        <button className={nav === 'profile' && !channel ? 'on' : ''} onClick={() => go('profile')}><I.user /><span>Профиль</span></button>
      </nav>
      {overlay && <Feed {...overlay} chMap={chMap} fresh={fresh} onClose={closeOverlay} onBroken={onBroken} onChannel={fromOverlayToChannel} />}
    </div>
  );
}
