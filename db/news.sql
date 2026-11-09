-- ========================================================================
-- Новости. Выполнить в Supabase → SQL Editor → Run. Повторный запуск безопасен.
-- ========================================================================
create table if not exists news (
  id        text primary key,        -- "канал/номер_поста"
  author    text references authors(username) on delete cascade,
  post_id   bigint,
  title     text,                    -- первая строка поста
  body      text,
  photo     text,
  topic     text,                    -- что за новость: политика, спорт, происшествия...
  country   text,
  lang      text,
  tg_views  int default 0,
  posted_at timestamptz,
  added_at  timestamptz default now(),
  blocked   boolean default false
);
create index if not exists news_time_idx  on news (posted_at desc) where blocked = false;
create index if not exists news_topic_idx on news (topic, posted_at desc);
create index if not exists news_country_idx on news (country, posted_at desc);
alter table news enable row level security;

-- Лента новостей: свежие сверху, можно отфильтровать по теме или стране
create or replace function news_feed(
  p_topic text default null, p_country text default null,
  p_limit int default 30, p_skip int default 0
) returns table (
  id text, author text, author_title text, avatar text,
  title text, body text, photo text, topic text, country text,
  tg_views int, posted_at timestamptz
) language sql stable as $$
  select n.id, n.author, a.title, a.avatar,
         n.title, n.body, n.photo, n.topic, n.country, n.tg_views, n.posted_at
  from news n join authors a on a.username = n.author
  where n.blocked = false
    and (p_topic is null or n.topic = p_topic)
    and (p_country is null or n.country = p_country)
    and n.posted_at > now() - interval '7 days'
  order by n.posted_at desc
  offset p_skip limit p_limit;
$$;

-- Сколько новостей по каждой теме за последние сутки — для кнопок наверху
create or replace function news_topics() returns table (topic text, n bigint)
language sql stable as $$
  select topic, count(*) from news
  where blocked = false and posted_at > now() - interval '2 days' and topic is not null
  group by topic order by count(*) desc;
$$;

-- Новости живут неделю, дальше не нужны
create or replace function cleanup_news() returns void language sql as $$
  delete from news where posted_at < now() - interval '14 days';
$$;
