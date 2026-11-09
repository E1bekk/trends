-- Цифры для начальника: сколько людей, сколько смотрят, что растёт.
-- Файл можно выполнять сколько угодно раз.

drop function if exists stats_days(int);
drop function if exists stats_now();
drop function if exists stats_top(int);
drop function if exists roll_days(int);

-- пересчитать последние N дней (включая сегодня)
create or replace function roll_days(p_days int default 3) returns void language plpgsql as $$
declare i int;
begin
  for i in 0 .. greatest(0, least(90, p_days) - 1) loop
    perform roll_daily((current_date - i)::date);
  end loop;
end $$;

-- таблица по дням
create or replace function stats_days(p_days int default 30)
returns table (day date, users int, new_users int, videos_watched int, watch_sec bigint,
               likes int, comments int, messages int, shelves int, rooms int, retention_1d real)
language sql stable as $$
  select day, users, new_users, videos_watched, watch_sec, likes, comments, messages, shelves, rooms, retention_1d
  from daily
  where day > current_date - greatest(1, least(365, p_days))
  order by day desc;
$$;

-- живые числа прямо сейчас
create or replace function stats_now() returns jsonb language sql stable as $$
  select jsonb_build_object(
    'users_total',   (select count(*) from users),
    'users_today',   (select count(*) from user_days where day = current_date),
    'users_online',  (select count(*) from users where seen_at > now() - interval '5 minutes'),
    'new_today',     (select count(*) from users where created_at::date = current_date),
    'watch_today',   (select coalesce(sum(watch_sec), 0) from user_days where day = current_date),
    'videos_total',  (select count(*) from videos where blocked = false),
    'videos_fresh',  (select count(*) from videos where posted_at > now() - interval '24 hours'),
    'authors',       (select count(*) from authors),
    'likes_today',   (select count(*) from actions where kind = 'like' and at::date = current_date),
    'comments_today',(select count(*) from comments where at::date = current_date),
    'messages_today',(select count(*) from messages where at::date = current_date),
    'friends',       (select count(*) / 2 from friends),
    'shelves',       (select count(*) from shelves),
    'rooms_live',    (select count(*) from rooms where expires_at > now()),
    'packs',         (select count(*) from sticker_packs where status = 'shared'),
    'reports_open',  (select count(*) from reports where at > now() - interval '7 days'),
    'queue',         (select count(*) from outbox where sent_at is null and tries < 3)
  );
$$;

-- что заходит: лучшие ролики и каналы за неделю
create or replace function stats_top(p_limit int default 10)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'videos', coalesce((select jsonb_agg(x) from (
        select v.id, v.author, left(coalesce(v.caption, ''), 60) as caption,
               v.views, v.likes, v.comments
        from videos v where v.blocked = false and v.posted_at > now() - interval '7 days'
        order by v.views desc limit greatest(1, least(50, p_limit))) x), '[]'::jsonb),
    'authors', coalesce((select jsonb_agg(y) from (
        select v.author, count(*) as videos, sum(v.views) as views, sum(v.likes) as likes
        from videos v where v.blocked = false and v.posted_at > now() - interval '7 days'
        group by v.author order by sum(v.views) desc limit greatest(1, least(50, p_limit))) y), '[]'::jsonb),
    'cats', coalesce((select jsonb_agg(z) from (
        select coalesce(v.cat, 'разное') as cat, count(*) as videos, sum(v.views) as views
        from videos v where v.blocked = false and v.posted_at > now() - interval '7 days'
        group by v.cat order by sum(v.views) desc limit 12) z), '[]'::jsonb)
  );
$$;
