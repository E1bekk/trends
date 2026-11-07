-- ========================================================================
-- Умная лента и обучение. Выполнить в Supabase → SQL Editor → Run.
-- Повторный запуск безопасен: функции просто заменяются на новые.
-- ========================================================================

-- Насколько человеку интересно это видео: от -1 до +1.
-- Веса копятся от его действий, а здесь приводятся к мягкой шкале,
-- чтобы один фанатичный лайк не перекосил всю ленту.
create or replace function taste_of(p_tag_w jsonb, p_cat_w jsonb, p_author_w jsonb,
                                    p_tags text[], p_cat text, p_author text)
returns real language sql immutable as $$
  select least(1.4, greatest(-0.9,
      0.55 * (coalesce((select sum((p_tag_w ->> t)::real) from unnest(p_tags) t where p_tag_w ? t), 0)
              / (6 + abs(coalesce((select sum((p_tag_w ->> t)::real) from unnest(p_tags) t where p_tag_w ? t), 0))))
    + 0.30 * (coalesce((p_cat_w ->> p_cat)::real, 0) / (8 + abs(coalesce((p_cat_w ->> p_cat)::real, 0))))
    + 0.45 * (coalesce((p_author_w ->> p_author)::real, 0) / (6 + abs(coalesce((p_author_w ->> p_author)::real, 0))))
  ))::real;
$$;

-- ========== сама лента ==========
-- Два этапа, как у больших сервисов: сначала отбираем кандидатов по рейтингу,
-- потом пересчитываем под конкретного человека и раскидываем по разнообразию.
create or replace function feed_for(
  p_user  bigint default null,
  p_mode  text   default 'foryou',   -- foryou | trends | fresh | follow
  p_vibe  text   default null,       -- настроение: humor | wow | sport | games | animals | ...
  p_limit int    default 20,
  p_skip  int    default 0           -- сколько уже отдали: листание ленты
) returns table (
  id text, author text, author_title text, avatar text,
  caption text, tags text[], cat text, game text, lang text,
  duration int, ratio real, video_url text, thumb_url text, posted_at timestamptz,
  views int, likes int, comments int, saves int, shares int,
  liked boolean, saved boolean, following boolean
) language sql stable as $$
  with me as (
    select coalesce(u.tag_w, '{}'::jsonb) tag_w, coalesce(u.cat_w, '{}'::jsonb) cat_w,
           coalesce(u.author_w, '{}'::jsonb) author_w, coalesce(u.events, 0) events
    from (select 1) z left join users u on u.id = p_user
  ),
  pool as (                                      -- кандидаты: берём с запасом
    select v.* from videos v
    where v.blocked = false
      and (p_vibe is null or v.cat = p_vibe)
      and (p_mode <> 'follow' or exists (select 1 from follows f where f.user_id = p_user and f.author = v.author))
    order by
      case p_mode
        when 'trends' then v.tg_views / power(extract(epoch from (now() - coalesce(v.posted_at, now()))) / 3600.0 + 2, 0.8)
        when 'fresh'  then extract(epoch from coalesce(v.posted_at, now()))
        else v.score
      end desc
    limit greatest(400, (p_skip + p_limit) * 6)
  ),
  scored as (
    select p.*,
      p.score
        * case when (select events from me) < 3 then 1              -- новичку — просто лучшее
               else 1 + 1.6 * taste_of((select tag_w from me), (select cat_w from me),
                                       (select author_w from me), p.tags, p.cat, p.author) end
        -- уже видел: вниз, но со временем прощаем
        * case when s.at is null then 1
               else 0.15 + least(0.5, extract(epoch from (now() - s.at)) / 86400.0 / 4) end
        -- щепотка случайности, чтобы лента не была одинаковой каждый раз
        * (0.88 + 0.24 * random())
        as rank
    from pool p left join seen s on s.user_id = p_user and s.video_id = p.id
  ),
  spread_out as (                                -- один канал не занимает всю ленту
    select sc.*, sc.rank * power(0.80, row_number() over (partition by sc.author order by sc.rank desc) - 1) as final
    from scored sc
  )
  select so.id, so.author, a.title, a.avatar,
         so.caption, so.tags, so.cat, so.game, so.lang,
         so.duration, so.ratio, so.video_url, so.thumb_url, so.posted_at,
         so.views, so.likes, so.comments, so.saves, so.shares,
         exists (select 1 from actions ac where ac.user_id = p_user and ac.video_id = so.id and ac.kind = 'like'),
         exists (select 1 from actions ac where ac.user_id = p_user and ac.video_id = so.id and ac.kind = 'save'),
         exists (select 1 from follows f where f.user_id = p_user and f.author = so.author)
  from spread_out so join authors a on a.username = so.author
  order by so.final desc
  offset p_skip limit p_limit;
$$;

-- ========== обучение: приходят действия человека, обновляем вкусы и статистику ==========
-- p_events — массив вида:
--   [{"v":"prikoly/123","kind":"watch","sec":14.2,"ratio":0.93}, {"v":"...","kind":"like","on":true}]
-- kind: watch | like | save | share | open
create or replace function log_events(p_user bigint, p_name text, p_photo text, p_lang text, p_events jsonb)
returns void language plpgsql as $$
declare
  e        jsonb;
  w        real;
  vid      videos%rowtype;
  tag      text;
  tw       jsonb;
  cw       jsonb;
  aw       jsonb;
  n        int := 0;
  sec_sum  real := 0;
  vids     int := 0;
