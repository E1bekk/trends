// Полноэкранная лента как в TikTok: листаем вверх-вниз, ролик сам запускается,
// справа — лайк, сохранить, поделиться; снизу — канал и «Подписаться».
import { useEffect, useRef, useState, useCallback } from 'react';
import { I, Avatar } from './Icons';
import { fmt, catName, catEmoji, catColor, COUNTRIES } from '../lib/format';
import * as St from '../lib/store';
import { rerankTail } from '../lib/reco';
import { openTg, share, haptic, backButton } from '../lib/tg';

let soundOn = false; // звук включается после первого касания и дальше остаётся включённым

function Slide({ v, ch, active, near, onTap, muted, onChannel, onExpired, tick }) {
  const ref = useRef(null);
  const [paused, setPaused] = useState(false);
  const [vertical, setVertical] = useState(v.ratio < 1);
  const [progress, setProgress] = useState(0);
  const [burst, setBurst] = useState(0);
  const liked = St.isLiked(v.key), saved = St.isSaved(v.key), follow = St.isFollowing(v.channel);
  const [more, setMore] = useState(false);

  useEffect(() => {
    const el = ref.current; if (!el) return;
    if (active) { el.muted = muted; const p = el.play(); if (p) p.catch(() => { el.muted = true; el.play().catch(() => {}); }); setPaused(false); }
    else { el.pause(); if (!near) el.currentTime = 0; }
  }, [active, muted, near]);

  const tap = e => {
    const el = ref.current; if (!el) return;
    if (!soundOn) { soundOn = true; onTap(); el.muted = false; el.play().catch(() => {}); return; }
    if (el.paused) { el.play().catch(() => {}); setPaused(false); } else { el.pause(); setPaused(true); }
  };
  const dbl = () => { if (!St.isLiked(v.key)) St.toggleLike(v); setBurst(Date.now()); haptic('medium'); };
  const lastTap = useRef(0);
  // одно касание — пауза/звук, двойное — лайк
  const onPointer = e => { const now = Date.now(); if (now - lastTap.current < 280) { dbl(); lastTap.current = 0; } else { lastTap.current = now; setTimeout(() => { if (lastTap.current === now) tap(e); }, 290); } };

  return (
    <section className="slide">
      <div className="slide-media" onClick={onPointer}>
        {v.thumb && <img className={'slide-poster' + (vertical ? ' cover' : '')} src={v.thumb} alt="" />}
        {near && <video ref={ref} className={'slide-video' + (vertical ? ' cover' : '')} src={v.video} loop playsInline muted={muted} preload={active ? 'auto' : 'metadata'}
          onLoadedMetadata={e => setVertical(e.target.videoHeight > e.target.videoWidth * 1.15)}
          onTimeUpdate={e => { const t = e.target; setProgress(t.duration ? t.currentTime / t.duration : 0); tick(v, t.currentTime); }}
          onError={() => onExpired(v)} />}
        {paused && <span className="slide-paused"><I.play width="64" height="64" /></span>}
        {burst > 0 && <span key={burst} className="slide-burst"><I.heart width="96" height="96" /></span>}
      </div>
      <div className="slide-shade" />
      <aside className="rail">
        <button className="rail-ava" onClick={() => onChannel(v.channel)}>
          <Avatar ch={ch} size={44} ring="on" />
          {!follow && <span className="rail-plus" onClick={e => { e.stopPropagation(); St.toggleFollow(v.channel, v.cat); haptic(); }}>+</span>}
        </button>
        <button className={'rail-btn' + (liked ? ' on-like' : '')} onClick={() => { St.toggleLike(v); haptic(); }}>
          <span className="rail-ic"><I.heart fill={liked} /></span><span>{liked ? 'Нравится' : 'Лайк'}</span></button>
        <button className={'rail-btn' + (saved ? ' on-save' : '')} onClick={() => { St.toggleSave(v); haptic(); }}>
          <span className="rail-ic"><I.bookmark fill={saved} /></span><span>{saved ? 'В закладках' : 'Сохранить'}</span></button>
        <button className="rail-btn" onClick={() => { St.shared(v); share(`${v.channel}/${v.id}`, (v.text || '').split('\n')[0].slice(0, 80)); }}>
          <span className="rail-ic"><I.share /></span><span>Поделиться</span></button>
        <div className="rail-views"><span className="rail-ic"><I.eye /></span><span>{fmt(v.views)}</span></div>
      </aside>
      <div className="slide-info">
        <div className="slide-ch">
          <button className="slide-chname" onClick={() => onChannel(v.channel)}>{ch ? ch.title : v.channel}</button>
          <button className="btn-sub" onClick={() => { openTg(v.channel); if (!St.isFollowing(v.channel)) St.toggleFollow(v.channel, v.cat); }}>
            <I.plane width="16" height="16" />Подписаться</button>
          <button className={'btn-watch' + (follow ? ' on' : '')} title="Отслеживать в приложении" onClick={() => { St.toggleFollow(v.channel, v.cat); haptic(); }}>
            {follow ? <I.check width="18" height="18" /> : <I.eye width="18" height="18" />}</button>
        </div>
        <div className="slide-tags"><span style={{ '--c': catColor(v.cat) }}>{catEmoji(v.cat)} {catName(v.cat)}</span>{ch && <span>{COUNTRIES[ch.country]} {fmt(ch.subscribers)} подписчиков</span>}</div>
        {v.text && <p className={'slide-text' + (more ? ' open' : '')} onClick={() => setMore(!more)}>{v.text}</p>}
      </div>
      <div className="slide-progress"><i style={{ transform: `scaleX(${progress})` }} /></div>
    </section>
  );
}

