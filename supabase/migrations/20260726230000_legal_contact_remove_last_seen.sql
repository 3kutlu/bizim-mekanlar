begin;

-- LastSeenDate is intentionally removed from both the application and database.
drop function if exists public."TouchMyLastSeen"();

alter table public."Users"
  drop column if exists "LastSeenDate",
  add column if not exists "TermsVersion" varchar(20) null,
  add column if not exists "TermsAcceptedDate" timestamptz null;

create or replace function public."AcceptMyTerms"(
  p_terms_version varchar
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_terms_version varchar(20) := trim(coalesce(p_terms_version, ''));
begin
  if auth.uid() is null then
    raise exception using message = 'AUTH_REQUIRED';
  end if;

  if v_terms_version = ''
     or length(v_terms_version) > 20
     or v_terms_version !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    raise exception using message = 'INVALID_TERMS_VERSION';
  end if;

  update public."Users"
  set
    "TermsVersion" = v_terms_version,
    "TermsAcceptedDate" = now(),
    "UpdatedDate" = now()
  where "AuthUserId" = auth.uid()
    and "IsActive" = true;

  if not found then
    raise exception using message = 'USER_NOT_FOUND';
  end if;
end;
$$;

revoke all on function public."AcceptMyTerms"(varchar) from public;
grant execute on function public."AcceptMyTerms"(varchar) to authenticated;

create table if not exists public."ContactRequests" (
  "ContactRequestId" bigint generated always as identity primary key,
  "Email" varchar(320) not null,
  "RequestType" varchar(20) not null,
  "Subject" varchar(120) not null,
  "Message" varchar(2000) not null,
  "DeviceTokenHash" varchar(32) not null,
  "IsResolved" boolean not null default false,
  "ResolvedDate" timestamptz null,
  "CreatedDate" timestamptz not null default now(),
  constraint "CK_ContactRequests_RequestType"
    check ("RequestType" in ('GENERAL', 'BUG', 'CONTENT', 'KVKK', 'SECURITY'))
);

create index if not exists "IX_ContactRequests_DeviceTokenHash_CreatedDate"
  on public."ContactRequests" ("DeviceTokenHash", "CreatedDate" desc);

create index if not exists "IX_ContactRequests_IsResolved_CreatedDate"
  on public."ContactRequests" ("IsResolved", "CreatedDate" desc);

alter table public."ContactRequests" enable row level security;
revoke all on table public."ContactRequests" from anon, authenticated;

create or replace function public."CreateContactRequest"(
  p_email text,
  p_request_type text,
  p_subject text,
  p_message text,
  p_device_token text
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_request_type text := upper(trim(coalesce(p_request_type, '')));
  v_subject text := trim(coalesce(p_subject, ''));
  v_message text := trim(coalesce(p_message, ''));
  v_device_token text := trim(coalesce(p_device_token, ''));
  v_device_hash varchar(32);
  v_request_id bigint;
begin
  if length(v_email) > 320
     or v_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception using message = 'INVALID_EMAIL';
  end if;

  if v_request_type not in ('GENERAL', 'BUG', 'CONTENT', 'KVKK', 'SECURITY') then
    raise exception using message = 'INVALID_REQUEST_TYPE';
  end if;

  if length(v_subject) < 3 or length(v_subject) > 120 then
    raise exception using message = 'INVALID_SUBJECT';
  end if;

  if length(v_message) < 10 or length(v_message) > 2000 then
    raise exception using message = 'INVALID_MESSAGE';
  end if;

  if length(v_device_token) < 16 or length(v_device_token) > 128 then
    raise exception using message = 'INVALID_DEVICE_TOKEN';
  end if;

  v_device_hash := md5(v_device_token);

  if (
    select count(*)
    from public."ContactRequests" request
    where request."DeviceTokenHash" = v_device_hash
      and request."CreatedDate" >= now() - interval '1 hour'
  ) >= 3 then
    raise exception using message = 'CONTACT_RATE_LIMIT';
  end if;

  insert into public."ContactRequests" (
    "Email",
    "RequestType",
    "Subject",
    "Message",
    "DeviceTokenHash"
  )
  values (
    v_email,
    v_request_type,
    v_subject,
    v_message,
    v_device_hash
  )
  returning "ContactRequestId" into v_request_id;

  return v_request_id;
end;
$$;

revoke all on function public."CreateContactRequest"(text, text, text, text, text) from public;
grant execute on function public."CreateContactRequest"(text, text, text, text, text)
  to anon, authenticated;

commit;
