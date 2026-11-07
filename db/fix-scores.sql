-- Заплатка: заменить функцию пересчёта рейтинга.
-- Вставить в Supabase → SQL Editor → Run.

create or replace function refresh_scores() returns void language sql as $$
  update videos set score =
    (
        0.50 * ((completions + 10 * 0.35) / (impressions + 10.0))
      + 0.20 * ((likes       + 10 * 0.04) / (impressions + 10.0)) * 6
      + 0.10 * ((saves       + 10 * 0.01) / (impressions + 10.0)) * 14
      + 0.20 * least(1.0, ln(greatest(tg_views, 10)::numeric) / ln(1000000::numeric))
    )
    -- Возраст ограничиваем: всё старше ~4 месяцев одинаково старое. Без ограничения
    -- множитель у древнего ролика становится числом с полусотней нулей и не влезает в поле.
    * exp(- greatest(0, least(extract(epoch from (now() - coalesce(posted_at, now()))) / 3600.0, 3000)) / 240.0)
    * (1 + 0.04 * least(spread - 1, 5))
  where blocked = false;
$$;
