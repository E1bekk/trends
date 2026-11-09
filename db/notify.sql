-- Уведомления от бота: складываем в очередь, отправляет отдельная задача.
-- Если Telegram не ответил — попробуем ещё раз, а не потеряем письмо.
-- Файл можно выполнять сколько угодно раз.

drop function if exists notify_add(bigint, text, text, text);
drop function if exists outbox_take(int);
drop function if exists outbox_done(bigint, text);
drop function if exists notify_set(bigint, boolean, boolean);
-- функцию-триггер не роняем: на ней висит сам триггер, а create or replace её спокойно обновит

-- положить письмо в очередь; молчим, если человек не разрешил писать или сейчас в приложении
create or replace function notify_add(p_user bigint, p_body text, p_button text default null, p_param text default null)
returns boolean language plpgsql as $$
declare u users%rowtype;
begin
  select * into u from users where id = p_user;
  if u.id is null or u.notify = false or u.can_write = false then return false; end if;
  if u.seen_at > now() - interval '2 minutes' then return false; end if;   -- он и так в приложении
  -- не частим: одно письмо человеку в 10 минут
  if exists (select 1 from outbox where user_id = p_user and at > now() - interval '10 minutes') then return false; end if;

  insert into outbox (user_id, body, button, param) values (p_user, left(p_body, 300), p_button, p_param);
  return true;
end $$;

-- сообщение в чат — остальным участникам письмо
create or replace function notify_msg() returns trigger language plpgsql as $$
declare c record; who text;
begin
  who := coalesce(new.user_name, 'Кто-то');
  for c in select cm.user_id from chat_members cm
            where cm.chat_id = new.chat_id and cm.user_id <> new.user_id
  loop
    perform notify_add(c.user_id,
      who || ' написал тебе' ||
      case new.kind when 'video' then ' и скинул видео' when 'voice' then ' голосовое'
                    when 'sticker' then ' стикер' when 'shelf' then ' полку' else '' end,
      'Открыть', 'chat_' || new.chat_id);
  end loop;
  return new;
end $$;

drop trigger if exists messages_notify on messages;
create trigger messages_notify after insert on messages
  for each row execute function notify_msg();

-- человек разрешил или запретил боту писать
create or replace function notify_set(p_user bigint, p_can boolean, p_want boolean default null)
returns void language sql as $$
  update users set can_write = coalesce(p_can, can_write),
                   notify    = coalesce(p_want, notify)
   where id = p_user;
$$;

-- забрать пачку писем на отправку
create or replace function outbox_take(p_limit int default 30)
returns table (id bigint, user_id bigint, body text, button text, param text)
language sql as $$
  update outbox o set tries = tries + 1
   where o.id in (select x.id from outbox x
                   where x.sent_at is null and x.tries < 3
                   order by x.id limit greatest(1, least(100, p_limit))
                   for update skip locked)
  returning o.id, o.user_id, o.body, o.button, o.param;
$$;

create or replace function outbox_done(p_id bigint, p_error text default null) returns void
language sql as $$
  update outbox set sent_at = case when p_error is null then now() else sent_at end,
                    error = p_error
   where id = p_id;
$$;
