-- Scroll — схема базы. Выполнить один раз в Supabase → SQL Editor → Run.
-- Повторный запуск безопасен: всё создаётся только если ещё не создано.

-- ========== авторы (каналы-источники; людям показываем только @ник) ==========
create table if not exists authors (
  username   text primary key,
  title      text,
  avatar     text,
  subscribers int default 0,
  reach      int default 0,          -- медиана просмотров: нужна алгоритму
  country    text,
  cat        text,
  game       text,
  pages      int default 2,
  active     boolean default true,
  updated_at timestamptz default now()
);

-- ========== видео ==========
create table if not exists videos (
  id         text primary key,       -- "канал/номер_поста"
  author     text references authors(username) on delete cascade,
  post_id    bigint,
  caption    text,                   -- подпись уже очищена от рекламы
  tags       text[] default '{}',
  cat        text,
  game       text,
  lang       text,                   -- ru, uz, kk, ky, en
  country    text,
  duration   int,
  ratio      real,
  video_url  text,
  thumb_url  text,
  posted_at  timestamptz,
  added_at   timestamptz default now(),

  -- сигналы Telegram: только для алгоритма, на экране не показываются
  tg_views      int default 0,
  tg_reactions  int default 0,

  -- наши настоящие цифры: их видит человек
  views      int default 0,
  likes      int default 0,
  comments   int default 0,
  saves      int default 0,
  shares     int default 0,

  -- внутренняя статистика для ранжирования
  impressions int default 0,
  completions int default 0,
  skips       int default 0,
  watch_sum   real default 0,
  score       real default 0,
  dup_key     text,                  -- склейка одного ролика из разных каналов
  spread      int default 1,         -- в скольких каналах встретился
  blocked     boolean default false
);
create index if not exists videos_score_idx    on videos (score desc) where blocked = false;
create index if not exists videos_posted_idx   on videos (posted_at desc);
create index if not exists videos_cat_idx      on videos (cat);
create index if not exists videos_tags_idx     on videos using gin (tags);
create index if not exists videos_dup_idx      on videos (dup_key);
create index if not exists videos_country_idx  on videos (country);
create index if not exists videos_lang_idx     on videos (lang);

-- ========== люди ==========
create table if not exists users (
  id         bigint primary key,     -- Telegram ID
  name       text,
  photo      text,
  lang       text,
  country    text,
  tag_w      jsonb default '{}',     -- вкусы по темам
  cat_w      jsonb default '{}',     -- вкусы по категориям
  author_w   jsonb default '{}',     -- вкусы по авторам
  events     int default 0,
  created_at timestamptz default now(),
  seen_at    timestamptz default now()
);

create table if not exists seen (
  user_id  bigint,
  video_id text,
  at       timestamptz default now(),
  primary key (user_id, video_id)
);
create index if not exists seen_user_idx on seen (user_id, at desc);

-- лайки, сохранения, подписки — видно в профиле
create table if not exists actions (
  user_id  bigint,
  video_id text,
  kind     text,                     -- like | save
  at       timestamptz default now(),
  primary key (user_id, video_id, kind)
);
create index if not exists actions_user_idx on actions (user_id, kind, at desc);

create table if not exists follows (
  user_id bigint,
  author  text,
  at      timestamptz default now(),
  primary key (user_id, author)
);

-- ========== наш чат под видео: текст, голосовые, стикеры ==========
create table if not exists comments (
  id         bigserial primary key,
  video_id   text references videos(id) on delete cascade,
  room_id    text,                    -- если сообщение в комнате «смотрим вместе»
  user_id    bigint,
  user_name  text,
  user_photo text,
  kind       text default 'text',     -- text | voice | sticker (кружочки можно добавить позже)
  body       text,                    -- текст сообщения (у голосовых и кружочков пусто)
  media_url  text,                    -- адрес голосового или кружочка
  media_sec  real,                    -- длительность записи
  wave       int[],                   -- форма звука для дорожки голосового
  sticker_id text,
  likes      int default 0,
  reply_to   bigint,
  at         timestamptz default now(),
  hidden     boolean default false
);
-- если схема уже выполнялась раньше — дотягиваем недостающее, старые данные не трогаем
alter table comments add column if not exists room_id    text;
alter table comments add column if not exists kind       text default 'text';
alter table comments add column if not exists media_url  text;
alter table comments add column if not exists media_sec  real;
alter table comments add column if not exists wave       int[];
alter table comments add column if not exists sticker_id text;
alter table comments alter column body drop not null;
create index if not exists comments_video_idx on comments (video_id, at desc) where hidden = false;
create index if not exists comments_room_idx  on comments (room_id, at desc)  where hidden = false;

