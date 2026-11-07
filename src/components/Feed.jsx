// Лента как в TikTok: ролики на весь экран, листаем вверх-вниз, ролик сам запускается.
// Работает в двух режимах:
//  • главная страница (embedded) — сверху вкладки «Подписки / Для вас / Тренды», снизу меню;
//  • поверх экрана — когда открыли ролик из обзора, канала или профиля (кнопка «назад»).
//
// Для плавности:
//  • на странице живут только ролики рядом с текущим (остальные — пустые места);
//  • видео есть только у текущего, предыдущего и двух следующих; следующий качается заранее,
//    как только текущий начал играть;
//  • «текущий» ролик переключается, когда палец отпустил и лента встала на место, а не посреди свайпа;
//  • слайд перерисовывается, только если у него что-то поменялось (React.memo).
import { memo, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { I, Avatar } from './Icons';
import { fmt, catName, catEmoji, catColor, COUNTRIES } from '../lib/format';
import * as St from '../lib/store';
import { rerankTail } from '../lib/reco';
import { createPrefetcher } from '../lib/prefetch';
import { openTg, share, haptic, backButton } from '../lib/tg';

// Звук: ролики всегда играют со звуком (громкость — кнопками телефона).
// Если браузер не разрешил звук до первого касания — ролик идёт без звука, и при первом же
// касании экрана (свайп, тап) звук молча включается. Никаких кнопок и подсказок.
if (typeof document !== 'undefined') {
  const unlock = () => document.querySelectorAll('video').forEach(el => {
    if (!el.muted) return;
    el.muted = false;
    if (!el.paused) el.play().catch(() => { el.muted = true; el.play().catch(() => {}); });
  });
  ['touchend', 'click', 'keydown'].forEach(t => document.addEventListener(t, unlock, true));
}
const SPEEDS = [1, 1.5, 2, 0.5];
let speed = 1;       // выбранная скорость — одна на всю ленту
// сколько роликов качать заранее: обычно 4; если включена экономия трафика или интернет слабый — 2
const ahead = () => {
  const c = typeof navigator !== 'undefined' && navigator.connection;
  return c && (c.saveData || /(^|-)(2g|3g)$/.test(c.effectiveType || '')) ? 2 : 4;
};
const hasScrollEnd = typeof window !== 'undefined' && 'onscrollend' in window;

const Slide = memo(function Slide({ v, fresh, blob, ch, active, withVideo, preload, liked, saved, follow, onChannel, onBroken, onReady, tick, rate, setRate, paused: pausedOutside }) {
  const ref = useRef(null);
  const bar = useRef(null);
  const cur = fresh || v;                                 // самые свежие ссылки на видео (они со временем устаревают)
  const [src, setSrc] = useState(blob || cur.video);    // скачанный заранее ролик — если уже готов
  const started = useRef(false);
  const [paused, setPaused] = useState(false);
  const [vertical, setVertical] = useState(v.ratio < 1);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [burst, setBurst] = useState(0);
  const [more, setMore] = useState(false);
  const [fast, setFast] = useState(false);              // удержание пальца — ускорение ×2
  const tapTimer = useRef(0), tries = useRef(0);
  const hold = useRef({ t: 0, x: 0, y: 0, fired: false });

  // ролик докачался заранее — переключаемся на него, если он ещё не начал играть
  useEffect(() => {
    if (blob && src !== blob && (!started.current || failed)) { setSrc(blob); setFailed(false); }
  }, [blob]); // eslint-disable-line
  // пришла свежая ссылка — подставляем, если видео ещё не играет или сломалось
  useEffect(() => {
    if (src !== blob && cur.video !== src && (failed || !withVideo)) { setSrc(cur.video); setFailed(false); setLoading(true); tries.current = 0; }
  }, [cur.video, failed, withVideo]); // eslint-disable-line

  // для iPhone: видео играет внутри страницы, а не в системном плеере
  useEffect(() => {
    const el = ref.current; if (!el) return;
    el.setAttribute('playsinline', ''); el.setAttribute('webkit-playsinline', '');
  }, [withVideo]);
  useEffect(() => { const el = ref.current; if (el) el.playbackRate = fast ? 2 : rate; }, [rate, fast, withVideo, active]);

  useEffect(() => {
    const el = ref.current; if (!el) return;
    if (active && !pausedOutside && !paused) {
      const p = el.play();
      if (p) p.catch(() => { el.muted = true; el.play().catch(() => setPaused(true)); });   // звук не разрешён — пока без звука
    } else el.pause();
  }, [active, withVideo, pausedOutside, paused]);
  useEffect(() => { if (!active) { setPaused(false); setMore(false); const el = ref.current; if (el && el.currentTime > 0 && !el.paused) el.pause(); } }, [active]);

  const onDown = e => {
    const h = hold.current; h.fired = false; h.x = e.clientX; h.y = e.clientY;
    clearTimeout(h.t);
    h.t = setTimeout(() => { h.fired = true; setFast(true); haptic('light'); }, 380);
  };
  const onMove = e => { const h = hold.current; if (!h.fired && Math.hypot(e.clientX - h.x, e.clientY - h.y) > 12) clearTimeout(h.t); };
  const onUp = () => { const h = hold.current; clearTimeout(h.t); if (h.fired) setFast(false); };
  // Одно касание — пауза/продолжить, двойное — лайк.
  // После первого касания ждём чуть-чуть: если пришло второе — это лайк, и пауза не ставится.
  const onTap = () => {
    if (hold.current.fired) { hold.current.fired = false; return; }   // это было удержание, а не касание
    if (tapTimer.current) {
      clearTimeout(tapTimer.current); tapTimer.current = 0;
      if (!St.isLiked(v.key)) St.toggleLike(v);
      setBurst(Date.now()); haptic('medium');
      return;
    }
    tapTimer.current = setTimeout(() => {
      tapTimer.current = 0;
      const el = ref.current; if (!el) return;
      if (failed) { retry(); return; }
      if (el.paused) { el.play().catch(() => {}); setPaused(false); } else { el.pause(); setPaused(true); }
    }, 260);
  };
  useEffect(() => () => clearTimeout(tapTimer.current), []);
  const retry = () => {
    setFailed(false); setLoading(true);
    if (cur.video !== src) { setSrc(cur.video); return; }   // и для сломанного скачанного — назад к сети
    const el = ref.current; if (el) { el.load(); el.play().catch(() => {}); }
  };
  const onError = () => {
    tries.current++;
    if (tries.current === 1) onBroken(v);            // ссылка могла устареть — просим свежую ленту
    setFailed(true); setLoading(false);
  };
  const ready = () => { started.current = true; setLoading(false); setFailed(false); if (active) onReady(v.key); };

  return (
    <section className="slide">
      <div className="slide-media" onClick={onTap} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onContextMenu={e => e.preventDefault()}>
        {cur.thumb && <img className={vertical ? 'slide-poster cover' : 'slide-poster-fit'} src={cur.thumb} alt="" decoding="async" />}
        {withVideo && <video ref={ref} className={'slide-video' + (vertical ? ' cover' : '')} src={src} loop playsInline preload={preload}
          disablePictureInPicture disableRemotePlayback
          onLoadedMetadata={e => setVertical(e.target.videoHeight > e.target.videoWidth * 1.15)}
          onWaiting={() => setLoading(true)} onPlaying={ready} onCanPlay={() => setLoading(false)}
          onTimeUpdate={e => { const t = e.target; if (bar.current) bar.current.style.transform = `scaleX(${t.duration ? t.currentTime / t.duration : 0})`; if (active) tick(v, t.currentTime); }}
          onError={onError} />}
        {active && loading && !failed && <span className="slide-loader"><i /></span>}
        {failed && <span className="slide-failed"><b>Видео не загрузилось</b><button onClick={e => { e.stopPropagation(); retry(); }}><I.refresh width="18" height="18" />Ещё раз</button>
          <button className="ghost" onClick={e => { e.stopPropagation(); openTg(`${v.channel}/${v.id}`); }}>Открыть в Telegram</button></span>}
        {paused && !failed && <span className="slide-paused"><I.play width="64" height="64" /></span>}
        {fast && <span className="slide-fast">2x ▶▶</span>}
        {burst > 0 && <span key={burst} className="slide-burst"><I.heart fill width="110" height="110" /></span>}
      </div>
      <div className="slide-shade" />
      <aside className="rail">
        <button className="rail-ava" onClick={() => onChannel(v.channel)}>
          <Avatar ch={ch} size={34} ring="on" />
          {!follow && <span className="rail-plus" onClick={e => { e.stopPropagation(); St.toggleFollow(v.channel, v.cat); haptic(); }}>+</span>}
        </button>
        <button className={'rail-btn' + (liked ? ' on-like' : '')} onClick={() => { St.toggleLike(v); haptic(); }}>
          <span className="rail-ic"><I.heart fill={liked} /></span></button>
        <button className={'rail-btn' + (saved ? ' on-save' : '')} onClick={() => { St.toggleSave(v); haptic(); }}>
          <span className="rail-ic"><I.bookmark fill={saved} /></span></button>
        <button className="rail-btn" onClick={() => { St.shared(v); share(`${v.channel}/${v.id}`, (v.text || '').split('\n')[0].slice(0, 80)); }}>
          <span className="rail-ic"><I.share /></span></button>
        <button className={'rail-btn rail-speed' + (rate !== 1 ? ' on' : '')} onClick={() => { const i = SPEEDS.indexOf(rate); setRate(SPEEDS[(i + 1) % SPEEDS.length]); haptic(); }}>
          <span className="rail-ic"><b>{rate}x</b></span></button>
        <div className="rail-views"><span className="rail-ic"><I.eye /></span><span>{fmt(v.views)}</span></div>
      </aside>
      <div className="slide-info">
        <div className="slide-ch">
          <button className="slide-chname" onClick={() => onChannel(v.channel)}>{ch ? ch.title : v.channel}</button>
          <button className="btn-sub" onClick={() => { openTg(v.channel); if (!St.isFollowing(v.channel)) St.toggleFollow(v.channel, v.cat); }}>
            <I.plane width="11" height="11" />Подписаться</button>
        </div>
        <div className="slide-tags"><span style={{ '--c': catColor(v.cat) }}>{catEmoji(v.cat)} {v.game || catName(v.cat)}</span>{ch && <span>{COUNTRIES[ch.country]} {fmt(ch.subscribers)}</span>}</div>
        {v.text && <p className={'slide-text' + (more ? ' open' : '')} onClick={() => setMore(!more)}>{v.text}</p>}
      </div>
      <div className="slide-progress"><i ref={bar} /></div>
    </section>
  );
});

const Empty = memo(function Empty() { return <section className="slide slide-empty" />; });

export default function Feed({ list: initial, start = 0, chMap, fresh, mode, embedded, tabs, onTab, onClose, onChannel, onBroken, onMore, paused }) {
  const box = useRef(null);
  const [list, setList] = useState(initial);
  const [active, setActive] = useState(start);
  const [readyKey, setReadyKey] = useState(null);       // текущий ролик уже играет — можно качать следующий
  const [clear, setClear] = useState(false);             // «чистый экран» как в TikTok: только видео
  const [rate, setRateState] = useState(speed);
  const setRate = useCallback(r => { speed = r; setRateState(r); }, []);
  const [, force] = useState(0);
  const watch = useRef({ key: null, max: 0, last: 0, total: 0 });
  const S = useRef({}); S.current = { list, active, mode, chMap, onMore };
  const [, setLoaded] = useState(0);
  const P = useMemo(() => createPrefetcher(() => setLoaded(x => x + 1)), []);
  useEffect(() => () => P.clear(), [P]);

  useEffect(() => St.onChange(() => force(x => x + 1)), []);
  useEffect(() => { if (embedded) return; const off = backButton(true, onClose); return () => { off(); backButton(false); }; }, [embedded, onClose]);
  // новая лента (другая вкладка / обновили) — начинаем сверху
  useEffect(() => { setList(initial); setActive(start); const el = box.current; if (el) el.scrollTop = start * el.clientHeight; }, [initial]); // eslint-disable-line

  // учёт времени просмотра (с учётом повторов по кругу)
  const tick = useCallback((v, t) => {
    const w = watch.current;
    if (w.key !== v.key) { watch.current = { key: v.key, max: 0, last: t, total: 0, v }; return; }
    if (t + 0.5 < w.last) w.total += w.last;
    w.last = t; w.max = Math.max(w.max, w.total + t);
  }, []);
  const flush = useCallback(() => {
    const w = watch.current;
    if (w.v && w.max > 0) St.watched(w.v, w.max);
    watch.current = { key: null, max: 0, last: 0, total: 0 };
  }, []);
  useEffect(() => () => flush(), []); // eslint-disable-line
  const onReady = useCallback(k => setReadyKey(k), []);

  // какой ролик сейчас на экране — определяем, когда лента остановилась
  const settle = useCallback(() => {
    const el = box.current, { list, active, mode, chMap, onMore } = S.current; if (!el) return;
    const i = Math.round(el.scrollTop / el.clientHeight);
    if (i === active || i < 0 || i >= list.length) return;
    flush(); setActive(i);
    // остальное — когда ролик уже пошёл, чтобы не мешать
    setTimeout(() => {
      if (mode === 'foryou' && i % 3 === 0) setList(l => rerankTail(l, i + 4, chMap));   // подстраиваем ближайшие ролики под новые интересы
      if (onMore && i > list.length - 8) { const add = onMore(list); if (add && add.length) setList(l => l.concat(add)); }  // бесконечная лента
    }, 400);
  }, [flush]);
  const timer = useRef(0);
  const onScroll = () => { clearTimeout(timer.current); timer.current = setTimeout(settle, hasScrollEnd ? 250 : 90); };
  useEffect(() => {
    const el = box.current; if (!el || !hasScrollEnd) return;
    const f = () => { clearTimeout(timer.current); settle(); };
    el.addEventListener('scrollend', f); return () => el.removeEventListener('scrollend', f);
  }, [settle, list.length > 0]); // eslint-disable-line

  const goChannel = useCallback(u => { flush(); onChannel(u); }, [flush, onChannel]);
  // Щипок двумя пальцами: развести — спрятать кнопки и текст, свести — вернуть
  const pinch = useRef(null);
  const dist = t => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  const onTouchStart = e => { if (e.touches.length === 2) pinch.current = { d: dist(e.touches), done: false }; };
  const onTouchMove = e => {
    const p = pinch.current; if (!p || p.done || e.touches.length !== 2) return;
    const k = dist(e.touches) / p.d;
    if (k > 1.25 && !clear) { p.done = true; setClear(true); haptic('light'); }
    else if (k < 0.8 && clear) { p.done = true; setClear(false); haptic('light'); }
  };
  const onTouchEnd = e => { if (e.touches.length < 2) pinch.current = null; };
  const tabIndex = tabs ? tabs.findIndex(t => t[0] === mode) : -1;
  const curReady = list[active] && readyKey === list[active].key;
  // Пока смотришь — заранее качаем следующие 4 ролика (ближайший первым; при слабом интернете — 2).
  // Начинаем, когда текущий уже заиграл (или через секунду), чтобы не отнимать у него интернет.
  useEffect(() => {
    if (paused) { P.stop(); return; }
    const go = () => P.want(list.slice(Math.max(0, active - 2), active + 1 + ahead()).map((v, k, arr) => {
      const i = Math.max(0, active - 2) + k;
      return { key: v.key, src: ((fresh && fresh[v.key]) || v).video, dur: v.duration, start: i > active };
    }).sort((a, b) => (a.start === b.start ? 0 : a.start ? 1 : -1)));
    if (curReady) { go(); return; }
    const t = setTimeout(go, 1000); return () => clearTimeout(t);
  }, [active, list, paused, curReady]); // eslint-disable-line
  return (
    <div className={'feed' + (embedded ? ' embedded' : '') + (clear ? ' clear' : '')} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd}>
      <div className="feed-top">
        {embedded ? <span className="feed-side" /> : <button className="feed-btn" onClick={() => { flush(); onClose(); }}><I.back width="20" height="20" /></button>}
        {tabs ? (
          <div className="feed-tabs" style={{ '--i': tabIndex, '--n': tabs.length }}>
            {tabs.map(([id, t]) => <button key={id} className={id === mode ? 'on' : ''} onClick={() => { flush(); onTab(id); }}>{t}</button>)}
            <i />
          </div>
        ) : <span className="feed-title">{{ channel: 'Канал', profile: 'Моё', explore: 'Обзор', trends: 'Тренды', follow: 'Подписки' }[mode] || 'Лента'}</span>}
        <span className="feed-side" />
      </div>
      {list.length ? (
        <div className="feed-scroll" ref={box} onScroll={onScroll}>
          {list.map((v, i) => {
            const d = i - active, key = v.uid || v.key;
            if (d < -1 || d > 3) return <Empty key={key} />;
            const withVideo = d >= -1 && d <= 2;
            // текущий качаем полностью; следующий — как только текущий заиграл; остальные — только начало
            const preload = d === 0 ? 'auto' : d === 1 && curReady ? 'auto' : 'metadata';
            return <Slide key={key} v={v} fresh={fresh && fresh[v.key]} blob={P.get(v.key)} ch={chMap[v.channel]} active={d === 0} withVideo={withVideo} preload={preload}
              liked={St.isLiked(v.key)} saved={St.isSaved(v.key)} follow={St.isFollowing(v.channel)}
              rate={rate} setRate={setRate} paused={paused}
              onChannel={goChannel} onBroken={onBroken} onReady={onReady} tick={tick} />;
          })}
        </div>
      ) : (
        <div className="feed-empty"><div className="empty-emoji">👀</div><b>Пока пусто</b><p>{mode === 'follow' ? 'Подпишись на каналы кнопкой «+» у аватара — их ролики будут здесь.' : 'Ролики скоро появятся.'}</p></div>
      )}
    </div>
  );
}