export default function Feed({ list: initial, start, chMap, mode, onClose, onChannel, onExpired }) {
  const box = useRef(null);
  const [list, setList] = useState(initial);
  const [active, setActive] = useState(start || 0);
  const [muted, setMuted] = useState(!soundOn);
  const [, force] = useState(0);
  const watch = useRef({ key: null, max: 0, last: 0, total: 0 });

  useEffect(() => St.onChange(() => force(x => x + 1)), []);
  useEffect(() => backButton(true, onClose), [onClose]);
  useEffect(() => () => backButton(false), []);
  useEffect(() => { const el = box.current; if (el) el.scrollTop = (start || 0) * el.clientHeight; }, []); // eslint-disable-line

  // учёт времени просмотра (с учётом повторов по кругу)
  const tick = useCallback((v, t) => {
    const w = watch.current;
    if (w.key !== v.key) return;
    if (t + 0.5 < w.last) w.total += w.last; // ролик пошёл по второму кругу
    w.last = t; w.max = Math.max(w.max, w.total + t);
  }, []);
  const flush = useCallback(() => {
    const w = watch.current, v = list.find(x => x.key === w.key);
    if (v && w.max > 0) St.watched(v, w.max);
  }, [list]);

  const onScroll = () => {
    const el = box.current; if (!el) return;
    const i = Math.round(el.scrollTop / el.clientHeight);
    if (i !== active && i >= 0 && i < list.length) {
      flush();
      watch.current = { key: list[i].key, max: 0, last: 0, total: 0 };
      setActive(i);
      // «Для вас»: после каждого ролика досортировываем оставшуюся ленту под новые интересы
      if (mode === 'foryou' && i % 2 === 0) setList(l => rerankTail(l, i, chMap));
    }
  };
  useEffect(() => { watch.current = { key: list[active] && list[active].key, max: 0, last: 0, total: 0 }; return () => flush(); }, []); // eslint-disable-line

  if (!list.length) return null;
  return (
    <div className="feed">
      <div className="feed-top">
        <button className="feed-close" onClick={onClose}><I.back width="20" height="20" /></button>
        <span className="feed-title">{{ foryou: 'Для вас', trends: 'Тренды', follow: 'Подписки', channel: 'Канал', profile: 'Моё' }[mode] || 'Лента'}</span>
        <button className="feed-mute" onClick={() => { soundOn = true; setMuted(m => !m); }}>{muted ? <I.mute /> : <I.sound />}</button>
      </div>
      <div className="feed-scroll" ref={box} onScroll={onScroll}>
        {list.map((v, i) => (
          <Slide key={v.key} v={v} ch={chMap[v.channel]} active={i === active} near={Math.abs(i - active) <= 1} muted={muted}
            onTap={() => setMuted(false)} onChannel={u => { flush(); onChannel(u); }} onExpired={onExpired} tick={tick} />
        ))}
      </div>
      {muted && <div className="feed-hint" onClick={() => { soundOn = true; setMuted(false); }}><I.sound width="18" height="18" />Нажми, чтобы включить звук</div>}
    </div>
  );
}