-- ========== стикеры ==========
-- Мини-приложение не может прочитать наборы, установленные у человека в Telegram, —
-- такого API нет ни у кого. Зато человек может принести свой набор сам: один раз
-- добавить его по ссылке, и дальше набор доступен ему (и всем) прямо в нашем чате.
-- Путь набора после проверки ИИ:
--   shared  — чисто, набор в общей панели, его видят все
--   private — лежит у того, кто принёс, и работает в комнате с друзьями;
--             в общую панель и в публичный чат под видео не попадает
--   new     — ИИ не смог посмотреть, ждёт человека
--   blocked — запрещено везде (порнография, расчленёнка, нацизм, что-либо с детьми)
-- В общую панель набор попадает только через проверку, сам туда не проваливается.
create table if not exists sticker_packs (
  name       text primary key,        -- короткое имя набора в Telegram
  title      text,
  kind       text default 'static',   -- static | animated | video
  total      int default 0,
  added_by   bigint,
  uses       int default 0,
  status     text default 'new',      -- new | private | shared | blocked
  reason     text,                    -- почему запрещён или отправлен на проверку
  adds       int default 0,           -- сколько разных людей добавили
  reports    int default 0,
  checked_by bigint,
  checked_at timestamptz,
  created_at timestamptz default now()
);
alter table sticker_packs add column if not exists status     text default 'new';
alter table sticker_packs add column if not exists reason     text;
alter table sticker_packs add column if not exists adds       int default 0;
alter table sticker_packs add column if not exists reports    int default 0;
alter table sticker_packs add column if not exists checked_by bigint;
alter table sticker_packs add column if not exists checked_at timestamptz;
alter table sticker_packs drop column if exists ready;
create index if not exists sticker_packs_status_idx on sticker_packs (status, created_at desc);

-- Запрещённые слова в названии набора. Лежат в базе, чтобы пополнять без переделки кода.
create table if not exists blocklist (
  word text primary key,
  hard boolean default true,         -- true: запретить сразу, false: отправить на проверку
  at   timestamptz default now()
);
insert into blocklist (word, hard) values
  ('18+',true),('18plus',true),('xxx',true),('porn',true),('порн',true),('nsfw',true),
  ('hentai',true),('хентай',true),('ahegao',true),('ахегао',true),('эроти',true),('erotic',true),
  ('интим',true),('bdsm',true),('бдсм',true),('onlyfans',true),('nude',true),('лолик',true),('loli',true),
  ('gore',true),('гуро',true),('guro',true),('расчлен',true),('mutilat',true),('decapit',true),
  ('суицид',true),('suicide',true),('selfharm',true),('селфхарм',true),
  ('nazi',true),('наци',true),('hitler',true),('гитлер',true),('свастик',true),('swastika',true),('heil',true),
  ('мефедрон',true),('героин',true),('кокаин',true),('cocaine',true),('наркот',true),
  ('секс',false),('sex',false),('труп',false),('кровь',false),('blood',false),('убий',false),('kill',false),
  ('18',false),('adult',false),('взросл',false)
on conflict (word) do nothing;

create table if not exists stickers (
  id       text primary key,          -- file_unique_id из Telegram
  pack     text,
  emoji    text,
  url      text,                      -- картинка уже в нашем хранилище
  file_id  text,
  kind     text default 'static',     -- static | animated | video
  w        int,
  h        int,
  pos      int default 0
);
alter table stickers add column if not exists file_id text;
alter table stickers add column if not exists w int;
alter table stickers add column if not exists h int;
create index if not exists stickers_pack_idx on stickers (pack, pos);

