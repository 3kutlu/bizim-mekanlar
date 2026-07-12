-- v2.8.1 - Content share notification polish and push preference

alter table public."UserWebPushPreferences"
  add column if not exists "ContentShareEnabled" boolean not null default true;

comment on column public."UserWebPushPreferences"."ContentShareEnabled" is
  'Controls Web Push delivery for in-app content shares. In-app shares remain visible.';

create or replace function public."GetMyContentSharePushPreference"()
returns table (
  "ContentShareEnabled" boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id integer;
begin
  select u."UserId"
    into v_user_id
  from public."Users" u
  where u."AuthUserId" = auth.uid()
  limit 1;

  if v_user_id is null then
    raise exception 'Aktif kullanıcı profili bulunamadı.';
  end if;

  return query
  select coalesce(
    (
      select preferences."ContentShareEnabled"
      from public."UserWebPushPreferences" preferences
      where preferences."UserId" = v_user_id
      limit 1
    ),
    true
  )::boolean;
end;
$$;

create or replace function public."UpdateMyContentSharePushPreference"(
  p_content_share_enabled boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id integer;
begin
  if p_content_share_enabled is null then
    raise exception 'Bildirim tercihi boş olamaz.';
  end if;

  select u."UserId"
    into v_user_id
  from public."Users" u
  where u."AuthUserId" = auth.uid()
  limit 1;

  if v_user_id is null then
    raise exception 'Aktif kullanıcı profili bulunamadı.';
  end if;

  update public."UserWebPushPreferences"
  set "ContentShareEnabled" = p_content_share_enabled
  where "UserId" = v_user_id;

  if not found then
    perform public."UpdateMyWebPushNotificationPreferences"(
      true,
      true,
      true,
      true,
      true
    );

    update public."UserWebPushPreferences"
    set "ContentShareEnabled" = p_content_share_enabled
    where "UserId" = v_user_id;
  end if;
end;
$$;

revoke all on function public."GetMyContentSharePushPreference"() from public;
revoke all on function public."UpdateMyContentSharePushPreference"(boolean) from public;

grant execute on function public."GetMyContentSharePushPreference"() to authenticated;
grant execute on function public."UpdateMyContentSharePushPreference"(boolean) to authenticated;
