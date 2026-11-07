// Что человек делает в приложении: лайки, сохранённое, подписки и «как смотрит».
// В прототипе хранится на телефоне; в рабочей версии будет в базе (Supabase), привязано к Telegram ID.
const KEY = 'trends.v1';
const empty = () => ({ likes: [], saves: [], follows: [], watch: {}, chan: {}, cat: {}, seen: {}, events: 0 });
let S = empty();
try { S = Object.assign(empty(), JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) {}
const subs = new Set();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} subs.forEach(f => f()); };
export const onChange = f => { subs.add(f); return () => subs.delete(f); };
export const state = () => S;

// Вес сигналов: насколько сильно действие говорит «мне это интересно»
const W = { like: 3, unlike: -3, save: 4, unsave: -2, follow: 6, unfollow: -4, share: 3, full: 2, half: 0.8, skip: -1, open: 0.5 };

// интерес к каналу и категории, со «старением»: старые сигналы весят меньше
function bump(v, w) {
  const k = 0.97;
  for (const m of [S.chan, S.cat]) for (const x in m) m[x] *= k;
  S.chan[v.channel] = (S.chan[v.channel] || 0) + w;
  if (v.cat) S.cat[v.cat] = (S.cat[v.cat] || 0) + w * 0.5;
  S.events++;
}
export const isLiked = k => S.likes.includes(k);
export const isSaved = k => S.saves.includes(k);
export const isFollowing = u => S.follows.includes(u);

export function toggleLike(v) {
  const on = !isLiked(v.key);
  S.likes = on ? [v.key, ...S.likes] : S.likes.filter(x => x !== v.key);
  bump(v, on ? W.like : W.unlike); save(); return on;
}
export function toggleSave(v) {
  const on = !isSaved(v.key);
  S.saves = on ? [v.key, ...S.saves] : S.saves.filter(x => x !== v.key);
  bump(v, on ? W.save : W.unsave); save(); return on;
}
export function toggleFollow(username, cat) {
  const on = !isFollowing(username);
  S.follows = on ? [username, ...S.follows] : S.follows.filter(x => x !== username);
  bump({ channel: username, cat }, on ? W.follow : W.unfollow); save(); return on;
}
export function shared(v) { bump(v, W.share); save(); }
// Сколько досмотрел: досмотрел почти до конца — плюс, пролистал за 2 секунды — минус
export function watched(v, seconds) {
  if (!v || seconds < 0.3) return;
  const ratio = Math.min(1, seconds / Math.max(1, v.duration));
  const w = ratio >= 0.8 ? W.full : ratio >= 0.35 ? W.half : seconds < 2.5 ? W.skip : 0;
  const prev = S.watch[v.key] || { t: 0, n: 0 };
  S.watch[v.key] = { t: Math.max(prev.t, seconds), r: Math.max(prev.r || 0, ratio), n: prev.n + 1, at: Date.now() };
  S.seen[v.key] = Date.now();
  if (w) bump(v, w);
  save();
}
export function resetTaste() {
  const keep = { likes: S.likes, saves: S.saves, follows: S.follows };
  S = Object.assign(empty(), keep); save();
}
