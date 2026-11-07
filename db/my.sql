-- ========================================================================
-- Профиль: лайки, сохранённое, история. Выполнить в Supabase → SQL Editor.
-- ========================================================================

-- Списки человека — в том же виде, что и лента, чтобы экран был один и тот же.
create or replace function my_videos(
  p_user bigint, p_kind text default 'save', p_limit int default 30, p_skip int default 0
) returns table (
  id text, author text, author_title text, avatar text,
  caption text, tags text[], cat text, game text, lang text,
  duration int, ratio real, video_url text, thumb_url text, posted_at timestamptz,
  views int, likes int, comments int, saves int, shares int,
  liked boolean, saved boolean, following boolean, at timestamptz
) language sql stable as $$
  with picked as (
    select a.video_id, a.at from actions a
      where a.user_id = p_user and a.kind = p_kind and p_kind in ('like','save')
    union all
    select s.video_id, s.at from seen s
      where s.user_id = p_user and p_kind = 'history'
  )
  select v.id, v.author, au.title, au.avatar,
         v.caption, v.tags, v.cat, v.game, v.lang,
         v.duration, v.ratio, v.video_url, v.thumb_url, v.posted_at,
         v.views, v.likes, v.comments, v.saves, v.shares,
         exists (select 1 from actions x where x.user_id = p_user and x.video_id = v.id and x.kind = 'like'),
         exists (select 1 from actions x where x.user_id = p_user and x.video_id = v.id and x.kind = 'save'),
         exists (select 1 from follows f where f.user_id = p_user and f.author = v.author),
         p.at
  from picked p
  join videos v on v.id = p.video_id and v.blocked = false
  join authors au on au.username = v.author
  order by p.at desc
  offset p_skip limit p_limit;
$$;

-- Сводка для профиля: цифры и любимые темы
create or replace function my_profile(p_user bigint)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'likes',    (select count(*) from actions where user_id = p_user and kind = 'like'),
    'saves',    (select count(*) from actions where user_id = p_user and kind = 'save'),
    'follows',  (select count(*) from follows where user_id = p_user),
    'seen',     (select count(*) from seen    where user_id = p_user),
    'watch_sec',(select coalesce(sum(watch_sec), 0) from user_days where user_id = p_user),
    'days',     (select count(*) from user_days where user_id = p_user),
    'since',    (select created_at from users where id = p_user),
    'top',      coalesce((select jsonb_agg(jsonb_build_object('tag', k, 'w', round(val::text::numeric, 1)) order by val::text::real desc)
                          from (select k, val from users u, jsonb_each(coalesce(u.tag_w, '{}'::jsonb)) t(k, val)
                                where u.id = p_user and val::text::real > 0
                                order by val::text::real desc limit 6) z), '[]'::jsonb)
  );
$$;

-- Подписка на автора одной кнопкой
create or replace function toggle_follow(p_user bigint, p_author text) returns boolean
language plpgsql as $$
declare had boolean;
begin
  select exists (select 1 from follows where user_id = p_user and author = p_author) into had;
  if had then delete from follows where user_id = p_user and author = p_author;
  else insert into follows (user_id, author) values (p_user, p_author) on conflict do nothing; end if;
  update users set author_w = jsonb_set(coalesce(author_w, '{}'::jsonb), array[p_author],
      to_jsonb(round((coalesce((author_w ->> p_author)::real, 0) + case when had then -4 else 6 end)::numeric, 3)), true)
    where id = p_user;
  return not had;
end $$;
