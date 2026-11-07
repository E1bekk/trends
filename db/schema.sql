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

-- ========== наш чат под видео: текст, голосовые, кружочки, стикеры ==========
create table if not exists comments (
  id         bigserial primary key,
  video_id   text references videos(id) on delete cascade,
  room_id    text,                    -- если сообщение в комнате «смотрим вместе»
  user_id    bigint,
  user_name  text,
  user_photo text,
  kind       text default 'text',     -- text | voice | circle | sticker
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

-- стикеры: забираем пару открытых наборов из Telegram и раздаём со своего хранилища
create table if not exists stickers (
  id       text primary key,
  pack     text,
  emoji    text,
  url      text,
  kind     text default 'static',     -- static | video
  pos      int default 0
);
create index if not exists stickers_pack_idx on stickers (pack, pos);

-- жалобы: чат публичный, нужна возможность пожаловаться и скрыть
create table if not exists reports (
  id         bigserial primary key,
  comment_id bigint references comments(id) on delete cascade,
  user_id    bigint,
  reason     text,
  at         timestamptz default now()
);

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
  delete from videos where blocked = false
    and posted_at < now() - interval '45 days'
    and impressions < 20 and likes = 0
    and id not in (select video_id from shelf_items)
    and id not in (select video_id from actions);
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
alter table reports        enable row level security;
