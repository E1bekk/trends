// Лайки и сохранённое живут на сервере, но кнопка должна срабатывать мгновенно.
// Поэтому здесь мы держим «поправки»: нажал — сразу видно, а на сервер уходит следом.
// Просмотры копятся и отправляются пачкой раз в несколько секунд.
import { sendEvents, follow as apiFollow } from './api';

const patch = new Map();        // id ролика → { liked, saved, likes, saves }
let queue = [];                 // события, ещё не ушедшие на сервер
const subs = new Set();
let timer = 0, sending = false;

export const onChange = f => { subs.add(f); return () => subs.delete(f); };
const ping = () => subs.forEach(f => f());

// как ролик выглядит с учётом ещё не доехавших до сервера нажатий
export function withPatch(v) {
  const p = patch.get(v.id);
  return p ? { ...v, ...p } : v;
}
export const isLiked = v => { const p = patch.get(v.id); return p && p.liked !== undefined ? p.liked : !!v.liked; };
export const isSaved = v => { const p = patch.get(v.id); return p && p.saved !== undefined ? p.saved : !!v.saved; };

function setPatch(v, extra) {
  patch.set(v.id, { ...(patch.get(v.id) || {}), ...extra });
  if (patch.size > 2000) patch.delete(patch.keys().next().value);
  ping();
}

export function push(e) {
  queue.push(e);
  if (queue.length > 200) queue = queue.slice(-200);
  if (!timer) timer = setTimeout(flush, 5000);
}

export async function flush() {
  clearTimeout(timer); timer = 0;
  if (sending || !queue.length) return;
  const batch = queue.slice(0, 50);
  queue = queue.slice(50);
  sending = true;
  try { await sendEvents(batch); }
  catch (e) { queue = batch.concat(queue).slice(-200); }   // не дошло — попробуем позже
  finally { sending = false; if (queue.length && !timer) timer = setTimeout(flush, 5000); }
}

export function toggleLike(v) {
  const on = !isLiked(v);
  setPatch(v, { liked: on, likes: Math.max(0, (withPatch(v).likes || 0) + (on ? 1 : -1)) });
  push({ v: v.id, kind: 'like', on });
  return on;
}
export function toggleSave(v) {
  const on = !isSaved(v);
  setPatch(v, { saved: on, saves: Math.max(0, (withPatch(v).saves || 0) + (on ? 1 : -1)) });
  push({ v: v.id, kind: 'save', on });
  return on;
}
export function shared(v) { push({ v: v.id, kind: 'share' }); }
export function bumpComments(v, d) { setPatch(v, { comments: Math.max(0, (withPatch(v).comments || 0) + d) }); }

// подписка на автора: тоже сначала на экране, потом на сервере
const follows = new Map();
export const isFollowing = v => (follows.has(v.author) ? follows.get(v.author) : !!v.following);
export async function toggleFollow(v) {
  const on = !isFollowing(v);
  follows.set(v.author, on); ping();
  try { await apiFollow(v.author); }
  catch (e) { follows.set(v.author, !on); ping(); }      // не прошло — возвращаем как было
  return on;
}
// сколько досмотрел: главный сигнал для ленты
export function watched(v, sec) {
  if (!v || sec < 0.3) return;
  push({ v: v.id, kind: 'watch', sec: Math.round(sec * 10) / 10, ratio: Math.min(1, sec / Math.max(1, v.duration || 1)) });
}

if (typeof window !== 'undefined') {
  // уходит из приложения — досылаем, что накопилось
  window.addEventListener('pagehide', () => { try { flush(); } catch (e) {} });
  document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
}
