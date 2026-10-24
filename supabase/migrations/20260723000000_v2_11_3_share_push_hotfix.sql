-- Restore the helper permission required by ContentShares RLS.
grant execute
on function public."GetMySessionUserId"()
to authenticated;

-- FOLLOW_REQUEST_ACCEPTED is an existing in-app notification type. Queue it
-- through the same Web Push pipeline as the other follow notifications.
create or replace function public."QueueWebPushForNotification"()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions', 'vault'
as $function$
declare
  v_function_url text;
  v_function_secret text;
begin
  if new."IsActive" is distinct from true
    or new."NotificationTypeCode" not in (
      'FOLLOW_REQUEST',
      'FOLLOWED',
      'FOLLOW_REQUEST_ACCEPTED',
      'FOLLOWING_NOTE',
      'NOTE_REACTION_UP',
      'NOTE_REACTION_DOWN',
      'COLLECTION_COLLABORATOR_ADDED'
    ) then
    return new;
  end if;

  -- Reactions reuse an existing notification row when their state changes.
  -- Ignore unrelated updates such as IsRead / ReadDate changes.
  if tg_op = 'UPDATE'
    and new."NotificationTypeCode" is not distinct from old."NotificationTypeCode"
    and new."IsActive" is not distinct from old."IsActive"
    and new."CreatedDate" is not distinct from old."CreatedDate" then
    return new;
  end if;

  select decrypted_secret
  into v_function_url
  from vault.decrypted_secrets
  where name = 'web_push_function_url'
  limit 1;

  select decrypted_secret
  into v_function_secret
  from vault.decrypted_secrets
  where name = 'web_push_function_secret'
  limit 1;

  -- In-app notifications must continue working if push is unconfigured.
  if v_function_url is null or v_function_secret is null then
    return new;
  end if;

  perform net.http_post(
    url := v_function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-push-secret', v_function_secret
    ),
    body := jsonb_build_object('notificationId', new."NotificationId")
  );

  return new;
end;
$function$;

revoke all
on function public."QueueWebPushForNotification"()
from public, anon, authenticated;

grant execute
on function public."QueueWebPushForNotification"()
to postgres, service_role;
