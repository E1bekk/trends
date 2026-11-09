import { useCallback, useEffect, useRef, useState } from 'react';
import { I } from './components/Icons';
import Feed from './components/Feed';
import { Explore, News, Profile } from './components/Screens';
import { Chats } from './components/Chats';
import { Together } from './components/Together';
import { getFeed, acceptInvite, getVideo, getShelf, joinRoom } from './lib/api';
import { startParam } from './lib/tg';
import { CATS } from './lib/format';
import * as St from './lib/store';

const TABS = [['follow', 'Подписки'], ['foryou', 'Для вас'], ['trends', 'Тренды']];
// настроение: выбрал — и лента на эту сессию про это
export const VIBES = ['humor', 'wow', 'animals', 'games', 'sport', 'auto', 'food', 'nature']
  .filter(c => CATS[c]).map(c => [c, CATS[c][0], CATS[c][1]]);
const PAGE = 20;

export default function App() {
  const [nav, setNav] = useState('feed');          // feed | news | explore | chats | profile
  const [mode, setMode] = useState('foryou');
  const [vibe, setVibe] = useState('');
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [overlay, setOverlay] = useState(null);    // ролики, открытые из обзора или профиля
  const [room, setRoom] = useState(null);          // комната «смотрим вместе»
  const [toChat, setToChat] = useState(null);      // чат из ссылки в уведомлении
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

  // пришли по ссылке-приглашению: сразу становимся друзьями и открываем чаты
  useEffect(() => {
    const p = startParam();
    if (!p) return;
    // позвали в друзья
    if (p.startsWith('inv_')) acceptInvite(p.slice(4)).then(() => setNav('chats')).catch(() => {});
    // скинули полку — открываем её сразу роликами
    if (p.startsWith('sh_')) getShelf(p.slice(3))
      .then(r => r.videos && r.videos.length && setOverlay({ list: r.videos, start: 0 })).catch(() => {});
    // позвали смотреть вместе
    // в уведомлении была кнопка «Открыть» — ведёт в нужный чат
    if (p.startsWith('chat_')) { setToChat(p.slice(5)); setNav('chats'); }
    if (p.startsWith('rm_')) { const rid = p.slice(3); joinRoom(rid).then(r => r.ok && setRoom(rid)).catch(() => {}); }
  }, []);

  // видео, присланное в чат, открываем как обычный ролик
  const openFromChat = useCallback(id => {
    getVideo(id).then(r => r.video && setOverlay({ list: [r.video], start: 0 })).catch(() => {});
  }, []);

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
          onNeedMore={onNeedMore} onBroken={onBroken} paused={!onFeed || !!overlay || !!room} />
      </div>

      {!onFeed && (
        <main key={nav} className="screen">
          {nav === 'explore' ? <Explore onOpen={openList} />
            : nav === 'news' ? <News />
            : nav === 'chats' ? <Chats onOpenVideo={openFromChat} onRoom={setRoom} openId={toChat} />
            : <Profile onOpen={openList} />}
        </main>
      )}

      <nav className="tabbar">
        <button className={onFeed ? 'on' : ''} onClick={() => go('feed')}><I.home /><span>Лента</span></button>
        <button className={nav === 'news' ? 'on' : ''} onClick={() => go('news')}><I.news /><span>Новости</span></button>
        <button className={'tab-center' + (nav === 'explore' ? ' on' : '')} onClick={() => go('explore')} aria-label="Обзор">
          <span><I.compass width="26" height="26" /></span><small>Обзор</small></button>
        <button className={nav === 'chats' ? 'on' : ''} onClick={() => go('chats')}><I.users /><span>Чаты</span></button>
        <button className={nav === 'profile' ? 'on' : ''} onClick={() => go('profile')}><I.user /><span>Профиль</span></button>
      </nav>

      {overlay && <Feed list={overlay.list} start={overlay.start} onClose={closeOverlay} onBroken={onBroken} />}
      {room && <Together id={room} onClose={() => setRoom(null)} />}
    </div>
  );
}