-- какие наборы человек добавил себе
create table if not exists user_packs (
  user_id bigint,
  pack    text,
  at      timestamptz default now(),
  primary key (user_id, pack)
);
create index if not exists user_packs_idx on user_packs (user_id, at desc);

-- жалобы: чат публичный, нужна возможность пожаловаться и скрыть
create table if not exists reports (
  id         bigserial primary key,
  comment_id bigint references comments(id) on delete cascade,
  pack       text,                    -- жалоба может быть и на набор стикеров
  user_id    bigint,
  reason     text,
  at         timestamptz default now()
);
alter table reports add column if not exists pack text;
alter table reports alter column comment_id drop not null;

create table if not exists comment_likes (
  user_id    bigint,
  comment_id bigint references comments(id) on delete cascade,
  primary key (user_id, comment_id)
);

-- ========== «Полка»: своя подборка, которой делишься одной ссылкой в Telegram ==========
create table if not exists shelves (
  id         text primary key,        -- короткий код из ссылки
  user_id    bigint,
  user_name  text,
  title      text,
  cover      text,                    -- обложка: кадр первого видео
  items      int default 0,
  opens      int default 0,           -- сколько раз открыли по ссылке
  taken      int default 0,           -- сколько раз сохранили себе
  created_at timestamptz default now()
);
create index if not exists shelves_user_idx on shelves (user_id, created_at desc);

create table if not exists shelf_items (
  shelf_id text references shelves(id) on delete cascade,
  video_id text references videos(id) on delete cascade,
  pos      int default 0,
  primary key (shelf_id, video_id)
);

-- ========== «Смотрим вместе»: одна лента на группу, реакции видно живьём ==========
create table if not exists rooms (
  id         text primary key,        -- короткий код из ссылки
  host_id    bigint,
  host_name  text,
  title      text,
  playlist   text[] default '{}',     -- общий список видео на всю комнату
  created_at timestamptz default now(),
  expires_at timestamptz default (now() + interval '12 hours')
);

create table if not exists room_members (
  room_id text references rooms(id) on delete cascade,
  user_id bigint,
  name    text,
  photo   text,
  pos     int default 0,              -- на каком видео человек сейчас
  seen_at timestamptz default now(),
  primary key (room_id, user_id)
);
create index if not exists room_members_idx on room_members (room_id, seen_at desc);

create table if not exists room_reactions (
  id       bigserial primary key,
  room_id  text references rooms(id) on delete cascade,
  video_id text,
  user_id  bigint,
  name     text,
  emoji    text,
  at       timestamptz default now()
);
create index if not exists room_reactions_idx on room_reactions (room_id, at desc);

-- ========== друзья ==========
-- Telegram не отдаёт приложениям список контактов, поэтому друзья добавляются
-- по ссылке-приглашению: ты кидаешь её в Telegram, человек открывает — и вы друзья.
-- Написать первым можно только тому, с кем вы друг друга добавили: случайный человек
-- из интернета в личку постучаться не может.
create table if not exists invites (
  code     text primary key,
  user_id  bigint,
  uses     int default 0,
  max_uses int default 0,            -- 0 — без ограничения
  at       timestamptz default now()
);

create table if not exists friends (
  user_id   bigint,
  friend_id bigint,
  status    text default 'accepted', -- accepted | pending
  at        timestamptz default now(),
  primary key (user_id, friend_id)
);
create index if not exists friends_idx on friends (user_id, at desc);

create table if not exists blocks (
  user_id bigint,
  blocked bigint,
  at      timestamptz default now(),
  primary key (user_id, blocked)
);

-- ========== чаты: один на один и группой ==========
create table if not exists chats (
  id         text primary key,       -- для лички: dm:<меньший id>-<больший id>
  kind       text default 'dm',      -- dm | group
  title      text,
  photo      text,
  created_by bigint,
  last_at    timestamptz default now(),
  created_at timestamptz default now()
);

