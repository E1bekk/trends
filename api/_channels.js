// Каналы-источники. Любые популярные публичные каналы с видео — из любой страны.
// cat — категория (для каталога, фильтров и рекомендаций), country — откуда канал.
// Главное в приложении — развлечения: приколы, мемы, нарезки, спорт, игры, животные.
// Новости живут только в разделе «Новости» и в лентe не показываются.
// Список легко пополнять: просто добавь строку.
module.exports = [
  // 😂 приколы и мемы
  { username: 'prikoly', country: 'ru', cat: 'humor' },
  { username: 'yaplakal', country: 'ru', cat: 'humor' },
  { username: 'bestvideo', country: 'ru', cat: 'humor' },
  { username: 'memes', country: 'ru', cat: 'humor' },
  { username: 'prikol', country: 'ru', cat: 'humor' },
  { username: 'pikabu', country: 'ru', cat: 'humor' },
  { username: 'funny1', country: 'world', cat: 'humor' },
  { username: 'funnyvideos', country: 'world', cat: 'humor' },
  { username: 'comedy', country: 'world', cat: 'humor' },
  { username: 'notmemes', country: 'world', cat: 'humor' },
  { username: 'prikollar', country: 'uz', cat: 'humor' },
  { username: 'prikol_uz', country: 'uz', cat: 'humor' },
  { username: 'kulgili', country: 'uz', cat: 'humor' },
  // 🤯 вау и вирусное
  { username: 'viral', country: 'world', cat: 'wow' },
  { username: 'asmr', country: 'world', cat: 'wow' },
  { username: 'interesting', country: 'world', cat: 'wow' },
  { username: 'oddlysatisfying', country: 'world', cat: 'wow' },
  { username: 'trends', country: 'ru', cat: 'wow' },
  { username: 'qiziq', country: 'uz', cat: 'wow' },
  { username: 'qiziqarli', country: 'uz', cat: 'wow' },
  // 🐾 животные, 🌿 природа
  { username: 'cutecats', country: 'world', cat: 'animals' },
  { username: 'funnyanimals', country: 'world', cat: 'animals' },
  { username: 'nature', country: 'world', cat: 'nature' },
  // 🎮 игры
  { username: 'dota2', country: 'world', cat: 'games' },
  { username: 'brawlstars', country: 'world', cat: 'games' },
  // ⚽ спорт: нарезки, голы, бои
  { username: 'footballclips', country: 'world', cat: 'sport' },
  { username: 'sportsru', country: 'ru', cat: 'sport' },
  { username: 'championat', country: 'ru', cat: 'sport' },
  { username: 'okkosport', country: 'ru', cat: 'sport' },
  { username: 'espn', country: 'world', cat: 'sport' },
  { username: 'puncher_sports', country: 'ru', cat: 'sport' },
  { username: 'hardcoremma', country: 'ru', cat: 'sport' },
  { username: 'kyrgyz_mma', country: 'kg', cat: 'sport' },
  // 🏎️ авто, 👗 стиль
  { username: 'tachki', country: 'ru', cat: 'auto' },
  { username: 'fashion', country: 'world', cat: 'style' },
  // 📰 новости: СНГ и мир (только раздел «Новости»)
  { username: 'akipress', country: 'kg', cat: 'news' },
  { username: 'news24kg', country: 'kg', cat: 'news' },
  { username: 'kloopnews', country: 'kg', cat: 'news' },
  { username: 'sputnik_kyrgyzstan', country: 'kg', cat: 'news' },
  { username: 'kunuz', country: 'uz', cat: 'news' },
  { username: 'uzbekistan24', country: 'uz', cat: 'news' },
  { username: 'tengrinews', country: 'kz', cat: 'news' },
  { username: 'zakonkz', country: 'kz', cat: 'news' },
  { username: 'informburo_kz', country: 'kz', cat: 'news' },
  { username: 'asiaplustj', country: 'tj', cat: 'news' },
  { username: 'ostorozhno_novosti', country: 'ru', cat: 'news' },
  { username: 'mash', country: 'ru', cat: 'news' }
];
