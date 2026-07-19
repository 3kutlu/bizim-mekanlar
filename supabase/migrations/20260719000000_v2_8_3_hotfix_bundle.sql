-- Bizim Mekanlar v2.8.3
-- Dispatch content-share push notifications from the database transaction so
-- delivery no longer depends on the sender keeping the browser open.

create extension if not exists pg_net;

create or replace function public."DispatchContentSharePush"()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_web_push_url text;
  v_content_share_push_url text;
  v_internal_secret text;
begin
  select secret_row.decrypted_secret
    into v_web_push_url
  from vault.decrypted_secrets secret_row
  where secret_row.name = 'web_push_function_url'
  limit 1;

  select secret_row.decrypted_secret
    into v_internal_secret
  from vault.decrypted_secrets secret_row
  where secret_row.name = 'web_push_function_secret'
  limit 1;

  v_content_share_push_url := regexp_replace(
    coalesce(v_web_push_url, ''),
    '/send-web-push/?$',
    '/send-content-share-push'
  );

  if nullif(btrim(v_internal_secret), '') is null
    or nullif(btrim(v_content_share_push_url), '') is null
    or v_content_share_push_url = v_web_push_url
  then
    raise warning 'Content share push dispatch skipped: Vault configuration is missing or invalid.';
    return new;
  end if;

  perform net.http_post(
    url := v_content_share_push_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-push-secret', v_internal_secret
    ),
    body := jsonb_build_object('contentShareId', new."ContentShareId"),
    timeout_milliseconds := 5000
  );

  return new;
exception
  when others then
    -- In-app sharing must remain successful even if push dispatch is unavailable.
    raise warning 'Content share push dispatch failed for ContentShareId %: %',
      new."ContentShareId",
      sqlerrm;
    return new;
end;
$$;

revoke all on function public."DispatchContentSharePush"() from public;

drop trigger if exists "TR_ContentShares_DispatchPush"
  on public."ContentShares";

create trigger "TR_ContentShares_DispatchPush"
after insert on public."ContentShares"
for each row
when (new."IsActive" = true)
execute function public."DispatchContentSharePush"();

