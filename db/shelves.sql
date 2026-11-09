-- Полки: своя подборка роликов, которой делятся одной ссылкой.
-- Файл можно выполнять сколько угодно раз.

drop function if exists shelf_make(bigint, text, text);
drop function if exists shelf_put(bigint, text, text);
drop function if exists shelf_pull(bigint, text, text);
drop function if exists shelf_drop(bigint, text);
drop function if exists shelves_of(bigint);
drop function if exists shelf_open(bigint, text, int, int);
drop function if exists shelf_take(bigint, text);
drop function if exists shelf_rename(bigint, text, text);

-- создать полку
create or replace function shelf_make(p_user bigint, p_title text, p_first text default null)
returns jsonb language plpgsql as $$
declare sid text;
begin
  if (select count(*) from shelves where user_id = p_user) >= 50 then
    raise exception 'больше 50 полок не бывает';
  end if;
  sid := lower(substr(md5(random()::text || p_user::text || clock_timestamp()::text), 1, 8));
  insert into shelves (id, user_id, user_name, title)
    values (sid, p_user, (select name from users where id = p_user),
            coalesce(nullif(btrim(p_title), ''), 'Полка'));
  if p_first is not null then perform shelf_put(p_user, sid, p_first); end if;
  return (select to_jsonb(s) from shelves s where s.id = sid);
end $$;

-- положить ролик на полку
create or replace function shelf_put(p_user bigint, p_shelf text, p_video text) returns jsonb
language plpgsql as $$
declare n int;
begin
  if not exists (select 1 from shelves where id = p_shelf and user_id = p_user) then
    raise exception 'это не твоя полка';
  end if;
  if (select count(*) from shelf_items where shelf_id = p_shelf) >= 200 then
    raise exception 'на полке уже 200 роликов';
  end if;
  insert into shelf_items (shelf_id, video_id, pos)
    values (p_shelf, p_video, coalesce((select max(pos) + 1 from shelf_items where shelf_id = p_shelf), 0))
    on conflict do nothing;

  select count(*) into n from shelf_items where shelf_id = p_shelf;
  update shelves set items = n,
         cover = coalesce(cover, (select v.thumb_url from videos v where v.id = p_video))
   where id = p_shelf;
  return jsonb_build_object('ok', true, 'items', n);
end $$;

-- снять ролик с полки
create or replace function shelf_pull(p_user bigint, p_shelf text, p_video text) returns jsonb
language plpgsql as $$
declare n int;
begin
  if not exists (select 1 from shelves where id = p_shelf and user_id = p_user) then
    raise exception 'это не твоя полка';
  end if;
  delete from shelf_items where shelf_id = p_shelf and video_id = p_video;
  select count(*) into n from shelf_items where shelf_id = p_shelf;
  update shelves set items = n where id = p_shelf;
  return jsonb_build_object('ok', true, 'items', n);
end $$;

create or replace function shelf_drop(p_user bigint, p_shelf text) returns void language sql as $$
  delete from shelves where id = p_shelf and user_id = p_user;
$$;

create or replace function shelf_rename(p_user bigint, p_shelf text, p_title text) returns void language sql as $$
  update shelves set title = coalesce(nullif(btrim(p_title), ''), title)
   where id = p_shelf and user_id = p_user;
$$;

-- мои полки
create or replace function shelves_of(p_user bigint)
returns table (id text, title text, cover text, items int, opens int, taken int, at timestamptz)
language sql stable as $$
  select id, title, cover, items, opens, taken, created_at
  from shelves where user_id = p_user order by created_at desc;
$$;

-- содержимое полки: открыть может любой, у кого есть ссылка
create or replace function shelf_open(p_user bigint, p_shelf text, p_limit int default 50, p_skip int default 0)
returns table (
  id text, author text, author_title text, avatar text,
  caption text, tags text[], cat text, game text, lang text,
  duration int, ratio real, video_url text, thumb_url text, posted_at timestamptz,
  views int, likes int, comments int, saves int, shares int,
  liked boolean, saved boolean, following boolean
) language sql stable as $$
  select v.id, v.author, au.title, au.avatar,
         v.caption, v.tags, v.cat, v.game, v.lang,
         v.duration, v.ratio, v.video_url, v.thumb_url, v.posted_at,
         v.views, v.likes, v.comments, v.saves, v.shares,
         exists (select 1 from actions x where x.user_id = p_user and x.video_id = v.id and x.kind = 'like'),
         exists (select 1 from actions x where x.user_id = p_user and x.video_id = v.id and x.kind = 'save'),
         exists (select 1 from follows f where f.user_id = p_user and f.author = v.author)
  from shelf_items si
  join videos v on v.id = si.video_id and v.blocked = false
  join authors au on au.username = v.author
  where si.shelf_id = p_shelf
  order by si.pos
  offset p_skip limit p_limit;
$$;

-- забрать чужую полку себе: копируем список к себе новой полкой
create or replace function shelf_take(p_user bigint, p_shelf text) returns jsonb
language plpgsql as $$
declare src shelves%rowtype; sid text;
begin
  select * into src from shelves where id = p_shelf;
  if src.id is null then return jsonb_build_object('ok', false, 'why', 'полка не найдена'); end if;
  if src.user_id = p_user then return jsonb_build_object('ok', false, 'why', 'это твоя полка'); end if;

  sid := lower(substr(md5(random()::text || p_user::text || clock_timestamp()::text), 1, 8));
  insert into shelves (id, user_id, user_name, title, cover, items)
    values (sid, p_user, (select name from users where id = p_user), src.title, src.cover, src.items);
  insert into shelf_items (shelf_id, video_id, pos)
    select sid, video_id, pos from shelf_items where shelf_id = p_shelf;
  update shelves set taken = taken + 1 where id = p_shelf;
  return jsonb_build_object('ok', true, 'shelf', sid);
end $$;

drop function if exists bump_shelf_open(text);
create or replace function bump_shelf_open(p_shelf text) returns void language sql as $$
  update shelves set opens = opens + 1 where id = p_shelf;
$$;