create table if not exists chat_members (
  chat_id   text references chats(id) on delete cascade,
  user_id   bigint,
  name      text,
  photo     text,
  role      text default 'member',   -- owner | member
  last_read bigint default 0,        -- до какого сообщения дочитал: отсюда непрочитанные
  muted     boolean default false,
  joined_at timestamptz default now(),
  primary key (chat_id, user_id)
);
create index if not exists chat_members_user_idx on chat_members (user_id);

-- Сообщение в чате. Кроме текста, голосовых и стикеров умеет главное:
-- переслать другу сам ролик и целую полку — они открываются прямо в чате.
create table if not exists messages (
  id         bigserial primary key,
  chat_id    text references chats(id) on delete cascade,
  user_id    bigint,
  user_name  text,
  user_photo text,
  kind       text default 'text',    -- text | voice | sticker | video | shelf
  body       text,
  media_url  text,
  media_sec  real,
  wave       int[],
  sticker_id text,
  video_id   text references videos(id) on delete set null,
  shelf_id   text references shelves(id) on delete set null,
  reply_to   bigint,
  at         timestamptz default now(),
  hidden     boolean default false
);
create index if not exists messages_chat_idx on messages (chat_id, id desc) where hidden = false;

-- Где можно отправить стикер. Проверка стоит в самой базе, а не только в коде:
-- даже если я ошибусь в приложении, набор «только себе» не уедет в публичный чат.
create or replace function check_sticker() returns trigger language plpgsql as $$
declare st text;
begin
  if new.kind = 'sticker' and new.sticker_id is not null then
    select p.status into st from stickers s left join sticker_packs p on p.name = s.pack where s.id = new.sticker_id;
    if st is null then
      raise exception 'стикер не найден или набор не проверен';
    elsif st = 'blocked' then
      raise exception 'набор запрещён';
    elsif st <> 'shared' and new.room_id is null then
      raise exception 'этот набор работает только в комнате с друзьями';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists comments_sticker_guard on comments;
create trigger comments_sticker_guard before insert on comments
  for each row execute function check_sticker();

-- В чате с друзьями наборы «только себе» разрешены — запрещены лишь те, что нельзя нигде.
create or replace function check_sticker_msg() returns trigger language plpgsql as $$
declare st text;
begin
  if new.kind = 'sticker' and new.sticker_id is not null then
    select p.status into st from stickers s left join sticker_packs p on p.name = s.pack where s.id = new.sticker_id;
    if st is null then raise exception 'стикер не найден или набор не проверен';
    elsif st = 'blocked' then raise exception 'набор запрещён'; end if;
  end if;
  return new;
end $$;
drop trigger if exists messages_sticker_guard on messages;
create trigger messages_sticker_guard before insert on messages
  for each row execute function check_sticker_msg();

-- ========== уведомления ==========
-- Бот пишет человеку в Telegram: «Азат отправил тебе видео». Складываем сюда,
-- отправляем отдельно — если Telegram не ответил, попробуем ещё раз, а не потеряем.
alter table users add column if not exists notify    boolean default true;
alter table users add column if not exists can_write boolean default false;  -- разрешил писать себе

create table if not exists outbox (
  id      bigserial primary key,
  user_id bigint,
  body    text,
  button  text,                      -- подпись кнопки
  param   text,                      -- куда ведёт кнопка внутри приложения
  tries   int default 0,
  sent_at timestamptz,
  error   text,
  at      timestamptz default now()
);
create index if not exists outbox_pending_idx on outbox (at) where sent_at is null;

-- ========== самопополнение каналов ==========
-- Сборщик видит, откуда сделан репост, и складывает такие каналы сюда.
-- Раз в сутки проверяем: живой ли, есть ли короткие видео, не реклама ли — и подключаем.
create table if not exists candidates (
  username    text primary key,
  seen        int default 1,         -- сколько раз встретился в репостах
  from_author text,
  videos      int,
  subscribers int,
  last_post   timestamptz,
  status      text default 'new',    -- new | added | rejected
  reason      text,
  checked_at  timestamptz,
  at          timestamptz default now()
);
create index if not exists candidates_status_idx on candidates (status, seen desc);
alter table authors add column if not exists auto     boolean default false;
alter table authors add column if not exists added_at timestamptz default now();