begin
  if p_user is null then return; end if;

  insert into users (id, name, photo, lang) values (p_user, p_name, p_photo, p_lang)
    on conflict (id) do update set
      name = coalesce(excluded.name, users.name),
      photo = coalesce(excluded.photo, users.photo),
      seen_at = now();

  select coalesce(tag_w,'{}'), coalesce(cat_w,'{}'), coalesce(author_w,'{}')
    into tw, cw, aw from users where id = p_user;

  for e in select * from jsonb_array_elements(p_events) loop
    select * into vid from videos where id = e->>'v';
    continue when not found;

    w := case e->>'kind'
           when 'like'  then case when coalesce((e->>'on')::boolean, true) then 3 else -3 end
           when 'save'  then case when coalesce((e->>'on')::boolean, true) then 4 else -2 end
           when 'share' then 3
           when 'open'  then 0.5
           when 'watch' then case
                               when coalesce((e->>'ratio')::real, 0) >= 0.8 then 2
                               when coalesce((e->>'ratio')::real, 0) >= 0.35 then 0.8
                               when coalesce((e->>'sec')::real, 0) < 2.5 then -1
                               else 0 end
           else 0 end;

    -- счётчики видео
    if e->>'kind' = 'watch' then
      perform bump_video(vid.id, p_views => 1, p_impr => 1,
        p_compl => case when coalesce((e->>'ratio')::real,0) >= 0.8 then 1 else 0 end,
        p_skip  => case when coalesce((e->>'sec')::real,0) < 2.5 then 1 else 0 end,
        p_watch => coalesce((e->>'sec')::real, 0));
      insert into seen (user_id, video_id) values (p_user, vid.id)
        on conflict (user_id, video_id) do update set at = now();
      sec_sum := sec_sum + coalesce((e->>'sec')::real, 0);
      vids := vids + 1;
    elsif e->>'kind' = 'like' then
      if coalesce((e->>'on')::boolean, true) then
        insert into actions (user_id, video_id, kind) values (p_user, vid.id, 'like') on conflict do nothing;
        perform bump_video(vid.id, p_like => 1);
      else
        delete from actions where user_id = p_user and video_id = vid.id and kind = 'like';
        perform bump_video(vid.id, p_like => -1);
      end if;
    elsif e->>'kind' = 'save' then
      if coalesce((e->>'on')::boolean, true) then
        insert into actions (user_id, video_id, kind) values (p_user, vid.id, 'save') on conflict do nothing;
        perform bump_video(vid.id, p_save => 1);
      else
        delete from actions where user_id = p_user and video_id = vid.id and kind = 'save';
        perform bump_video(vid.id, p_save => -1);
      end if;
    elsif e->>'kind' = 'share' then
      perform bump_video(vid.id, p_share => 1);
    end if;

    -- вкусы: тема, категория, автор
    if w <> 0 then
      foreach tag in array coalesce(vid.tags, '{}') loop
        tw := jsonb_set(tw, array[tag], to_jsonb(round((coalesce((tw->>tag)::real,0) + w)::numeric, 3)), true);
      end loop;
      if vid.cat is not null then
        cw := jsonb_set(cw, array[vid.cat], to_jsonb(round((coalesce((cw->>vid.cat)::real,0) + w * 0.5)::numeric, 3)), true);
      end if;
      aw := jsonb_set(aw, array[vid.author], to_jsonb(round((coalesce((aw->>vid.author)::real,0) + w)::numeric, 3)), true);
      n := n + 1;
    end if;
  end loop;

  update users set tag_w = tw, cat_w = cw, author_w = aw, events = events + n, seen_at = now()
   where id = p_user;

  if vids > 0 then
    insert into user_days (user_id, day, watch_sec, videos)
      values (p_user, current_date, round(sec_sum)::int, vids)
      on conflict (user_id, day) do update set
        watch_sec = user_days.watch_sec + round(sec_sum)::int,
        videos = user_days.videos + vids;
  end if;
end $$;

-- Вкусы со временем выцветают, иначе лента навсегда застрянет на том,
-- что человек смотрел полгода назад. Вызывается раз в сутки из уборки.
create or replace function fade_taste() returns void language sql as $$
  update users set
    tag_w    = (select coalesce(jsonb_object_agg(k, round((val::text::real * 0.9)::numeric, 3)), '{}'::jsonb)
                from jsonb_each(tag_w) as t(k, val) where abs(val::text::real) > 0.2),
    cat_w    = (select coalesce(jsonb_object_agg(k, round((val::text::real * 0.9)::numeric, 3)), '{}'::jsonb)
                from jsonb_each(cat_w) as t(k, val) where abs(val::text::real) > 0.2),
    author_w = (select coalesce(jsonb_object_agg(k, round((val::text::real * 0.9)::numeric, 3)), '{}'::jsonb)
                from jsonb_each(author_w) as t(k, val) where abs(val::text::real) > 0.2)
  where seen_at > now() - interval '60 days';
$$;
