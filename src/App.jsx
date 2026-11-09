import { useCallback, useEffect, useRef, useState } from 'react';
import { I } from './components/Icons';
import Feed from './components/Feed';
import { Explore, News, Profile } from './components/Screens';
import { getFeed } from './lib/api';
import { CATS } from './lib/format';
import * as St from './lib/store';

const TABS = [['follow', 'Подписки'], ['foryou', 'Для вас'], ['trends', 'Тренды']];
// настроение: выбрал — и лента на эту сессию про это
export const VIBES = ['humor', 'wow', 'animals', 'games', 'sport', 'auto', 'food', 'nature']
  .filter(c => CATS[c]).map(c => [c, CATS[c][0], CATS[c][1]]);
const PAGE = 20;

export default function App() {
  const [nav, setNav] = useState('feed');          // feed | explore | profile
  const [mode, setMode] = useState('foryou');
  const [vibe, setVibe] = useState('');
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [overlay, setOverlay] = useState(null);    // ролики, открытые из обзора или профиля
  const more = useRef({ skip: 0, busy: false, done: false });

  const load = useCallback(async (reset) => {
    if (more.current.busy || (!reset && more.current.done)) return;
    more.current.busy = true;
    if (reset) { more.current = { skip: 0, busy: true, done: false }; setLoading(true); }
    try {
      const r = await getFeed({ mode, vibe, limit: PAGE, skip: more.current.skip });
      const got = r.videos || [];
      more.current.skip += got.length;
      more.current.done = got.length < PAGE;
      setList(prev => {
        if (reset) return got;
        const have = new Set(prev.map(v => v.id));
        return prev.concat(got.filter(v => !have.has(v.id)));
      });
      setError('');
    } catch (e) {
      if (reset) setError(e.message || 'Не получилось загрузить ленту');
    } finally { more.current.busy = false; setLoading(false); }
  }, [mode, vibe]);

  useEffect(() => { load(true); }, [mode, vibe]); // eslint-disable-line
  useEffect(() => St.onChange(() => {}), []);
  useEffect(() => () => St.flush(), []);

  // ссылка на ролик могла устареть — просим свежую порцию, но не чаще раза в минуту
  const broken = useRef(0);
  const onBroken = useCallback(() => {
    if (Date.now() - broken.current < 60000) return;
    broken.current = Date.now();
    load(true);
  }, [load]);

  const onNeedMore = useCallback(() => load(false), [load]);
  const go = id => { St.flush(); setOverlay(null); setNav(id); window.scrollTo(0, 0); };
  const openList = useCallback((videos, start) => setOverlay({ list: videos, start }), []);
  const closeOverlay = useCallback(() => setOverlay(null), []);

  const onFeed = nav === 'feed';
  if (error && !list.length) return (
    <div className="splash"><div className="logo xl">S</div><b>{error}</b>
      <p>Проверь интернет и попробуй ещё раз</p>
      <button className="btn btn-grad" onClick={() => load(true)}><I.refresh width="18" height="18" />Повторить</button></div>
  );

  return (
    <div className={'app' + (onFeed ? ' on-feed' : '')}>
      {/* главную ленту не размонтируем, чтобы при возврате остаться на том же ролике */}
      <div style={{ display: onFeed ? 'block' : 'none' }}>
        <Feed list={list} loading={loading} embedded tabs={TABS} mode={mode} onTab={setMode}
          vibes={VIBES} vibe={vibe} onVibe={setVibe}
          onNeedMore={onNeedMore} onBroken={onBroken} paused={!onFeed || !!overlay} />
      </div>

      {!onFeed && (
        <main key={nav} className="screen">
          {nav === 'explore' ? <Explore onOpen={openList} />
            : nav === 'news' ? <News />
            : <Profile onOpen={openList} />}
        </main>
      )}

      <nav className="tabbar">
        <button className={onFeed ? 'on' : ''} onClick={() => go('feed')}><I.home /><span>Лента</span></button>
        <button className={nav === 'news' ? 'on' : ''} onClick={() => go('news')}><I.news /><span>Новости</span></button>
        <button className={'tab-center' + (nav === 'explore' ? ' on' : '')} onClick={() => go('explore')} aria-label="Обзор">
          <span><I.compass width="26" height="26" /></span><small>Обзор</small></button>
        <button className={nav === 'profile' ? 'on' : ''} onClick={() => go('profile')}><I.user /><span>Профиль</span></button>
      </nav>

      {overlay && <Feed list={overlay.list} start={overlay.start} onClose={closeOverlay} onBroken={onBroken} />}
    </div>
  );
}
