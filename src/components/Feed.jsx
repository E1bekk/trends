// Лента как в TikTok: ролик на весь экран, листаем вверх-вниз.
// Ролики приходят с сервера уже подобранными под человека — здесь только показ.
//
// Для плавности: на странице живут только соседние ролики, следующие «прогреваются»
// (запускаются без звука и ставятся на паузу), а ещё четыре качаются заранее целиком.
import { memo, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { I, Avatar } from './Icons';
import { fmt, catName, catEmoji, catColor } from '../lib/format';
import * as St from '../lib/store';
import { createPrefetcher } from '../lib/prefetch';
import Comments from './Comments';
import { share, haptic, backButton } from '../lib/tg';

let soundOK = false;
if (typeof document !== 'undefined') {
  const unlock = () => { soundOK = true; document.querySelectorAll('video.is-active').forEach(el => {
    if (!el.muted) return;
    el.muted = false;
    if (!el.paused) el.play().catch(() => { el.muted = true; el.play().catch(() => {}); });
  }); };
  ['touchend', 'click', 'keydown'].forEach(t => document.addEventListener(t, unlock, true));
}
const SPEEDS = [1, 1.5, 2, 0.5];
let speed = 1;
const ahead = () => {
  const c = typeof navigator !== 'undefined' && navigator.connection;
  return c && (c.saveData || /(^|-)(2g|3g)$/.test(c.effectiveType || '')) ? 2 : 4;
};
const hasScrollEnd = typeof window !== 'undefined' && 'onscrollend' in window;

const Slide = memo(function Slide({ v, blob, active, warm, withVideo, preload, liked, saved, follow, onBroken, onReady, onComments, tick, rate, setRate, paused: pausedOutside }) {
  const ref = useRef(null), bar = useRef(null);
  const [src, setSrc] = useState(blob || v.video_url);
  const started = useRef(false), activeRef = useRef(active), warmed = useRef(false);
  activeRef.current = active;
  const [paused, setPaused] = useState(false);
  const [vertical, setVertical] = useState(v.ratio < 1);
  const [stall, setStall] = useState(false);
  const [failed, setFailed] = useState(false);
  const [burst, setBurst] = useState(0);
  const [more, setMore] = useState(false);
  const [fast, setFast] = useState(false);
  const stallTimer = useRef(0), tapTimer = useRef(0), tries = useRef(0);
  const hold = useRef({ t: 0, x: 0, y: 0, fired: false });

  useEffect(() => { if (blob && src !== blob && (!started.current || failed)) { setSrc(blob); setFailed(false); } }, [blob]); // eslint-disable-line
  useEffect(() => {
    const el = ref.current; if (!el) return;
    el.setAttribute('playsinline', ''); el.setAttribute('webkit-playsinline', '');
  }, [withVideo]);
  useEffect(() => { const el = ref.current; if (el) el.playbackRate = fast ? 2 : rate; }, [rate, fast, withVideo, active]);
  useEffect(() => { warmed.current = false; }, [src]);

  // прогрев: следующий ролик уже показал первый кадр и набрал начало в буфер
  useEffect(() => {
    const el = ref.current;
    if (!el || active || !warm || warmed.current) return;
    warmed.current = true; el.muted = true;
    const p = el.play();
    if (p) p.then(() => { if (!activeRef.current) el.pause(); }).catch(() => { warmed.current = false; });
  }, [warm, active, withVideo, src]);

  useEffect(() => {
    const el = ref.current; if (!el) return;
    if (active && !pausedOutside && !paused) {
      el.muted = false;
      const p = el.play();
      if (p) p.then(() => { if (!el.muted) soundOK = true; }).catch(() => { el.muted = true; el.play().catch(() => setPaused(true)); });
    } else if (!el.paused) el.pause();
  }, [active, withVideo, pausedOutside, paused]);
  useEffect(() => { if (!active) { setPaused(false); setMore(false); setStall(false); clearTimeout(stallTimer.current); } }, [active]);
  useEffect(() => () => { clearTimeout(stallTimer.current); clearTimeout(tapTimer.current); }, []);

  const onDown = e => { const h = hold.current; h.fired = false; h.x = e.clientX; h.y = e.clientY;
    clearTimeout(h.t); h.t = setTimeout(() => { h.fired = true; setFast(true); haptic('light'); }, 380); };
  const onMove = e => { const h = hold.current; if (!h.fired && Math.hypot(e.clientX - h.x, e.clientY - h.y) > 12) clearTimeout(h.t); };
  const onUp = () => { const h = hold.current; clearTimeout(h.t); if (h.fired) setFast(false); };

  // одно касание — пауза, два быстрых — лайк. Ждём чуть-чуть, чтобы не спутать.
  const onTap = () => {
    if (hold.current.fired) { hold.current.fired = false; return; }
    if (tapTimer.current) {
      clearTimeout(tapTimer.current); tapTimer.current = 0;
      if (!St.isLiked(v)) St.toggleLike(v);
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
  const retry = () => { setFailed(false); const el = ref.current; if (el) { el.load(); el.play().catch(() => {}); } };
  const onError = () => { tries.current++; if (tries.current === 1) onBroken(v); setFailed(true); setStall(false); };
  const ready = () => { clearTimeout(stallTimer.current); setStall(false); setFailed(false);
    if (activeRef.current) { started.current = true; onReady(v.id); } };
  const waiting = () => { if (!activeRef.current) return; clearTimeout(stallTimer.current); stallTimer.current = setTimeout(() => setStall(true), 600); };

  const shown = St.withPatch(v);
  return (
    <section className="slide">
      <div className="slide-media" onClick={onTap} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onContextMenu={e => e.preventDefault()}>
        {v.thumb_url && <img className={vertical ? 'slide-poster cover' : 'slide-poster-fit'} src={v.thumb_url} alt="" decoding="async" />}
        {withVideo && <video ref={ref} className={'slide-video' + (vertical ? ' cover' : '') + (active ? ' is-active' : '')}
          src={src} poster={v.thumb_url || undefined} loop playsInline muted={!active || !soundOK} preload={preload}
          disablePictureInPicture disableRemotePlayback
          onLoadedMetadata={e => setVertical(e.target.videoHeight > e.target.videoWidth * 1.15)}
          onWaiting={waiting} onPlaying={ready} onSeeked={ready}
          onTimeUpdate={e => { const t = e.target; if (bar.current) bar.current.style.transform = `scaleX(${t.duration ? t.currentTime / t.duration : 0})`; if (active) tick(v, t.currentTime); }}
          onError={onError} />}
        {failed && <span className="slide-failed"><b>Видео не загрузилось</b>
          <button onClick={e => { e.stopPropagation(); retry(); }}><I.refresh width="18" height="18" />Ещё раз</button></span>}
        {paused && !failed && <span className="slide-paused"><I.play width="64" height="64" /></span>}
        {fast && <span className="slide-fast">2x ▶▶</span>}
        {burst > 0 && <span key={burst} className="slide-burst"><I.heart fill width="110" height="110" /></span>}
      </div>
      <div className="slide-shade" />
      <aside className="rail">
        <div className="rail-ava">
          <Avatar ch={{ avatar: v.avatar, title: v.author_title, username: v.author }} size={34} ring="on" />
          {!follow && <span className="rail-plus" onClick={e => { e.stopPropagation(); St.toggleFollow(v); haptic(); }}>+</span>}
        </div>
        <button className={'rail-btn' + (liked ? ' on-like' : '')} onClick={() => { St.toggleLike(v); haptic(); }}>
          <span className="rail-ic"><I.heart fill={liked} /></span><span>{fmt(shown.likes || 0)}</span></button>
        <button className="rail-btn" onClick={() => { onComments(v); haptic(); }}>
          <span className="rail-ic"><I.comment /></span><span>{fmt(shown.comments || 0)}</span></button>
        <button className={'rail-btn' + (saved ? ' on-save' : '')} onClick={() => { St.toggleSave(v); haptic(); }}>
          <span className="rail-ic"><I.bookmark fill={saved} /></span><span>{fmt(shown.saves || 0)}</span></button>
        <button className="rail-btn" onClick={() => { St.shared(v); share(`${v.author}/${v.id.split('/')[1]}`, (v.caption || '').split('\n')[0].slice(0, 80)); }}>
          <span className="rail-ic"><I.share /></span><span>{fmt(shown.shares || 0)}</span></button>
        <button className={'rail-btn rail-speed' + (rate !== 1 ? ' on' : '')} onClick={() => { const i = SPEEDS.indexOf(rate); setRate(SPEEDS[(i + 1) % SPEEDS.length]); haptic(); }}>
          <span className="rail-ic"><b>{rate}x</b></span></button>
        <div className="rail-views"><span className="rail-ic"><I.eye /></span><span>{fmt(shown.views || 0)}</span></div>
      </aside>
      <div className="slide-info">
        <div className="slide-ch"><span className="slide-author">@{v.author}</span></div>
        <div className="slide-tags"><span style={{ '--c': catColor(v.cat) }}>{catEmoji(v.cat)} {v.game || catName(v.cat)}</span></div>
        {v.caption && <p className={'slide-text' + (more ? ' open' : '')} onClick={() => setMore(!more)}>{v.caption}</p>}
      </div>
      <div className={'slide-progress' + (stall ? ' stall' : '')}><i ref={bar} /></div>
    </section>
  );
});

const Blank = memo(function Blank() { return <section className="slide slide-empty" />; });

export default function Feed({ list, onNeedMore, loading, embedded, tabs, mode, onTab, vibes, vibe, onVibe, onClose, onBroken, paused, start = 0 }) {
  const box = useRef(null);
  const [active, setActive] = useState(start);
  const [readyId, setReadyId] = useState(null);
  const [clear, setClear] = useState(false);
  const [rate, setRateState] = useState(speed);
  const setRate = useCallback(r => { speed = r; setRateState(r); }, []);
  const [, force] = useState(0);
  const [pickVibe, setPickVibe] = useState(false);
  const [sheet, setSheet] = useState(null);          // открытые комментарии
  const openComments = useCallback(v => setSheet(v), []);
  const watch = useRef({ id: null, max: 0, last: 0, total: 0, v: null });
  const S = useRef({}); S.current = { list, active, onNeedMore };
  const [, setLoaded] = useState(0);
  const P = useMemo(() => createPrefetcher(() => setLoaded(x => x + 1)), []);

  useEffect(() => () => P.clear(), [P]);
  useEffect(() => St.onChange(() => force(x => x + 1)), []);
  useEffect(() => { if (embedded) return; const off = backButton(true, onClose); return () => { off(); backButton(false); }; }, [embedded, onClose]);
  // сменили вкладку или вайб — возвращаемся наверх
  useEffect(() => { setActive(0); const el = box.current; if (el) el.scrollTop = 0; }, [mode, vibe]);

  const tick = useCallback((v, t) => {
    const w = watch.current;
    if (w.id !== v.id) { watch.current = { id: v.id, max: 0, last: t, total: 0, v }; return; }
    if (t + 0.5 < w.last) w.total += w.last;
    w.last = t; w.max = Math.max(w.max, w.total + t);
  }, []);
  const flush = useCallback(() => {
    const w = watch.current;
    if (w.v && w.max > 0) St.watched(w.v, w.max);
    watch.current = { id: null, max: 0, last: 0, total: 0, v: null };
  }, []);
  useEffect(() => () => flush(), []); // eslint-disable-line
  const onReady = useCallback(id => setReadyId(id), []);

  const settle = useCallback(() => {
    const el = box.current, { list, active, onNeedMore } = S.current; if (!el) return;
    const i = Math.round(el.scrollTop / el.clientHeight);
    if (i === active || i < 0 || i >= list.length) return;
    flush(); setActive(i);
    if (onNeedMore && i > list.length - 8) onNeedMore();
  }, [flush]);
  const timer = useRef(0);
  const onScroll = () => {
    clearTimeout(timer.current);
    const el = box.current; if (!el) return;
    const pos = el.scrollTop / el.clientHeight;
    if (Math.abs(pos - Math.round(pos)) < 0.015) settle();
    else timer.current = setTimeout(settle, hasScrollEnd ? 250 : 90);
  };
  useEffect(() => {
    const el = box.current; if (!el || !hasScrollEnd) return;
    const f = () => { clearTimeout(timer.current); settle(); };
    el.addEventListener('scrollend', f); return () => el.removeEventListener('scrollend', f);
  }, [settle, list.length > 0]); // eslint-disable-line

  // щипок двумя пальцами — спрятать всё лишнее
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

  const curReady = list[active] && readyId === list[active].id;
  useEffect(() => {
    if (paused) { P.stop(); return; }
    const from = Math.max(0, active - 2);
    const go = () => P.want(list.slice(from, active + 1 + ahead()).map((v, k) =>
      ({ key: v.id, src: v.video_url, dur: v.duration, start: from + k > active })));
    list.slice(active + 1, active + 7).forEach(v => { if (v.thumb_url) { const im = new Image(); im.decoding = 'async'; im.src = v.thumb_url; } });
    if (curReady) { go(); return; }
    const t = setTimeout(go, 1000); return () => clearTimeout(t);
  }, [active, list, paused, curReady]); // eslint-disable-line

  const tabIndex = tabs ? tabs.findIndex(t => t[0] === mode) : -1;
  const curVibe = vibes && vibes.find(x => x[0] === vibe);
  return (
    <div className={'feed' + (embedded ? ' embedded' : '') + (clear ? ' clear' : '')}
         onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd}>
      <div className="feed-top">
        {embedded ? <span className="feed-side" /> : <button className="feed-btn" onClick={() => { flush(); onClose(); }}><I.back width="20" height="20" /></button>}
        {tabs ? (
          <div className="feed-tabs" style={{ '--i': tabIndex, '--n': tabs.length }}>
            {tabs.map(([id, t]) => <button key={id} className={id === mode ? 'on' : ''} onClick={() => { flush(); onTab(id); }}>{t}</button>)}
          </div>
        ) : <span className="feed-title">Моё</span>}
        {vibes ? (
          <button className={'feed-btn' + (vibe ? ' on' : '')} onClick={() => setPickVibe(!pickVibe)}>
            {curVibe ? <b className="vibe-em">{curVibe[2]}</b> : <I.spark width="18" height="18" />}
          </button>
        ) : <span className="feed-side" />}
      </div>

      {sheet && <Comments video={sheet} onClose={() => setSheet(null)} onCount={d => St.bumpComments(sheet, d)} />}

      {pickVibe && vibes && (
        <div className="vibe-row">
          <button className={!vibe ? 'on' : ''} onClick={() => { onVibe(''); setPickVibe(false); }}>✨ Всё</button>
          {vibes.map(([id, name, em]) => (
            <button key={id} className={vibe === id ? 'on' : ''} onClick={() => { onVibe(id); setPickVibe(false); }}>{em} {name}</button>
          ))}
        </div>
      )}

      {list.length ? (
        <div className="feed-scroll" ref={box} onScroll={onScroll}>
          {list.map((v, i) => {
            const d = i - active;
            if (d < -1 || d > 3) return <Blank key={v.id} />;
            return <Slide key={v.id} v={v} blob={P.get(v.id)} active={d === 0} warm={(d === 1 || d === 2) && curReady}
              withVideo={d >= -1 && d <= 2} preload={d === 0 || d === 1 ? 'auto' : 'metadata'}
              liked={St.isLiked(v)} saved={St.isSaved(v)} follow={St.isFollowing(v)} onComments={openComments}
              rate={rate} setRate={setRate} paused={paused || !!sheet}
              onBroken={onBroken} onReady={onReady} tick={tick} />;
          })}
        </div>
      ) : (
        <div className="feed-empty">
          <div className="empty-emoji">{loading ? '⏳' : '👀'}</div>
          <b>{loading ? 'Загружаем' : 'Пока пусто'}</b>
          <p>{loading ? 'Секунду…' : mode === 'follow' ? 'Подпишись на авторов кнопкой «+» — их ролики будут здесь.' : 'Ролики скоро появятся.'}</p>
        </div>
      )}
    </div>
  );
}