-- ========== цифры для отчёта ==========
create table if not exists user_days (
  user_id   bigint,
  day       date,
  watch_sec int default 0,
  videos    int default 0,
  primary key (user_id, day)
);
create index if not exists user_days_day_idx on user_days (day);

create table if not exists daily (
  day            date primary key,
  users          int default 0,
  new_users      int default 0,
  videos_watched int default 0,
  watch_sec      bigint default 0,
  likes          int default 0,
  comments       int default 0,
  messages       int default 0,
  shelves        int default 0,
  rooms          int default 0,
  retention_1d   real,               -- доля вчерашних, кто вернулся сегодня
  at             timestamptz default now()
);

create or replace function roll_daily(d date default (current_date - 1)) returns void language sql as $$
  insert into daily (day, users, new_users, videos_watched, watch_sec, likes, comments, messages, shelves, rooms, retention_1d)
  select d,
    (select count(*) from user_days where day = d),
    (select count(*) from users where created_at::date = d),
    (select coalesce(sum(videos), 0) from user_days where day = d),
    (select coalesce(sum(watch_sec), 0) from user_days where day = d),
    (select count(*) from actions  where kind = 'like' and at::date = d),
    (select count(*) from comments where at::date = d),
    (select count(*) from messages where at::date = d),
    (select count(*) from shelves  where created_at::date = d),
    (select count(*) from rooms    where created_at::date = d),
    (select case when count(*) = 0 then null
            else count(*) filter (where exists (select 1 from user_days n where n.user_id = p.user_id and n.day = d))::real / count(*) end
     from user_days p where p.day = d - 1)
  on conflict (day) do update set
    users = excluded.users, new_users = excluded.new_users, videos_watched = excluded.videos_watched,
    watch_sec = excluded.watch_sec, likes = excluded.likes, comments = excluded.comments,
    messages = excluded.messages, shelves = excluded.shelves, rooms = excluded.rooms,
    retention_1d = excluded.retention_1d;
$$;

-- ========== защита от спама ==========
create table if not exists rate (
  user_id bigint,
  kind    text,
  at      timestamptz default now()
);
create index if not exists rate_idx on rate (user_id, kind, at desc);

-- true — лимит исчерпан, действие запрещаем
create or replace function hit_limit(p_user bigint, p_kind text, p_max int, p_seconds int)
returns boolean language plpgsql as $$
declare n int;
begin
  select count(*) into n from rate
    where user_id = p_user and kind = p_kind and at > now() - make_interval(secs => p_seconds);
  if n >= p_max then return true; end if;
  insert into rate (user_id, kind) values (p_user, p_kind);
  return false;
end $$;

-- ========== удаление аккаунта ==========
-- Сообщения не стираем в ноль, а обезличиваем: иначе в чужих чатах останутся дыры.
create or replace function delete_user(p_user bigint) returns void language sql as $$
  delete from rate          where user_id = p_user;
  delete from outbox        where user_id = p_user;
  delete from seen          where user_id = p_user;
  delete from actions       where user_id = p_user;
  delete from follows       where user_id = p_user;
  delete from friends       where user_id = p_user or friend_id = p_user;
  delete from blocks        where user_id = p_user or blocked   = p_user;
  delete from invites       where user_id = p_user;
  delete from comment_likes where user_id = p_user;
  delete from room_reactions where user_id = p_user;
  delete from room_members  where user_id = p_user;
  delete from chat_members  where user_id = p_user;
  delete from user_packs    where user_id = p_user;
  delete from user_days     where user_id = p_user;
  delete from shelf_items   where shelf_id in (select id from shelves where user_id = p_user);
  delete from shelves       where user_id = p_user;
  update comments set hidden = true, body = null, media_url = null, user_name = 'удалён', user_photo = null where user_id = p_user;
  update messages set hidden = true, body = null, media_url = null, user_name = 'удалён', user_photo = null where user_id = p_user;
  delete from users where id = p_user;
