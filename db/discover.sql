-- Самопополнение каналов: смотрим, откуда репостят наши каналы,
-- копим кандидатов и добавляем лучших. Файл можно выполнять сколько угодно раз.

alter table authors add column if not exists auto boolean default false;

drop function if exists cand_seen(text[], text);
drop function if exists cand_take(int);
drop function if exists cand_decide(text, text, text, int, int, timestamptz, text, text);
drop function if exists channels_auto();
drop function if exists cands_list(text, int);

-- встретили чужой канал в репосте
create or replace function cand_seen(p_names text[], p_from text default null) returns int
language plpgsql as $$
declare n int := 0;
begin
  insert into candidates (username, from_author, seen)
  select x.name, p_from, 1
  from unnest(p_names) as x(name)
  where x.name ~ '^[A-Za-z0-9_]{4,32}$'
    and not exists (select 1 from authors a where lower(a.username) = lower(x.name))
  on conflict (username) do update set seen = candidates.seen + 1;
  get diagnostics n = row_count;
  return n;
end $$;

-- кого проверять: тех, кто попался хотя бы дважды
create or replace function cand_take(p_limit int default 15)
returns table (username text, seen int, from_author text)
language sql as $$
  update candidates c set checked_at = now()
   where c.username in (select x.username from candidates x
                         where x.status = 'new' and x.seen >= 2
                         order by x.seen desc, x.at limit greatest(1, least(50, p_limit))
                         for update skip locked)
  returning c.username, c.seen, c.from_author;
$$;

-- итог проверки: добавить в ленту или отказать
create or replace function cand_decide(p_name text, p_status text, p_reason text,
                                       p_videos int default 0, p_subs int default 0,
                                       p_last timestamptz default null,
                                       p_title text default null, p_avatar text default null)
returns void language plpgsql as $$
begin
  update candidates set status = p_status, reason = p_reason, videos = p_videos,
         subscribers = p_subs, last_post = p_last, checked_at = now()
   where username = p_name;

  if p_status = 'added' then
    insert into authors (username, title, avatar, subscribers, cat, active, auto)
      values (p_name, coalesce(p_title, p_name), p_avatar, p_subs, 'other', true, true)
    on conflict (username) do update set
      title = coalesce(excluded.title, authors.title),
      avatar = coalesce(excluded.avatar, authors.avatar),
      subscribers = excluded.subscribers, active = true;
  end if;
end $$;

-- каналы, добавленные автоматически: сборщик берёт их вдобавок к своему списку
create or replace function channels_auto()
returns table (username text, cat text, game text, pages int)
language sql stable as $$
  select username, coalesce(cat, 'other'), game, coalesce(pages, 2)
  from authors where auto = true and active = true
  order by subscribers desc nulls last;
$$;

create or replace function cands_list(p_status text default 'new', p_limit int default 50)
returns table (username text, seen int, from_author text, videos int, subscribers int,
               status text, reason text, last_post timestamptz, at timestamptz)
language sql stable as $$
  select username, seen, from_author, videos, subscribers, status, reason, last_post, at
  from candidates
  where coalesce(nullif(btrim(p_status), ''), status) = status
  order by seen desc, at desc
  limit greatest(1, least(200, p_limit));
$$;
