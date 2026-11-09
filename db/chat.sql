-- ========================================================================
-- Друзья и чаты. Выполнить в Supabase → SQL Editor → Run.
-- ========================================================================

-- Сначала убираем старые версии: Postgres не позволяет менять набор колонок у существующей функции
drop function if exists invite_make(bigint);
drop function if exists invite_accept(bigint, text, text, text);
drop function if exists friends_of(bigint);
drop function if exists chat_with(bigint, bigint);
drop function if exists chat_group(bigint, text, bigint[]);
drop function if exists chats_of(bigint);
drop function if exists chat_open(bigint, text, int, int);
drop function if exists chat_send(bigint, text, text, text, text, text, text, text);
drop function if exists chat_read(bigint, text);

-- ---------- друзья по ссылке-приглашению ----------
create or replace function invite_make(p_user bigint) returns text
language plpgsql as $$
declare c text;
begin
  select code into c from invites where user_id = p_user order by at desc limit 1;
  if c is not null then return c; end if;
  c := lower(substr(md5(random()::text || p_user::text), 1, 8));
  insert into invites (code, user_id) values (c, p_user);
  return c;
end $$;

-- Принять приглашение: дружба взаимная, личный чат заводится сразу
create or replace function invite_accept(p_user bigint, p_name text, p_photo text, p_code text)
returns jsonb language plpgsql as $$
declare owner bigint; chat_id text;
begin
  select user_id into owner from invites where code = p_code;
  if owner is null then return jsonb_build_object('ok', false, 'why', 'ссылка не найдена'); end if;
  if owner = p_user then return jsonb_build_object('ok', false, 'why', 'это твоя же ссылка'); end if;

  insert into users (id, name, photo) values (p_user, p_name, p_photo)
    on conflict (id) do update set name = coalesce(excluded.name, users.name), seen_at = now();
  insert into friends (user_id, friend_id) values (p_user, owner), (owner, p_user) on conflict do nothing;
  update invites set uses = uses + 1 where code = p_code;

  chat_id := 'dm:' || least(p_user, owner) || '-' || greatest(p_user, owner);
  insert into chats (id, kind, created_by) values (chat_id, 'dm', p_user) on conflict do nothing;
  insert into chat_members (chat_id, user_id, name, photo)
    select chat_id, u.id, u.name, u.photo from users u where u.id in (p_user, owner)
    on conflict do nothing;

  return jsonb_build_object('ok', true, 'chat', chat_id,
    'friend', (select jsonb_build_object('id', id, 'name', name, 'photo', photo) from users where id = owner));
end $$;

create or replace function friends_of(p_user bigint)
returns table (id bigint, name text, photo text, chat text, at timestamptz)
language sql stable as $$
  select u.id, u.name, u.photo,
         'dm:' || least(p_user, u.id) || '-' || greatest(p_user, u.id), f.at
  from friends f join users u on u.id = f.friend_id
  where f.user_id = p_user
  order by f.at desc;
$$;

-- ---------- чаты ----------
create or replace function chat_with(p_user bigint, p_friend bigint) returns text
language plpgsql as $$
declare cid text;                       -- не "id": иначе спорит с колонкой таблицы
begin
  if not exists (select 1 from friends where user_id = p_user and friend_id = p_friend) then
    raise exception 'вы ещё не друзья';
  end if;
  cid := 'dm:' || least(p_user, p_friend) || '-' || greatest(p_user, p_friend);
  insert into chats (id, kind, created_by) values (cid, 'dm', p_user) on conflict do nothing;
  insert into chat_members (chat_id, user_id, name, photo)
    select cid, u.id, u.name, u.photo from users u where u.id in (p_user, p_friend) on conflict do nothing;
  return cid;
end $$;

create or replace function chat_group(p_user bigint, p_title text, p_members bigint[]) returns text
language plpgsql as $$
declare cid text;
begin
  cid := 'g' || lower(substr(md5(random()::text || p_user::text), 1, 10));
  insert into chats (id, kind, title, created_by) values (cid, 'group', coalesce(nullif(btrim(p_title), ''), 'Компания'), p_user);
  insert into chat_members (chat_id, user_id, name, photo, role)
    select cid, u.id, u.name, u.photo, case when u.id = p_user then 'owner' else 'member' end
    from users u
    where u.id = p_user
       or (u.id = any(p_members) and exists (select 1 from friends f where f.user_id = p_user and f.friend_id = u.id))
    on conflict do nothing;
  return cid;
end $$;

