// Экраны: главная (истории + вкладки + плитка), каналы, страница канала, новости, профиль.
import { useMemo, useState } from 'react';
import { I, Avatar } from './Icons';
import { fmt, dur, ago, CATS, catName, catEmoji, catColor, COUNTRIES } from '../lib/format';
import * as St from '../lib/store';
import { openTg, tgUser } from '../lib/tg';

// ---------- плитка в два столбца (как Explore в Instagram / Pinterest) ----------
export function Masonry({ items, onOpen, hot, empty, small }) {
  if (!items.length) return empty || <Empty emoji="🫥" title="Тут пока пусто" />;
  const cols = [[], []], h = [0, 0];
  items.forEach((v, i) => {
    const tall = v.ratio < 1 ? 1.62 : v.ratio > 1.3 ? 0.82 : 1.15;
    const c = h[0] <= h[1] ? 0 : 1; cols[c].push([v, i, tall]); h[c] += tall;
  });
  return (
    <div className={'masonry' + (small ? ' small' : '')}>
      {cols.map((col, k) => (
        <div key={k} className="mcol">
          {col.map(([v, i, tall]) => (
            <button key={v.key} className="card" style={{ aspectRatio: `1 / ${tall}` }} onClick={() => onOpen(i)}>
              {v.thumb ? <img src={v.thumb} alt="" loading="lazy" /> : <span className="card-ph" />}
              {hot && hot.has(v.key) && <span className="badge-hot">🔥 Тренд</span>}
              <span className="card-dur">{dur(v.duration)}</span>
              {!small && <span className="card-foot">
                {v.text && <span className="card-text">{v.text.split('\n')[0]}</span>}
                <span className="card-meta"><I.play width="12" height="12" />{fmt(v.views)}<i>·</i>{catEmoji(v.cat)} {catName(v.cat)}</span>
              </span>}
              {small && <span className="card-meta sm"><I.play width="11" height="11" />{fmt(v.views)}</span>}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
export const Empty = ({ emoji, title, text, action }) => (
  <div className="empty"><div className="empty-emoji">{emoji}</div><b>{title}</b>{text && <p>{text}</p>}{action}</div>
);

// ---------- главная ----------
export function Home({ tab, setTab, cat, setCat, query, setQuery, items, onOpen, stories, chMap, onStory, hot, cats }) {
  const [search, setSearch] = useState(!!query);
  const tabs = [['foryou', 'Для вас'], ['trends', 'Тренды'], ['follow', 'Подписки']];
  const ti = tabs.findIndex(t => t[0] === tab);
  return (
    <div className="page">
      <header className="top">
        <div className="brand"><span className="logo">T</span><span className="word">тренды</span></div>
        <button className={'icon-btn' + (search ? ' on' : '')} onClick={() => { setSearch(!search); if (search) setQuery(''); }}><I.search /></button>
      </header>
      {search && <label className="search"><I.search width="20" height="20" /><input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Видео, каналы, темы…" />{query && <button onClick={() => setQuery('')}><I.close width="18" height="18" /></button>}</label>}
      <div className="stories">
        {stories.map(s => (
          <button key={s.username} className="story" onClick={() => onStory(s.username)}>
            <Avatar ch={chMap[s.username]} size={58} ring={s.seen ? 'seen' : 'on'} />
            <span>{(chMap[s.username] || {}).title || s.username}</span>
          </button>
        ))}
      </div>
      <div className="tabs" style={{ '--i': ti }}>
        {tabs.map(([id, t]) => <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{t}</button>)}
        <i className="tabs-ind" />
      </div>
      <div className="chips">
        <button className={'chip' + (cat === 'all' ? ' on' : '')} onClick={() => setCat('all')}>✨ Всё</button>
        {cats.map(c => <button key={c} className={'chip' + (cat === c ? ' on' : '')} style={{ '--c': catColor(c) }} onClick={() => setCat(c)}>{catEmoji(c)} {catName(c)}</button>)}
      </div>
      <Masonry items={items} onOpen={onOpen} hot={hot}
        empty={tab === 'follow'
          ? <Empty emoji="👀" title="Пока ни на кого не подписан" text="Нажимай 👁 «Отслеживать» на роликах и каналах — их новые видео будут здесь." />
          : <Empty emoji="🔍" title="Ничего не нашлось" text="Попробуй другое слово или категорию." />} />
    </div>
  );
}

// ---------- каналы ----------
const SORTS = [['subscribers', 'Подписчики'], ['reach', 'Охват'], ['err', 'ERR']];
export function Channels({ channels, onChannel }) {
  const [cat, setCat] = useState('all'), [sort, setSort] = useState('subscribers'), [, force] = useState(0);
  const cats = useMemo(() => { const m = {}; channels.forEach(c => { m[c.cat] = (m[c.cat] || 0) + 1; }); return m; }, [channels]);
  const list = channels.filter(c => cat === 'all' || c.cat === cat).sort((a, b) => b[sort] - a[sort]);
  const val = c => sort === 'err' ? c.err + '%' : fmt(c[sort]);
  const top = list.slice(0, 3), rest = list.slice(3);
  return (
    <div className="page">
      <header className="top"><h1 className="title">Каналы</h1><span className="pill-count">{channels.length}</span></header>
      <div className="chips">
        <button className={'chip' + (cat === 'all' ? ' on' : '')} onClick={() => setCat('all')}>✨ Все</button>
        {Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([c, n]) => <button key={c} className={'chip' + (cat === c ? ' on' : '')} style={{ '--c': catColor(c) }} onClick={() => setCat(c)}>{catEmoji(c)} {catName(c)} <b>{n}</b></button>)}
      </div>
      <div className="seg">{SORTS.map(([s, t]) => <button key={s} className={sort === s ? 'on' : ''} onClick={() => setSort(s)}>{t}</button>)}</div>
      <div className="podium">
        {top.map((c, i) => (
          <button key={c.username} className={'pod pod' + (i + 1)} onClick={() => onChannel(c.username)}>
            <span className="pod-medal">{['🥇', '🥈', '🥉'][i]}</span>
            <Avatar ch={c} size={i === 0 ? 64 : 52} ring="on" />
            <b>{c.title}</b>
            <span className="pod-val">{val(c)}</span>
            <small>{SORTS.find(s => s[0] === sort)[1].toLowerCase()}</small>
          </button>
        ))}
      </div>
      <div className="list">
        {rest.map((c, i) => {
          const f = St.isFollowing(c.username);
          return (
            <div key={c.username} className="row">
              <span className="row-n">{i + 4}</span>
              <button className="row-tap" onClick={() => onChannel(c.username)}>
                <Avatar ch={c} size={46} />
                <span className="row-main"><b>{c.title}</b><small>{COUNTRIES[c.country]} {catEmoji(c.cat)} {catName(c.cat)} · {fmt(c.subscribers)}</small></span>
              </button>
              <span className="row-val">{val(c)}</span>
              <button className={'mini-follow' + (f ? ' on' : '')} onClick={() => { St.toggleFollow(c.username, c.cat); force(x => x + 1); }}>{f ? <I.check width="16" height="16" /> : '+'}</button>
            </div>
          );
        })}
      </div>
      <p className="note">Охват — сколько просмотров обычно набирает пост. ERR — какая доля подписчиков реально смотрит.</p>
    </div>
  );
}

export function ChannelPage({ ch, videos, news, onOpen, onBack }) {
  const [, force] = useState(0);
  if (!ch) return null;
  const follow = St.isFollowing(ch.username);
  const th = videos.map(v => v.thumb).filter(Boolean), cover = th.length ? [0, 1, 2].map(i => th[i % th.length]) : [];
  return (
    <div className="page chpage">
      <div className="cover" style={{ '--c': catColor(ch.cat) }}>
        {cover.map((t, i) => <img key={i} src={t} alt="" />)}
        <button className="back" onClick={onBack}><I.back width="20" height="20" /></button>
      </div>
      <div className="chhead">
        <Avatar ch={ch} size={92} ring="on" />
        <h1>{ch.title}</h1>
        <div className="muted">@{ch.username} · {COUNTRIES[ch.country]} · {catEmoji(ch.cat)} {catName(ch.cat)}</div>
        <div className="statrow">
          <div><b>{fmt(ch.subscribers)}</b><small>подписчиков</small></div>
          <div><b>{fmt(ch.reach)}</b><small>охват</small></div>
          <div><b>{ch.err}%</b><small>ERR</small></div>
          <div><b>{videos.length}</b><small>видео</small></div>
        </div>
        {ch.description && <p className="desc">{ch.description}</p>}
        <div className="chbtns">
          <button className={'btn btn-glass' + (follow ? ' on' : '')} onClick={() => { St.toggleFollow(ch.username, ch.cat); force(x => x + 1); }}>
            {follow ? <><I.check width="18" height="18" />Отслеживаю</> : <><I.eye width="18" height="18" />Отслеживать</>}</button>
          <button className="btn btn-tg" onClick={() => openTg(ch.username)}><I.plane width="18" height="18" />Подписаться</button>
        </div>
      </div>
      <Masonry items={videos} onOpen={onOpen} small empty={<Empty emoji="🎬" title="Коротких видео пока нет" />} />
      {news.length > 0 && <><h2 className="h2">Последние посты</h2><NewsList items={news.slice(0, 8)} chMap={{ [ch.username]: ch }} /></>}
    </div>
  );
}

// ---------- новости ----------
const TOPICS = [
  ['all', '✨ Все'],
  ['incidents', '🚨 Происшествия', /дтп|авари|пожар|погиб|задерж|милици|полици|угрожал|мчс|суд\b|уголовн|наркот|взрыв/i],
  ['politics', '🏛 Политика', /президент|жапаров|токаев|мирзиёев|жогорку|депутат|кабмин|министр|мид\b|выбор|парламент|правительств/i],
  ['economy', '💰 Экономика', /сом\b|сомов|тенге|сум\b|доллар|экспорт|импорт|бизнес|налог|бюджет|цен[аы]|тариф|банк|еаэс|инвест/i],
  ['sport', '⚽ Спорт', /ufc|mma|бой|чемпион|футбол|турнир|спорт|боец|матч/i],
  ['tech', '💡 Технологии', /ии\b|нейросет|iphone|apple|google|технолог|робот|телеграм|интернет/i],
  ['world', '🌍 В мире', /сша|украин|китай|европ|трамп|путин|израил|иран/i]
];
const topicOf = t => (TOPICS.find(x => x[2] && x[2].test(t)) || [])[0] || 'other';

export function NewsList({ items, chMap }) {
  return (
    <div className="news">
      {items.map((n, k) => {
        const ch = chMap[n.channel]; const [title, ...rest] = (n.text || '').split('\n').filter(Boolean);
        const body = rest.join(' ');
        return (
          <article key={n.key} className={'post' + (n.photo && k % 5 === 0 ? ' big' : '')}>
            {n.photo && <img className="post-img" src={n.photo} alt="" loading="lazy" />}
            <div className="post-body">
              <header><Avatar ch={ch} size={26} /><b>{ch ? ch.title : n.channel}</b><small>{COUNTRIES[ch && ch.country]} · {ago(n.date)}</small></header>
              <h3>{title}</h3>
              {body && <p>{body.slice(0, 180)}{body.length > 180 ? '…' : ''}</p>}
              <footer><span><I.eye width="15" height="15" />{fmt(n.views)}</span>
                <button className="btn-link" onClick={() => openTg(`${n.channel}/${n.id}`)}>Читать в канале<I.external width="15" height="15" /></button></footer>
            </div>
          </article>
        );
      })}
    </div>
  );
}
export function News({ news, chMap }) {
  const [topic, setTopic] = useState('all');
  const tagged = useMemo(() => news.map(n => ({ ...n, topic: topicOf(n.text) })).sort((a, b) => new Date(b.date) - new Date(a.date)), [news]);
  const counts = useMemo(() => { const m = {}; tagged.forEach(n => { m[n.topic] = (m[n.topic] || 0) + 1; }); return m; }, [tagged]);
  const list = tagged.filter(n => topic === 'all' || n.topic === topic);
  return (
    <div className="page">
      <header className="top"><h1 className="title">Новости</h1><span className="live"><i />сейчас</span></header>
      <div className="chips">
        {TOPICS.filter(t => t[0] === 'all' || counts[t[0]]).map(([id, t]) => <button key={id} className={'chip' + (topic === id ? ' on' : '')} onClick={() => setTopic(id)}>{t}</button>)}
      </div>
      <NewsList items={list.slice(0, 60)} chMap={chMap} />
    </div>
  );
}

// ---------- профиль ----------
const LEVELS = [[0, 'Новичок', '🌱'], [15, 'В теме', '⚡'], [60, 'Знаток', '🔥'], [200, 'Легенда', '👑']];
export function Profile({ videos, chMap, onOpenList, onChannel }) {
  const [tab, setTab] = useState('saves'), [, force] = useState(0);
  const u = tgUser(), S = St.state();
  const byKey = useMemo(() => Object.fromEntries(videos.map(v => [v.key, v])), [videos]);
  const lists = {
    saves: S.saves.map(k => byKey[k]).filter(Boolean),
    likes: S.likes.map(k => byKey[k]).filter(Boolean),
    history: Object.entries(S.watch).sort((a, b) => b[1].at - a[1].at).map(([k]) => byKey[k]).filter(Boolean)
  };
  const watched = Object.keys(S.watch).length;
  const li = LEVELS.reduce((a, l, i) => watched >= l[0] ? i : a, 0), lvl = LEVELS[li], next = LEVELS[li + 1];
  const pct = next ? Math.round((watched - lvl[0]) / (next[0] - lvl[0]) * 100) : 100;
  const vibe = Object.entries(S.cat).filter(([, s]) => s > 0); const vSum = vibe.reduce((a, b) => a + b[1], 0);
  const src = (lists.saves.length ? lists.saves : lists.likes.length ? lists.likes : videos).map(v => v.thumb).filter(Boolean);
  const cover = src.length ? [0, 1, 2].map(i => src[i % src.length]) : [];
  const name = u ? u.name : 'Гость';
  const tabs = [['saves', 'Сохранённое', I.bookmark, lists.saves.length], ['likes', 'Лайки', I.heart, lists.likes.length], ['follows', 'Подписки', I.users, S.follows.length], ['history', 'История', I.history, lists.history.length]];
  return (
    <div className="page profile">
      <div className="pcover">{cover.map((t, i) => <img key={i} src={t} alt="" />)}<i /></div>
      <div className="phead">
        <span className="ring big">{u && u.photo ? <img className="ava" src={u.photo} alt="" style={{ width: 96, height: 96 }} /> : <Avatar ch={{ title: name, username: (u && u.username) || 'guest' }} size={96} />}</span>
        <h1>{name}</h1>
        <div className="muted">{u && u.username ? '@' + u.username : 'Открой через бота — здесь будут твои имя и фото'}</div>
        <div className="level">
          <span className="level-badge">{lvl[2]} {lvl[1]}</span>
          <span className="level-bar"><i style={{ width: pct + '%' }} /></span>
          <small>{next ? `${watched}/${next[0]} до «${next[1]}»` : 'максимальный уровень'}</small>
        </div>
      </div>
      <div className="pstats">
        <div><b>{S.likes.length}</b><small>лайков</small></div>
        <div><b>{S.saves.length}</b><small>сохранено</small></div>
        <div><b>{S.follows.length}</b><small>подписок</small></div>
        <div><b>{watched}</b><small>просмотров</small></div>
      </div>
      {vibe.length > 0 && (
        <div className="vibe">
          <div className="vibe-head"><b>Твой вайб</b><button onClick={() => { St.resetTaste(); force(x => x + 1); }}><I.refresh width="15" height="15" />сбросить</button></div>
          <div className="vibe-bar">{vibe.sort((a, b) => b[1] - a[1]).map(([c, s]) => <i key={c} style={{ flex: s, background: catColor(c) }} />)}</div>
          <div className="vibe-legend">{vibe.slice(0, 4).map(([c, s]) => <span key={c}><i style={{ background: catColor(c) }} />{catEmoji(c)} {catName(c)} {Math.round(s / vSum * 100)}%</span>)}</div>
        </div>
      )}
      <div className="ptabs">
        {tabs.map(([id, t, Ic, n]) => <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}><Ic width="20" height="20" fill={tab === id && id !== 'follows' && id !== 'history' ? 'currentColor' : 'none'} /><span>{t}</span>{n > 0 && <em>{n}</em>}</button>)}
      </div>
      {tab === 'follows' ? (
        S.follows.length ? <div className="follow-grid">{S.follows.map(un => { const c = chMap[un] || { username: un, title: un }; return (
          <button key={un} className="fcard" onClick={() => onChannel(un)}><Avatar ch={c} size={56} ring="on" /><b>{c.title}</b><small>{fmt(c.subscribers)} подп.</small></button>); })}</div>
          : <Empty emoji="👀" title="Нет подписок" text="Отслеживай каналы — они появятся здесь и во вкладке «Подписки»." />
      ) : (
        <Masonry items={lists[tab]} small onOpen={i => onOpenList(lists[tab], i)}
          empty={tab === 'saves' ? <Empty emoji="🔖" title="Сохраняй лучшее" text="Жми закладку на ролике — он сохранится здесь навсегда." />
            : tab === 'likes' ? <Empty emoji="💜" title="Пока без лайков" text="Дважды коснись видео, чтобы лайкнуть." />
              : <Empty emoji="🕐" title="История пуста" text="Здесь будут ролики, которые ты смотрел." />} />
      )}
    </div>
  );
}
