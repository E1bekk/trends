-- ========================================================================
-- Комментарии под видео. Выполнить в Supabase → SQL Editor → Run.
-- ========================================================================

create or replace function comments_of(
  p_video text, p_user bigint default null, p_limit int default 30, p_skip int default 0
) returns table (
  id bigint, user_id bigint, user_name text, user_photo text,
  body text, likes int, reply_to bigint, at timestamptz, liked boolean, mine boolean
) language sql stable as $$
  select c.id, c.user_id, c.user_name, c.user_photo, c.body, c.likes, c.reply_to, c.at,
         exists (select 1 from comment_likes l where l.comment_id = c.id and l.user_id = p_user),
         c.user_id = p_user
  from comments c
  where c.video_id = p_video and c.hidden = false and c.room_id is null
  order by c.likes desc, c.at desc
  offset p_skip limit p_limit;
$$;

-- Добавить комментарий. Возвращает его же, чтобы сразу показать без лишнего запроса.
create or replace function comment_add(
  p_user bigint, p_name text, p_photo text, p_video text, p_body text, p_reply bigint default null
) returns jsonb language plpgsql as $$
declare new_id bigint; clean text;
begin
  clean := btrim(p_body);
  if length(clean) < 1 then raise exception 'пустой комментарий'; end if;
  if length(clean) > 1000 then clean := left(clean, 1000); end if;
  if not exists (select 1 from videos where id = p_video and blocked = false) then
    raise exception 'видео не найдено';
  end if;

  insert into users (id, name, photo) values (p_user, p_name, p_photo)
    on conflict (id) do update set name = coalesce(excluded.name, users.name), seen_at = now();

  insert into comments (video_id, user_id, user_name, user_photo, kind, body, reply_to)
    values (p_video, p_user, p_name, p_photo, 'text', clean, p_reply)
    returning id into new_id;
  perform bump_video(p_video, p_comment => 1);

  return (select to_jsonb(x) from (
    select c.id, c.user_id, c.user_name, c.user_photo, c.body, c.likes, c.reply_to, c.at,
           false as liked, true as mine
    from comments c where c.id = new_id) x);
end $$;

create or replace function comment_like(p_user bigint, p_id bigint) returns boolean
language plpgsql as $$
declare had boolean;
begin
  select exists (select 1 from comment_likes where comment_id = p_id and user_id = p_user) into had;
  if had then
    delete from comment_likes where comment_id = p_id and user_id = p_user;
    update comments set likes = greatest(0, likes - 1) where id = p_id;
  else
    insert into comment_likes (user_id, comment_id) values (p_user, p_id) on conflict do nothing;
    update comments set likes = likes + 1 where id = p_id;
  end if;
  return not had;
end $$;

-- Своё сообщение можно удалить, чужое — пожаловаться. Три жалобы — прячем до разбора.
create or replace function comment_remove(p_user bigint, p_id bigint) returns boolean
language plpgsql as $$
declare v text;
begin
  select video_id into v from comments where id = p_id and user_id = p_user and hidden = false;
  if v is null then return false; end if;
  update comments set hidden = true where id = p_id;
  perform bump_video(v, p_comment => -1);
  return true;
end $$;

create or replace function comment_report(p_user bigint, p_id bigint, p_reason text default null)
returns boolean language plpgsql as $$
declare n int; v text;
begin
  insert into reports (comment_id, user_id, reason) values (p_id, p_user, p_reason);
  select count(*) into n from reports where comment_id = p_id;
  if n >= 3 then
    select video_id into v from comments where id = p_id and hidden = false;
    if v is not null then
      update comments set hidden = true where id = p_id;
      perform bump_video(v, p_comment => -1);
    end if;
    return true;
  end if;
  return false;
end $$;