-- Список чатов: с кем, последнее сообщение и сколько непрочитанных
create or replace function chats_of(p_user bigint)
returns table (id text, kind text, title text, photo text, last_body text, last_kind text,
               last_at timestamptz, unread bigint, who bigint, members bigint)
language sql stable as $$
  with mine as (select c.id, c.kind, c.title, c.last_at, m.last_read
                from chat_members m join chats c on c.id = m.chat_id where m.user_id = p_user),
  -- собеседник нужен только для личного чата; в группе участников много,
  -- и без distinct чат показывался бы по разу на каждого
  other as (select distinct on (mine.id) mine.id, o.user_id, o.name, o.photo
            from mine join chat_members o on o.chat_id = mine.id and o.user_id <> p_user
            where mine.kind = 'dm' order by mine.id, o.user_id),
  last_msg as (select distinct on (chat_id) chat_id, body, kind, at, id
               from messages where hidden = false order by chat_id, id desc)
  select mine.id, mine.kind,
         coalesce(mine.title, o.name, 'Чат'),
         o.photo,
         case lm.kind when 'video' then '📹 Видео' when 'shelf' then '🔖 Полка'
                      when 'voice' then '🎤 Голосовое' when 'sticker' then 'Стикер' else lm.body end,
         lm.kind, coalesce(lm.at, mine.last_at),
         (select count(*) from messages x where x.chat_id = mine.id and x.id > mine.last_read and x.user_id <> p_user and x.hidden = false),
         o.user_id,
         (select count(*) from chat_members cm where cm.chat_id = mine.id)
  from mine
  left join other o on o.id = mine.id
  left join last_msg lm on lm.chat_id = mine.id
  order by coalesce(lm.at, mine.last_at) desc;
$$;

-- Сообщения чата. Вместе с видео и полками, чтобы показать их прямо в переписке.
create or replace function chat_open(p_user bigint, p_chat text, p_limit int default 50, p_skip int default 0)
returns table (id bigint, user_id bigint, user_name text, user_photo text, kind text, body text,
               at timestamptz, mine boolean, video_id text, video_thumb text, video_caption text,
               shelf_id text, shelf_title text, shelf_items int)
language sql stable as $$
  select m.id, m.user_id, m.user_name, m.user_photo, m.kind, m.body, m.at,
         m.user_id = p_user,
         m.video_id, v.thumb_url, v.caption,
         m.shelf_id, s.title, s.items
  from messages m
  left join videos v on v.id = m.video_id
  left join shelves s on s.id = m.shelf_id
  where m.chat_id = p_chat and m.hidden = false
    and exists (select 1 from chat_members cm where cm.chat_id = p_chat and cm.user_id = p_user)
  order by m.id desc
  offset p_skip limit p_limit;
$$;

create or replace function chat_send(p_user bigint, p_name text, p_photo text, p_chat text,
                                     p_kind text default 'text', p_body text default null,
                                     p_video text default null, p_shelf text default null)
returns jsonb language plpgsql as $$
declare new_id bigint;
begin
  if not exists (select 1 from chat_members where chat_id = p_chat and user_id = p_user) then
    raise exception 'ты не в этом чате';
  end if;
  if p_kind = 'text' and coalesce(btrim(p_body), '') = '' then raise exception 'пустое сообщение'; end if;

  insert into messages (chat_id, user_id, user_name, user_photo, kind, body, video_id, shelf_id)
    values (p_chat, p_user, p_name, p_photo, p_kind,
            case when p_kind = 'text' then left(btrim(p_body), 2000) else nullif(btrim(coalesce(p_body, '')), '') end,
            p_video, p_shelf)
    returning id into new_id;
  update chats set last_at = now() where id = p_chat;
  update chat_members set last_read = new_id where chat_id = p_chat and user_id = p_user;

  return (select to_jsonb(x) from (
    select m.id, m.user_id, m.user_name, m.user_photo, m.kind, m.body, m.at, true as mine,
           m.video_id, v.thumb_url as video_thumb, v.caption as video_caption,
           m.shelf_id, s.title as shelf_title, s.items as shelf_items
    from messages m left join videos v on v.id = m.video_id left join shelves s on s.id = m.shelf_id
    where m.id = new_id) x);
end $$;

create or replace function chat_read(p_user bigint, p_chat text) returns void language sql as $$
  update chat_members set last_read = coalesce((select max(id) from messages where chat_id = p_chat), 0)
   where chat_id = p_chat and user_id = p_user;
$$;
