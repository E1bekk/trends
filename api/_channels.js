// Каналы-источники. Любые популярные публичные каналы с видео — из любой страны.
// cat — категория (для каталога, фильтров и рекомендаций), country — откуда канал.
// Список легко пополнять: просто добавь строку. В рабочей версии будет в базе
// + автопоиск новых каналов по репостам.
module.exports = [
  // 😂 юмор и вирусное
  { username: 'prikoly', country: 'ru', cat: 'humor' },
  { username: 'yaplakal', country: 'ru', cat: 'humor' },
  { username: 'funnyvideos', country: 'world', cat: 'humor' },
  { username: 'prikol', country: 'ru', cat: 'humor' },
  { username: 'memes', country: 'ru', cat: 'humor' },
  { username: 'pikabu', country: 'ru', cat: 'humor' },
  { username: 'viral', country: 'world', cat: 'wow' },
  { username: 'oddlysatisfying', country: 'world', cat: 'wow' },
  // 🌿 природа, 🎮 игры, 👗 мода
  { username: 'nature', country: 'world', cat: 'nature' },
  { username: 'dota2', country: 'world', cat: 'games' },
  { username: 'fashion', country: 'world', cat: 'style' },
  // ⚽ спорт
  { username: 'sportsru', country: 'ru', cat: 'sport' },
  { username: 'championat', country: 'ru', cat: 'sport' },
  { username: 'espn', country: 'world', cat: 'sport' },
  { username: 'puncher_sports', country: 'ru', cat: 'sport' },
  { username: 'kyrgyz_mma', country: 'kg', cat: 'sport' },
  // 📰 новости: СНГ и мир
  { username: 'sputnik_kyrgyzstan', country: 'kg', cat: 'news' },
  { username: 'akipress', country: 'kg', cat: 'news' },
  { username: 'news24kg', country: 'kg', cat: 'news' },
  { username: 'kloopnews', country: 'kg', cat: 'news' },
  { username: 'uzbekistan24', country: 'uz', cat: 'news' },
  { username: 'kunuz', country: 'uz', cat: 'news' },
  { username: 'sputnikkz', country: 'kz', cat: 'news' },
  { username: 'tengrinews', country: 'kz', cat: 'news' },
  { username: 'zakonkz', country: 'kz', cat: 'news' },
  { username: 'informburo_kz', country: 'kz', cat: 'news' },
  { username: 'asiaplustj', country: 'tj', cat: 'news' },
  { username: 'ostorozhno_novosti', country: 'ru', cat: 'news' },
  { username: 'mash', country: 'ru', cat: 'news' }
];
