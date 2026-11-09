-- Комнаты: смотрим ленту вместе. Ведущий листает, остальные едут следом,
-- реакции видят все. Комната живёт 12 часов и чистится сама.
-- Файл можно выполнять сколько угодно раз.

drop function if exists room_make(bigint, text, text[]);
drop function if exists room_join(bigint, text, text, text);
drop function if exists room_state(bigint, text, bigint);
drop function if exists room_move(bigint, text, int);
drop function if exists room_react(bigint, text, text, text);
drop function if exists room_videos(bigint, text);
drop function if exists room_leave(bigint, text);

create or replace function room_make(p_user bigint, p_title text, p_videos text[]) returns jsonb
language plpgsql as $$
declare rid text; keep text[];
begin
  select array_agg(v.id order by x.ord) into keep
  from unnest(p_videos) with ordinality x(id, ord)
  join videos v on v.id = x.id and v.blocked = false;
  if keep is null or array_length(keep, 1) = 0 then raise exception 'нечего смотреть'; end if;

  rid := lower(substr(md5(random()::text || p_user::text || clock_timestamp()::text), 1, 8));
  insert into rooms (id, host_id, host_name, title, playlist)
    values (rid, p_user, (select name from users where id = p_user),
            coalesce(nullif(btrim(p_title), ''), 'Смотрим вместе'), keep[1:60]);
  insert into room_members (room_id, user_id, name, photo)
    select rid, u.id, u.name, u.photo from users u where u.id = p_user;
  return jsonb_build_object('ok', true, 'id', rid);
end $$;

create or replace function room_join(p_user bigint, p_name text, p_photo text, p_room text) returns jsonb
language plpgsql as $$
declare r rooms%rowtype;
begin
  select * into r from rooms where id = p_room;
  if r.id is null then return jsonb_build_object('ok', false, 'why', 'комната не найдена'); end if;
  if r.expires_at < now() then return jsonb_build_object('ok', false, 'why', 'комната уже закрылась'); end if;

  insert into users (id, name, photo) values (p_user, p_name, p_photo)
    on conflict (id) do update set name = coalesce(excluded.name, users.name), seen_at = now();
  insert into room_members (room_id, user_id, name, photo) values (p_room, p_user, p_name, p_photo)
    on conflict (room_id, user_id) do update set seen_at = now();
  return jsonb_build_object('ok', true, 'id', r.id, 'title', r.title, 'host', r.host_id, 'host_name', r.host_name);
end $$;

create or replace function room_leave(p_user bigint, p_room text) returns void language sql as $$
  delete from room_members where room_id = p_room and user_id = p_user;
$$;

-- Ролики комнаты в том же виде, что и лента
create or replace function room_videos(p_user bigint, p_room text)
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
  from rooms r, unnest(r.playlist) with ordinality p(vid, ord)
  join videos v on v.id = p.vid and v.blocked = false
  join authors au on au.username = v.author
  where r.id = p_room
  order by p.ord;
$$;

-- Отметиться: где я сейчас. Возвращает, кто в комнате, где ведущий и свежие реакции.
create or replace function room_state(p_user bigint, p_room text, p_since bigint default 0)
returns jsonb language plpgsql as $$
declare r rooms%rowtype;
begin
  select * into r from rooms where id = p_room;
  if r.id is null then return jsonb_build_object('ok', false, 'why', 'комната не найдена'); end if;
  update room_members set seen_at = now() where room_id = p_room and user_id = p_user;

  return jsonb_build_object(
    'ok', true, 'title', r.title, 'host', r.host_id, 'host_name', r.host_name,
    'i_host', r.host_id = p_user,
    'closes', r.expires_at,
    'host_pos', coalesce((select pos from room_members where room_id = p_room and user_id = r.host_id), 0),
    -- в комнате считаем тех, кто отметился за последнюю минуту
    'people', coalesce((select jsonb_agg(jsonb_build_object('id', user_id, 'name', name, 'photo', photo, 'pos', pos)
                                         order by seen_at desc)
                        from room_members where room_id = p_room and seen_at > now() - interval '1 minute'), '[]'::jsonb),
    'last', coalesce((select max(id) from room_reactions where room_id = p_room), 0),
    'reactions', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'emoji', emoji, 'video', video_id) order by id)
                           from room_reactions where room_id = p_room and id > coalesce(p_since, 0)), '[]'::jsonb)
  );
end $$;

create or replace function room_move(p_user bigint, p_room text, p_pos int) returns void language sql as $$
  update room_members set pos = greatest(0, p_pos), seen_at = now()
   where room_id = p_room and user_id = p_user;
$$;

create or replace function room_react(p_user bigint, p_room text, p_video text, p_emoji text) returns jsonb
language plpgsql as $$
declare new_id bigint;
begin
  if not exists (select 1 from room_members where room_id = p_room and user_id = p_user) then
    raise exception 'ты не в этой комнате';
  end if;
  insert into room_reactions (room_id, video_id, user_id, name, emoji)
    values (p_room, p_video, p_user, (select name from users where id = p_user), left(coalesce(p_emoji, '❤️'), 8))
    returning id into new_id;
  return jsonb_build_object('ok', true, 'id', new_id);
end $$;
