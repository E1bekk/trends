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

export const setNotify = (write, notify) =>
  call('/api/my', { method: 'POST', body: JSON.stringify({ write, notify }) });

export const follow = author =>
  call('/api/my', { method: 'POST', body: JSON.stringify({ follow: author }) });

// фон профиля: свои фото наверху страницы
export const addCover = photo => call('/api/upload', { method: 'POST', body: JSON.stringify({ photo }) });
export const delCover = url => call('/api/upload', { method: 'POST', body: JSON.stringify({ del: url }) });
export const setBio = bio => call('/api/my', { method: 'POST', body: JSON.stringify({ bio }) });
export const deleteMe = () => call('/api/my', { method: 'POST', body: JSON.stringify({ delete_me: true }) });

// друзья и чаты
export const getChats = () => call('/api/chat');
export const getFriends = () => call('/api/chat?what=friends');
export const getInvite = () => call('/api/chat?what=invite');
export const openChat = (chat, skip = 0) => call(`/api/chat?what=open&chat=${encodeURIComponent(chat)}&skip=${skip}`);
export const sendMsg = b => call('/api/chat', { method: 'POST', body: JSON.stringify(b) });
export const acceptInvite = code => call('/api/chat', { method: 'POST', body: JSON.stringify({ accept: code }) });
export const chatWith = friend => call('/api/chat', { method: 'POST', body: JSON.stringify({ friend }) });
export const getVideo = id => call(`/api/chat?what=video&id=${encodeURIComponent(id)}`);
export const makeGroup = (group, members) => call('/api/chat', { method: 'POST', body: JSON.stringify({ group, members }) });

// стикеры
export const getPacks = () => call('/api/stickers');
export const getSharedPacks = q => call('/api/stickers?what=shared' + (q ? '&q=' + encodeURIComponent(q) : ''));
export const addPack = add => call('/api/stickers', { method: 'POST', body: JSON.stringify({ add }) });
export const sharePack = share => call('/api/stickers', { method: 'POST', body: JSON.stringify({ share }) });
export const takePack = take => call('/api/stickers', { method: 'POST', body: JSON.stringify({ take }) });
export const dropPack = drop => call('/api/stickers', { method: 'POST', body: JSON.stringify({ drop }) });
export const reportPack = report => call('/api/stickers', { method: 'POST', body: JSON.stringify({ report }) });

// полки
export const getShelves = () => call('/api/shelves');
export const getShelf = (id, skip = 0) => call(`/api/shelves?id=${encodeURIComponent(id)}&skip=${skip}`);
export const makeShelf = (make, video) => call('/api/shelves', { method: 'POST', body: JSON.stringify({ make, video }) });
export const putOnShelf = (put, video) => call('/api/shelves', { method: 'POST', body: JSON.stringify({ put, video }) });
export const pullFromShelf = (pull, video) => call('/api/shelves', { method: 'POST', body: JSON.stringify({ pull, video }) });
export const renameShelf = (rename, title) => call('/api/shelves', { method: 'POST', body: JSON.stringify({ rename, title }) });
export const dropShelf = remove => call('/api/shelves', { method: 'POST', body: JSON.stringify({ remove }) });
export const takeShelf = take => call('/api/shelves', { method: 'POST', body: JSON.stringify({ take }) });

// комнаты — смотрим вместе
export const makeRoom = (make, { shelf, videos } = {}) =>
  call('/api/rooms', { method: 'POST', body: JSON.stringify({ make, shelf, videos }) });
export const joinRoom = join => call('/api/rooms', { method: 'POST', body: JSON.stringify({ join }) });
export const leaveRoom = leave => call('/api/rooms', { method: 'POST', body: JSON.stringify({ leave }) });
export const moveRoom = (move, pos) => call('/api/rooms', { method: 'POST', body: JSON.stringify({ move, pos }) });
export const reactRoom = (react, video, emoji) => call('/api/rooms', { method: 'POST', body: JSON.stringify({ react, video, emoji }) });
export const getRoomVideos = id => call(`/api/rooms?what=videos&id=${encodeURIComponent(id)}`);
export const getRoomState = (id, since = 0) => call(`/api/rooms?id=${encodeURIComponent(id)}&since=${since}`);

// админка
export const getStats = (days = 30) => call(`/api/admin?days=${days}`);
export const getReports = () => call('/api/admin?what=reports');
export const getAdminPacks = status => call('/api/admin?what=packs' + (status ? '&status=' + status : ''));
export const findVideos = q => call('/api/admin?what=videos&q=' + encodeURIComponent(q));
export const getCands = status => call('/api/admin?what=cands&status=' + (status || 'new'));
export const modCand = (cand, status, extra = {}) => call('/api/admin', { method: 'POST', body: JSON.stringify({ cand, status, ...extra }) });
export const modPack = (pack, status, reason) => call('/api/admin', { method: 'POST', body: JSON.stringify({ pack, status, reason }) });
export const modComment = (comment, hide) => call('/api/admin', { method: 'POST', body: JSON.stringify({ comment, hide }) });
export const modVideo = (video, block) => call('/api/admin', { method: 'POST', body: JSON.stringify({ video, block }) });
export const modAuthor = (author, block) => call('/api/admin', { method: 'POST', body: JSON.stringify({ author, block }) });
