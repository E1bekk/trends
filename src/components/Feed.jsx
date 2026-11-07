// Лента как в TikTok: ролики на весь экран, листаем вверх-вниз, ролик сам запускается.
// Работает в двух режимах:
//  • главная страница (embedded) — сверху вкладки «Подписки / Для вас / Тренды», снизу меню;
//  • поверх экрана — когда открыли ролик из обзора, канала или профиля (кнопка «назад»).
import { useEffect, useRef, useState, useCallback } from 'react';
import { I, Avatar } from './Icons';
import { fmt, catName, catEmoji, catColor, COUNTRIES } from '../lib/format';
import * as St from '../lib/store';
import { rerankTail } from '../lib/reco';
import { openTg, share, haptic, backButton } from '../lib/tg';

let soundOn = false; // звук включается после первого касания и дальше остаётся включённым

function Slide({ v, ch, active, near, next, muted, setMuted, onChannel, onBroken, tick, paused: pausedOutside }) {
  const ref = useRef(null);
  const [paused, setPaused] = useState(false);
  const [vertical, setVertical] = useState(v.ratio < 1);
  const bar = useRef(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [burst, setBurst] = useState(0);
  const [more, setMore] = useState(false);
  const lastTap = useRef(0), tries = useRef(0);
  const liked = St.isLiked(v.key), saved = St.isSaved(v.key), follow = St.isFollowing(v.channel);

  // для iPhone: беззвучный автозапуск разрешён только с атрибутами muted + playsinline
  useEffect(() => {
    const el = ref.current; if (!el) return;
    el.setAttribute('playsinline', ''); el.setAttribute('webkit-playsinline', ''); el.setAttribute('muted', '');
  }, [near]);

  useEffect(() => {
    const el = ref.current; if (!el) return;
    if (active && !pausedOutside && !paused) {
      el.muted = muted;
      const p = el.play();
      if (p) p.catch(() => { el.muted = true; setMuted(true); el.play().catch(() => setPaused(true)); });
    } else el.pause();
  }, [active, muted, near, pausedOutside, paused, setMuted]);
  useEffect(() => { if (!active) { setPaused(false); const el = ref.current; if (el && !near) el.currentTime = 0; } }, [active, near]);

  // Касание обрабатываем СРАЗУ (иначе iPhone не даёт включить звук):
  // первое касание — звук/пауза, второе быстрое — лайк (и пауза отменяется).
  const onTap = () => {
    const el = ref.current, now = Date.now();
    if (now - lastTap.current < 300) {
      lastTap.current = 0;
      if (!St.isLiked(v.key)) St.toggleLike(v);
      setBurst(now); haptic('medium');
      if (el && el.paused) { el.play().catch(() => {}); setPaused(false); }
      return;
    }
    lastTap.current = now;
    if (!el) return;
    if (failed) { retry(); return; }
    if (!soundOn || el.muted) { soundOn = true; setMuted(false); el.muted = false; el.play().catch(() => {}); setPaused(false); return; }
    if (el.paused) { el.play().catch(() => {}); setPaused(false); } else { el.pause(); setPaused(true); }
  };
  const retry = () => { setFailed(false); setLoading(true); const el = ref.current; if (el) { el.load(); el.play().catch(() => {}); } };
  const onError = () => {
    tries.current++;
    if (tries.current === 1) onBroken(v);            // ссылка могла устареть — просим свежую ленту
    setFailed(true); setLoading(false);
  };

  return (
    <section className="slide">
      <div className="slide-media" onClick={onTap}>
        {v.thumb && <img className={'slide-poster' + (vertical ? ' cover' : '')} src={v.thumb} alt="" />}
        {v.thumb && !vertical && <img className="slide-poster-fit" src={v.thumb} alt="" />}
        {near && <video ref={ref} className={'slide-video' + (vertical ? ' cover' : '')} src={v.video} loop playsInline muted preload={active || next ? 'auto' : 'metadata'}
          onLoadedMetadata={e => setVertical(e.target.videoHeight > e.target.videoWidth * 1.15)}
          onWaiting={() => setLoading(true)} onPlaying={() => { setLoading(false); setFailed(false); }} onCanPlay={() => setLoading(false)}
          onTimeUpdate={e => { const t = e.target; if (bar.current) bar.current.style.transform = `scaleX(${t.duration ? t.currentTime / t.duration : 0})`; tick(v, t.currentTime); }}
          onError={onError} />}
        {active && loading && !failed && <span className="slide-loader"><i /></span>}
        {failed && <span className="slide-failed"><b>Видео не загрузилось</b><button onClick={e => { e.stopPropagation(); retry(); }}><I.refresh width="18" height="18" />Ещё раз</button>
          <button className="ghost" onClick={e => { e.stopPropagation(); openTg(`${v.channel}/${v.id}`); }}>Открыть в Telegram</button></span>}
        {paused && !failed && <span className="slide-paused"><I.play width="70" height="70" /></span>}
        {burst > 0 && <span key={burst} className="slide-burst"><I.heart fill width="110" height="110" /></span>}
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
          <span className="rail-ic"><I.bookmark fill={saved} /></span><span>{saved ? 'Сохранено' : 'Сохранить'}</span></button>
        <button className="rail-btn" onClick={() => { St.shared(v); share(`${v.channel}/${v.id}`, (v.text || '').split('\n')[0].slice(0, 80)); }}>
          <span className="rail-ic"><I.share /></span><span>Поделиться</span></button>
        <div className="rail-views"><span className="rail-ic"><I.eye /></span><span>{fmt(v.views)}</span></div>
      </aside>
      <div className="slide-info">
        <div className="slide-ch">
          <button className="slide-chname" onClick={() => onChannel(v.channel)}>{ch ? ch.title : v.channel}</button>
          <button className="btn-sub" onClick={() => { openTg(v.channel); if (!St.isFollowing(v.channel)) St.toggleFollow(v.channel, v.cat); }}>
            <I.plane width="15" height="15" />Подписаться</button>
        </div>
        <div className="slide-tags"><span style={{ '--c': catColor(v.cat) }}>{catEmoji(v.cat)} {catName(v.cat)}</span>{ch && <span>{COUNTRIES[ch.country]} {fmt(ch.subscribers)}</span>}</div>
        {v.text && <p className={'slide-text' + (more ? ' open' : '')} onClick={() => setMore(!more)}>{v.text}</p>}
      </div>
      <div className="slide-progress"><i ref={bar} /></div>
    </section>
  );
}

export default function Feed({ list: initial, start = 0, chMap, mode, embedded, tabs, onTab, onClose, onChannel, onBroken, onMore, paused }) {
  const box = useRef(null);
  const [list, setList] = useState(initial);
  const [active, setActive] = useState(start);
  const [muted, setMutedState] = useState(!soundOn);
  const [, force] = useState(0);
  const watch = useRef({ key: null, max: 0, last: 0, total: 0 });
  const setMuted = useCallback(m => setMutedState(m), []);

  useEffect(() => St.onChange(() => force(x => x + 1)), []);
  useEffect(() => { if (embedded) return; const off = backButton(true, onClose); return () => { off(); backButton(false); }; }, [embedded, onClose]);
  // новая лента (другая вкладка / обновились данные) — начинаем сверху
  useEffect(() => { setList(initial); setActive(start); const el = box.current; if (el) el.scrollTop = start * el.clientHeight; }, [initial]); // eslint-disable-line

  // учёт времени просмотра (с учётом повторов по кругу)
  const tick = useCallback((v, t) => {
    const w = watch.current;
    if (w.key !== v.key) { watch.current = { key: v.key, max: 0, last: t, total: 0 }; return; }
    if (t + 0.5 < w.last) w.total += w.last;
    w.last = t; w.max = Math.max(w.max, w.total + t);
  }, []);
  const flush = useCallback(() => {
    const w = watch.current, v = list.find(x => x.key === w.key);
    if (v && w.max > 0) St.watched(v, w.max);
    watch.current = { key: null, max: 0, last: 0, total: 0 };
  }, [list]);
  useEffect(() => () => flush(), []); // eslint-disable-line

  const onScroll = () => {
    const el = box.current; if (!el) return;
    const i = Math.round(el.scrollTop / el.clientHeight);
    if (i === active || i < 0 || i >= list.length) return;
    flush(); setActive(i);
    if (mode === 'foryou' && i % 3 === 0) setList(l => rerankTail(l, i + 2, chMap));   // подстраиваем остаток ленты под новые интересы
    if (onMore && i > list.length - 5) { const add = onMore(list); if (add && add.length) setList(l => l.concat(add)); }  // бесконечная лента
  };

  const goChannel = useCallback(u => { flush(); onChannel(u); }, [flush, onChannel]);
  // включить звук прямо в момент касания (так требует iPhone)
  const unmuteNow = () => {
    soundOn = true; setMutedState(false);
    const vids = box.current ? box.current.querySelectorAll('video') : [];
    vids.forEach(el => { el.muted = false; if (!el.paused) el.play().catch(() => {}); });
  };
  const toggleMute = () => {
    if (muted) return unmuteNow();
    setMutedState(true); (box.current ? box.current.querySelectorAll('video') : []).forEach(el => { el.muted = true; });
  };
  const tabIndex = tabs ? tabs.findIndex(t => t[0] === mode) : -1;
  return (
    <div className={'feed' + (embedded ? ' embedded' : '')}>
      <div className="feed-top">
        {embedded ? <span className="feed-side" /> : <button className="feed-btn" onClick={() => { flush(); onClose(); }}><I.back width="20" height="20" /></button>}
        {tabs ? (
          <div className="feed-tabs" style={{ '--i': tabIndex, '--n': tabs.length }}>
            {tabs.map(([id, t]) => <button key={id} className={id === mode ? 'on' : ''} onClick={() => { flush(); onTab(id); }}>{t}</button>)}
            <i />
          </div>
        ) : <span className="feed-title">{{ channel: 'Канал', profile: 'Моё', explore: 'Обзор', trends: 'Тренды', follow: 'Подписки' }[mode] || 'Лента'}</span>}
        <button className="feed-btn" onClick={toggleMute}>{muted ? <I.mute /> : <I.sound />}</button>
      </div>
      {list.length ? (
        <div className="feed-scroll" ref={box} onScroll={onScroll}>
          {list.map((v, i) => Math.abs(i - active) > 2
            ? <section key={v.uid || v.key} className="slide slide-empty" />
            : <Slide key={v.uid || v.key} v={v} ch={chMap[v.channel]} active={i === active} near={Math.abs(i - active) <= 1} next={i === active + 1} muted={muted} setMuted={setMuted}
              paused={paused} onChannel={goChannel} onBroken={onBroken} tick={tick} />)}
        </div>
      ) : (
        <div className="feed-empty"><div className="empty-emoji">👀</div><b>Пока пусто</b><p>{mode === 'follow' ? 'Подпишись на каналы кнопкой «+» у аватара — их ролики будут здесь.' : 'Ролики скоро появятся.'}</p></div>
      )}
      {muted && list.length > 0 && !paused && <button className="feed-hint" onClick={unmuteNow}><I.sound width="18" height="18" />Коснись, чтобы включить звук</button>}
    </div>
  );
}
