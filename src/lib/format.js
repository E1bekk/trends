export const fmt = n => {
  n = +n || 0;
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace('.0', '') + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace('.0', '') + 'K';
  return String(n);
};
export const dur = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
export function ago(iso) {
  const m = Math.max(1, Math.round((Date.now() - new Date(iso)) / 60000));
  if (m < 60) return m + ' мин';
  const h = Math.round(m / 60); if (h < 24) return h + ' ч';
  const d = Math.round(h / 24); return d + ' дн';
}
// категории: название, эмодзи, цвет
export const CATS = {
  animals: ['Животные', '🐾', '#ff9ed2'],
  humor: ['Юмор', '😂', '#ffb13d'], wow: ['Вау', '🤯', '#3df0ff'], nature: ['Природа', '🌿', '#3ddc84'],
  sport: ['Спорт', '⚽', '#4d8bff'], games: ['Игры', '🎮', '#a46bff'], style: ['Стиль', '👗', '#ff5fb4'],
  news: ['Новости', '📰', '#ff6a3d'], auto: ['Авто', '🏎️', '#ff3d5a'], music: ['Музыка', '🎵', '#ff3d81'], food: ['Еда', '🍜', '#ffcf3d']
};
export const catName = c => (CATS[c] || ['Видео'])[0];
export const catEmoji = c => (CATS[c] || ['', '✨'])[1];
export const catColor = c => (CATS[c] || ['', '', '#8b5cff'])[2];
export const COUNTRIES = { kg: '🇰🇬', kz: '🇰🇿', uz: '🇺🇿', tj: '🇹🇯', ru: '🇷🇺', world: '🌍' };

// Человеческие названия тем, которые сборщик проставляет роликам
export const TAGS = {
  koty: ['Коты', '🐱'], sobaki: ['Собаки', '🐶'], zhivotnye: ['Животные', '🐾'], fail: ['Фейлы', '🙃'],
  mem: ['Мемы', '😂'], tanec: ['Танцы', '💃'], muzyka: ['Музыка', '🎵'], futbol: ['Футбол', '⚽'],
  mma: ['Бои', '🥊'], sport_other: ['Спорт', '🏅'], igry: ['Игры', '🎮'], cs: ['CS2', '🔫'],
  dota: ['Dota 2', '🗡️'], pubg: ['PUBG', '🪖'], mlbb: ['Mobile Legends', '⚔️'], fortnite: ['Fortnite', '🛠️'],
  roblox: ['Roblox', '🧱'], brawl: ['Brawl Stars', '💥'], valorant: ['Valorant', '🎯'],
  avto: ['Авто', '🏎️'], eda: ['Еда', '🍜'], lajfhak: ['Лайфхаки', '💡'], deti: ['Дети', '🧒'],
  priroda: ['Природа', '🌿'], zalip: ['Залипательное', '🌀'], strakh: ['Страшное', '👻'],
  milo: ['Милое', '🥰'], tryuk: ['Трюки', '🛹'], rozygrysh: ['Розыгрыши', '🎭'],
  stendap: ['Стендап', '🎤'], tehnika: ['Техника', '🤖']
};
export const tagLabel = t => TAGS[t] || (CATS[t] ? [CATS[t][0], CATS[t][1]] : [t, '✨']);