$$;

-- ========== счётчики: меняем только через эти функции, чтобы не терять параллельные события ==========
create or replace function bump_video(
  p_id text, p_views int default 0, p_impr int default 0, p_compl int default 0,
  p_skip int default 0, p_watch real default 0,
  p_like int default 0, p_save int default 0, p_share int default 0, p_comment int default 0
) returns void language sql as $$
  update videos set
    views       = greatest(0, views + p_views),
    impressions = greatest(0, impressions + p_impr),
    completions = greatest(0, completions + p_compl),
    skips       = greatest(0, skips + p_skip),
    watch_sum   = greatest(0, watch_sum + p_watch),
    likes       = greatest(0, likes + p_like),
    saves       = greatest(0, saves + p_save),
    shares      = greatest(0, shares + p_share),
    comments    = greatest(0, comments + p_comment)
  where id = p_id;
$$;

-- Пересчёт рейтинга: качество по НАШИМ зрителям + подстраховка просмотрами Telegram,
-- пока своих данных мало. Сглаживание по Байесу, чтобы одно случайное видео не улетало вверх.
create or replace function refresh_scores() returns void language sql as $$
  update videos set score =
    (
        0.50 * ((completions + 10 * 0.35) / (impressions + 10.0))
      + 0.20 * ((likes       + 10 * 0.04) / (impressions + 10.0)) * 6
      + 0.10 * ((saves       + 10 * 0.01) / (impressions + 10.0)) * 14
      + 0.20 * least(1.0, ln(greatest(tg_views, 10)::numeric) / ln(1000000::numeric))
    )
    * exp(- extract(epoch from (now() - coalesce(posted_at, now()))) / 3600.0 / 240.0)
    * (1 + 0.04 * least(spread - 1, 5))
  where blocked = false;
$$;

-- Уборка: база бесплатная, держим её лёгкой
create or replace function cleanup() returns void language sql as $$
  delete from seen           where at < now() - interval '30 days';
  delete from comments       where room_id is not null and at < now() - interval '3 days';
  delete from rooms          where expires_at < now();
  delete from room_reactions where at < now() - interval '2 days';
  delete from shelves        where items = 0 and created_at < now() - interval '2 days';
  delete from rate           where at < now() - interval '1 day';
  delete from outbox         where sent_at is not null and sent_at < now() - interval '7 days';
  delete from candidates     where status = 'rejected' and checked_at < now() - interval '30 days';
  delete from videos where blocked = false
    and posted_at < now() - interval '45 days'
    and impressions < 20 and likes = 0
    and id not in (select video_id from shelf_items)
    and id not in (select video_id from actions)
    and id not in (select video_id from messages where video_id is not null);
$$;

-- ========== доступ: в базу ходит только наш сервер ==========
alter table authors       enable row level security;
alter table videos        enable row level security;
alter table users         enable row level security;
alter table seen          enable row level security;
alter table actions       enable row level security;
alter table follows       enable row level security;
alter table comments      enable row level security;
alter table comment_likes enable row level security;
alter table shelves        enable row level security;
alter table shelf_items    enable row level security;
alter table rooms          enable row level security;
alter table room_members   enable row level security;
alter table room_reactions enable row level security;
alter table stickers       enable row level security;
alter table sticker_packs  enable row level security;
alter table user_packs     enable row level security;
alter table blocklist      enable row level security;
alter table invites        enable row level security;
alter table friends        enable row level security;
alter table blocks         enable row level security;
alter table chats          enable row level security;
alter table chat_members   enable row level security;
alter table messages       enable row level security;
alter table outbox         enable row level security;
alter table candidates     enable row level security;
alter table user_days      enable row level security;
alter table daily          enable row level security;
alter table rate           enable row level security;
alter table reports        enable row level security;
