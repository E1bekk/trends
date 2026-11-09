-- Админка: жалобы, наборы стикеров, блокировка роликов и каналов.
-- Кто админ — решает сервер по списку в переменной окружения, в базе прав нет.
-- Файл можно выполнять сколько угодно раз.

drop function if exists reports_list(int);
drop function if exists packs_list(text, int);
drop function if exists mod_pack(text, text, text);
drop function if exists mod_comment(bigint, boolean);
drop function if exists mod_video(text, boolean);
drop function if exists mod_author(text, boolean);
drop function if exists videos_find(text, int);

-- жалобы: и на наборы, и на комментарии, свежие сверху
create or replace function reports_list(p_limit int default 50)
returns table (id bigint, kind text, target text, title text, body text,
               who bigint, reason text, at timestamptz, status text, count bigint)
language sql stable as $$
  select r.id,
         case when r.pack is not null then 'pack' else 'comment' end,
         coalesce(r.pack, r.comment_id::text),
         coalesce(p.title, c.user_name),
         coalesce(p.reason, left(c.body, 120)),
         r.user_id, r.reason, r.at,
         coalesce(p.status, case when c.hidden then 'hidden' else 'visible' end),
         case when r.pack is not null
              then (select count(*) from reports x where x.pack = r.pack)
              else (select count(*) from reports x where x.comment_id = r.comment_id) end
  from reports r
  left join sticker_packs p on p.name = r.pack
  left join comments c on c.id = r.comment_id
  order by r.at desc
  limit greatest(1, least(200, p_limit));
$$;

-- наборы стикеров по состоянию
create or replace function packs_list(p_status text default '', p_limit int default 50)
returns table (name text, title text, kind text, status text, reason text, total int,
               adds int, uses int, reports int, added_by bigint, cover text, at timestamptz)
language sql stable as $$
  select p.name, p.title, p.kind, p.status, p.reason, p.total, p.adds, p.uses, p.reports, p.added_by,
         (select s.url from stickers s where s.pack = p.name order by s.pos, s.id limit 1),
         p.created_at
  from sticker_packs p
  where coalesce(nullif(btrim(p_status), ''), p.status) = p.status
  order by p.reports desc, p.created_at desc
  limit greatest(1, least(200, p_limit));
$$;

-- перевести набор: new | private | shared | blocked
create or replace function mod_pack(p_name text, p_status text, p_reason text default null)
returns jsonb language plpgsql as $$
begin
  if p_status not in ('new', 'private', 'shared', 'blocked') then raise exception 'непонятное состояние'; end if;
  update sticker_packs set status = p_status, reason = p_reason, checked_at = now(),
         reports = case when p_status = 'shared' then 0 else reports end
   where name = p_name;
  -- запрещённый набор убираем у всех
  if p_status = 'blocked' then delete from user_packs where pack = p_name; end if;
  return (select to_jsonb(x) from (select name, status, reason from sticker_packs where name = p_name) x);
end $$;

create or replace function mod_comment(p_id bigint, p_hide boolean) returns void language sql as $$
  update comments set hidden = p_hide where id = p_id;
$$;

create or replace function mod_video(p_id text, p_blocked boolean) returns void language sql as $$
  update videos set blocked = p_blocked where id = p_id;
$$;

-- выключенный канал перестаёт собираться, его ролики уходят из ленты
create or replace function mod_author(p_username text, p_blocked boolean) returns void language sql as $$
  update authors set active = not p_blocked where username = p_username;
  update videos  set blocked = p_blocked where author = p_username;
$$;

-- поиск ролика по тексту или по автору
create or replace function videos_find(p_q text, p_limit int default 30)
returns table (id text, author text, caption text, views int, likes int, blocked boolean, posted_at timestamptz)
language sql stable as $$
  select v.id, v.author, left(coalesce(v.caption, ''), 100), v.views, v.likes, v.blocked, v.posted_at
  from videos v
  where btrim(coalesce(p_q, '')) <> ''
    and (v.author ilike '%' || btrim(p_q) || '%' or v.caption ilike '%' || btrim(p_q) || '%' or v.id = btrim(p_q))
  order by v.posted_at desc
  limit greatest(1, least(100, p_limit));
$$;
