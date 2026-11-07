// Каналы-источники. Любые популярные публичные каналы с видео — из любой страны.
// cat — категория, country — откуда канал, game — какая игра (для игровых каналов),
// pages — сколько страниц истории брать (по умолчанию 2; у кого видео редко — больше).
// Новости живут только в разделе «Новости» и в ленте не показываются.
// Список легко пополнять: просто добавь строку.
const h = (username, country) => ({ username, country, cat: 'humor' });
const w = (username, country) => ({ username, country, cat: 'wow' });
const a = (username, country) => ({ username, country, cat: 'animals' });
const g = (username, country, game, pages = 2) => ({ username, country, cat: 'games', game, pages });
const s = (username, country, pages = 2) => ({ username, country, cat: 'sport', pages });
const n = (username, country) => ({ username, country, cat: 'news', pages: 1 });

module.exports = [
  // 😂 приколы и мемы
  h('prikoly', 'ru'), h('yaplakal', 'ru'), h('bestvideo', 'ru'), h('memes', 'ru'), h('prikol', 'ru'), h('pikabu', 'ru'),
  h('lifeyt', 'ru'), h('Ugarnye_video_prikoly', 'ru'), h('prikoly_humor_memy', 'ru'), h('gusgagarik', 'ru'),
  h('xaxaski_tg', 'ru'), h('Yumor_humor', 'ru'), h('humor_video_prikoly', 'ru'), h('fishechki', 'ru'),
  h('Mdk_pr', 'ru'), h('memachh', 'ru'), h('kvnofficial', 'ru'), h('itmemes', 'world'),
  h('funny1', 'world'), h('funnyvideos', 'world'), h('comedy', 'world'), h('notmemes', 'world'),
  h('prikollar', 'uz'), h('prikol_uz', 'uz'), h('kulgili', 'uz'),
  // 🤯 вау и вирусное
  w('viral', 'world'), w('asmr', 'world'), w('interesting', 'world'), w('oddlysatisfying', 'world'),
  w('trends', 'ru'), w('qiziq', 'uz'), w('qiziqarli', 'uz'),
  // 🎮 игры
  g('official_pubgmobilecis', 'ru', 'PUBG Mobile', 3), g('dreampubg', 'ru', 'PUBG Mobile'), g('DemNPUBG', 'ru', 'PUBG Mobile'),
  g('counter_strike2', 'ru', 'CS2', 3), g('newcsgo', 'ru', 'CS2', 3), g('raiznews', 'ru', 'CS2'), g('AuroraTeam', 'ru', 'CS2'), g('TSpiritCS', 'ru', 'CS2'),
  g('mlbbcis', 'ru', 'Mobile Legends', 5), g('mlbbesports', 'ru', 'Mobile Legends', 5), g('mobile_legends_uz', 'uz', 'Mobile Legends', 4),
  g('theeverydayyt', 'ru', 'Fortnite', 4), g('zonafortnite', 'ru', 'Fortnite', 4), g('fortnite1', 'ru', 'Fortnite', 4),
  g('roblox1', 'ru', 'Roblox', 4), g('robloxers', 'ru', 'Roblox', 3),
  g('VALORANT_University', 'ru', 'Valorant'), g('Valorant_KH', 'ru', 'Valorant'), g('ValorantGame_Official', 'ru', 'Valorant'),
  g('BrawlStarsLives', 'ru', 'Brawl Stars', 4), g('brawls_land', 'ru', 'Brawl Stars', 4), g('brawlstars', 'world', 'Brawl Stars'),
  g('dota2', 'world', 'Dota 2', 1), g('dota_memy2', 'ru', 'Dota 2', 1), g('CyberDOTO', 'ru', 'Dota 2', 1),
  g('pekagame', 'ru', 'Игры'), g('dtfbest', 'ru', 'Игры'), g('world_playstation', 'ru', 'PlayStation'), g('escapefromtarkovRU', 'ru', 'Tarkov'),
  // ⚽ спорт: нарезки, голы, бои
  s('footballclips', 'world'), s('GOAL24Main', 'ru'), s('matchpremier', 'ru'), s('twodrotsshow', 'ru'), s('Match_TV', 'ru'),
  s('sportsru', 'ru'), s('championat', 'ru'), s('okkosport', 'ru'), s('espn', 'world'),
  s('hardcore_fightingtg', 'ru'), s('POP_MMA_NOVOSTY', 'ru'), s('MainCardMMA', 'ru'), s('ufceurasia', 'ru'),
  s('hardcoremma', 'ru'), s('puncher_sports', 'ru'), s('kyrgyz_mma', 'kg'),
  // 🐾 животные, 🌿 природа
  a('cutecats', 'world'), a('funnyanimals', 'world'), a('kotya', 'ru'), a('kot_koshki_cat', 'ru'), a('koshkii_kotiki', 'ru'),
  a('cat2cats', 'ru'), a('catism', 'ru'), a('meow_meow_cute', 'ru'), a('sobaki_pesik_sobaka', 'ru'), a('PesikTG_Sobaka', 'ru'), a('animal_planeta', 'ru'),
  { username: 'nature', country: 'world', cat: 'nature' }, { username: 'priroda_animal', country: 'ru', cat: 'nature' },
  { username: 'NationGeographic', country: 'ru', cat: 'nature' },
  // 🏎️ авто
  { username: 'Garage54official', country: 'ru', cat: 'auto' }, { username: 'forsazh_youtube', country: 'ru', cat: 'auto' },
  { username: 'Eric_Davidich_D3', country: 'ru', cat: 'auto' }, { username: 'tachki', country: 'ru', cat: 'auto', pages: 3 },
  // 🍜 еда
  { username: 'prostoy_retsept', country: 'ru', cat: 'food' }, { username: 'Fastrecepts', country: 'ru', cat: 'food' },
  { username: 'realmenkitchen', country: 'ru', cat: 'food' }, { username: 'chefvibe1', country: 'ru', cat: 'food' },
  // 👗 стиль
  { username: 'fashion', country: 'world', cat: 'style' },
  // 📰 новости: СНГ и мир (только раздел «Новости»)
  n('akipress', 'kg'), n('news24kg', 'kg'), n('kloopnews', 'kg'), n('sputnik_kyrgyzstan', 'kg'),
  n('kunuz', 'uz'), n('uzbekistan24', 'uz'), n('tengrinews', 'kz'), n('zakonkz', 'kz'), n('informburo_kz', 'kz'),
  n('asiaplustj', 'tj'), n('ostorozhno_novosti', 'ru'), n('mash', 'ru')
];
