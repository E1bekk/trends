// Связь с нашим сервером. Подпись Telegram уходит заголовком — по ней сервер понимает, кто пришёл.
import { tg } from './tg';

const sign = () => (tg && tg.initData) || '';

async function call(path, opts = {}) {
  const r = await fetch(path, {
    ...opts,
    headers: { 'X-Init-Data': sign(), ...(opts.body ? { 'Content-Type': 'application/json' } : {}), ...(opts.headers || {}) }
  });
  if (!r.ok) {
    let msg = 'HTTP ' + r.status;
    try { const j = await r.json(); if (j && j.error) msg = j.error; } catch (e) {}
    throw new Error(msg);
  }
  return r.json();
}

// порция ленты: mode — foryou | trends | fresh | follow, vibe — тема или пусто
export const getFeed = ({ mode = 'foryou', vibe = '', limit = 20, skip = 0 } = {}) =>
  call(`/api/next?mode=${mode}&limit=${limit}&skip=${skip}${vibe ? '&vibe=' + vibe : ''}`);

export const sendEvents = events =>
  call('/api/event', { method: 'POST', body: JSON.stringify({ events }) });

export const getMine = ({ kind = 'save', limit = 30, skip = 0 } = {}) =>
  call(`/api/my?kind=${kind}&limit=${limit}&skip=${skip}`);

export const getProfile = () => call('/api/my?what=profile');

export const getComments = v => call(`/api/comments?v=${encodeURIComponent(v)}`);
export const addComment = (v, text, reply) =>
  call('/api/comments', { method: 'POST', body: JSON.stringify({ v, text, reply }) });
export const likeComment = id => call('/api/comments', { method: 'POST', body: JSON.stringify({ like: id }) });
export const removeComment = id => call('/api/comments', { method: 'POST', body: JSON.stringify({ remove: id }) });
export const reportComment = (id, reason) =>
  call('/api/comments', { method: 'POST', body: JSON.stringify({ report: id, reason }) });

export const getNews = ({ topic = '', limit = 30, skip = 0 } = {}) =>
  call(`/api/news?limit=${limit}&skip=${skip}${topic ? '&topic=' + topic : ''}`);

export const getNewsTopics = () => call('/api/news?what=topics');

export const follow = author =>
  call('/api/my', { method: 'POST', body: JSON.stringify({ follow: author }) });

// фон профиля: свои фото наверху страницы
export const addCover = photo => call('/api/upload', { method: 'POST', body: JSON.stringify({ photo }) });
export const delCover = url => call('/api/upload', { method: 'POST', body: JSON.stringify({ del: url }) });
export const setBio = bio => call('/api/upload', { method: 'POST', body: JSON.stringify({ bio }) });
