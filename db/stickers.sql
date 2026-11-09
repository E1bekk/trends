-- Стикеры: свои наборы из Telegram и общая библиотека.
-- Правило: свой набор работает у тебя в чатах с друзьями. В общую библиотеку
-- набор попадает только после проверки ИИ. Запрещённое не работает нигде.
-- Файл можно выполнять сколько угодно раз.

drop function if exists pack_save(bigint, text, text, text, int, text, text, jsonb);
drop function if exists packs_mine(bigint);
drop function if exists packs_shared(bigint, text, int);
drop function if exists pack_take(bigint, text);
drop function if exists pack_drop(bigint, text);
drop function if exists pack_one(text);
drop function if exists pack_report(bigint, text);
drop function if exists sticker_bump(text);

-- Сохранить разобранный набор: сам набор, его картинки и привязку к человеку
create or replace function pack_save(p_user bigint, p_name text, p_title text, p_kind text,
                                     p_total int, p_status text, p_reason text, p_items jsonb)
returns jsonb language plpgsql as $$
declare mine boolean;
begin
  insert into sticker_packs (name, title, kind, total, added_by, status, reason, adds, checked_at)
    values (p_name, p_title, p_kind, p_total, p_user, p_status, p_reason, 1, now())
  on conflict (name) do update set
    title = excluded.title, kind = excluded.kind, total = excluded.total,
    -- уже одобренный набор не понижаем из-за повторного разбора
    status = case when sticker_packs.status = 'shared' then 'shared' else excluded.status end,
    reason = excluded.reason, checked_at = now();

  insert into stickers (id, pack, emoji, url, file_id, kind, w, h, pos)
  select x.id, p_name, x.emoji, x.url, x.file_id, coalesce(x.kind, p_kind), x.w, x.h, x.pos
  from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb))
       as x(id text, emoji text, url text, file_id text, kind text, w int, h int, pos int)
  on conflict (id) do update set url = excluded.url, emoji = excluded.emoji, pos = excluded.pos;

  if (select status from sticker_packs where name = p_name) <> 'blocked' then
    insert into user_packs (user_id, pack) values (p_user, p_name) on conflict do nothing;
    select true into mine;
  end if;

  return (select jsonb_build_object('name', name, 'title', title, 'kind', kind, 'status', status,
                                    'reason', reason, 'total', total, 'mine', coalesce(mine, false))
          from sticker_packs where name = p_name);
end $$;

-- Мои наборы вместе с картинками — панель стикеров берёт всё одним запросом
create or replace function packs_mine(p_user bigint)
returns table (name text, title text, kind text, status text, total int, items jsonb)
language sql stable as $$
  select p.name, p.title, p.kind, p.status, p.total,
         coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'emoji', s.emoji, 'url', s.url, 'kind', s.kind)
                                    order by s.pos, s.id)
                   from stickers s where s.pack = p.name), '[]'::jsonb)
  from user_packs up join sticker_packs p on p.name = up.pack
  where up.user_id = p_user and p.status <> 'blocked'
  order by up.at desc;
$$;

-- Общая библиотека: только проверенные наборы, свои не показываем второй раз
create or replace function packs_shared(p_user bigint, p_q text default '', p_limit int default 40)
returns table (name text, title text, kind text, total int, uses int, cover text, mine boolean)
language sql stable as $$
  select p.name, p.title, p.kind, p.total, p.uses,
         (select s.url from stickers s where s.pack = p.name order by s.pos, s.id limit 1),
         exists (select 1 from user_packs up where up.user_id = p_user and up.pack = p.name)
  from sticker_packs p
  where p.status = 'shared'
    and (coalesce(btrim(p_q), '') = '' or p.title ilike '%' || btrim(p_q) || '%' or p.name ilike '%' || btrim(p_q) || '%')
  order by p.uses desc, p.adds desc, p.created_at desc
  limit greatest(1, least(100, p_limit));
$$;

-- Забрать набор из библиотеки себе
create or replace function pack_take(p_user bigint, p_name text) returns jsonb
language plpgsql as $$
declare st text;
begin
  select status into st from sticker_packs where name = p_name;
  if st is null then return jsonb_build_object('ok', false, 'why', 'набор не найден'); end if;
  if st = 'blocked' then return jsonb_build_object('ok', false, 'why', 'набор запрещён'); end if;
  if st <> 'shared' then return jsonb_build_object('ok', false, 'why', 'набор ещё не в общем доступе'); end if;

  insert into user_packs (user_id, pack) values (p_user, p_name) on conflict do nothing;
  update sticker_packs set adds = adds + 1 where name = p_name;
  return jsonb_build_object('ok', true);
end $$;

create or replace function pack_drop(p_user bigint, p_name text) returns void language sql as $$
  delete from user_packs where user_id = p_user and pack = p_name;
$$;

create or replace function pack_one(p_name text)
returns table (name text, title text, kind text, status text, total int, reason text)
language sql stable as $$
  select name, title, kind, status, total, reason from sticker_packs where name = p_name;
$$;

-- Жалоба на набор: три жалобы — и набор уходит из общего доступа
create or replace function pack_report(p_user bigint, p_name text) returns jsonb
language plpgsql as $$
declare n int;
begin
  -- одна жалоба от человека на набор
  if exists (select 1 from reports where user_id = p_user and pack = p_name) then
    return jsonb_build_object('ok', true, 'already', true);
  end if;
  insert into reports (user_id, pack, reason) values (p_user, p_name, 'жалоба');
  update sticker_packs set reports = reports + 1 where name = p_name returning reports into n;
  if n >= 3 then
    update sticker_packs set status = 'private', reason = 'убран из общего доступа по жалобам'
     where name = p_name and status = 'shared';
  end if;
  return jsonb_build_object('ok', true, 'reports', coalesce(n, 0));
end $$;

create or replace function sticker_bump(p_id text) returns void language sql as $$
  update sticker_packs set uses = uses + 1
   where name = (select pack from stickers where id = p_id);
$$;
