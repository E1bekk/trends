-- Фон профиля: человек сам ставит свои фото наверх страницы (до 6 штук, листаются).
-- Файл можно выполнять сколько угодно раз — ничего не сломается.

alter table users add column if not exists covers jsonb not null default '[]'::jsonb;
alter table users add column if not exists bio    text;

-- Postgres не разрешает менять набор колонок у готовой функции — сначала убираем старую
drop function if exists cover_add(bigint, text);
drop function if exists cover_del(bigint, text);
drop function if exists bio_set(bigint, text);

-- добавить фото на фон; возвращает новый список
create or replace function cover_add(p_user bigint, p_url text) returns jsonb
language plpgsql as $$
declare list jsonb;
begin
  if p_url is null or p_url = '' then raise exception 'пустая ссылка'; end if;
  insert into users(id) values (p_user) on conflict (id) do nothing;

  -- оставляем 5 самых свежих, самое старое фото уходит
  select coalesce(jsonb_agg(x order by i), '[]'::jsonb) into list
  from (select value as x, ord as i
        from users u, jsonb_array_elements(u.covers) with ordinality t(value, ord)
        where u.id = p_user and value <> to_jsonb(p_url)
        order by ord desc limit 5) z;

  list := list || to_jsonb(p_url);              -- новое фото встаёт последним
  update users set covers = list where id = p_user;
  return list;
end $$;

-- убрать фото с фона
create or replace function cover_del(p_user bigint, p_url text) returns jsonb
language plpgsql as $$
declare list jsonb;
begin
  select coalesce(jsonb_agg(value), '[]'::jsonb) into list
  from users u, jsonb_array_elements(u.covers) where u.id = p_user and value <> to_jsonb(p_url);
  update users set covers = coalesce(list, '[]'::jsonb) where id = p_user;
  return coalesce(list, '[]'::jsonb);
end $$;

-- пара слов о себе
create or replace function bio_set(p_user bigint, p_text text) returns text
language plpgsql as $$
declare t text := nullif(btrim(left(coalesce(p_text, ''), 140)), '');
begin
  insert into users(id) values (p_user) on conflict (id) do nothing;
  update users set bio = t where id = p_user;
  return t;
end $$;

-- профиль теперь отдаёт ещё фон и описание
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
    'covers',   coalesce((select covers from users where id = p_user), '[]'::jsonb),
    'bio',      (select bio from users where id = p_user),
    'top',      coalesce((select jsonb_agg(jsonb_build_object('tag', k, 'w', round(val::text::numeric, 1)) order by val::text::real desc)
                          from (select k, val from users u, jsonb_each(coalesce(u.tag_w, '{}'::jsonb)) t(k, val)
                                where u.id = p_user and val::text::real > 0
                                order by val::text::real desc limit 6) z), '[]'::jsonb)
  );
$$;
