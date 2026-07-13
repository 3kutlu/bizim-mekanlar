-- =========================================================
-- EMAIL DOMAIN POLICY + SIGNUP ABUSE PROTECTION
-- =========================================================

create table if not exists public."EmailDomains"
(
    "EmailDomainId" bigint generated always as identity primary key,
    "Name" varchar(255) not null,
    "AllowedEmailDomain" boolean not null,
    "SourceCode" varchar(30) not null default 'MANUAL',
    "LastCheckedDate" timestamptz null,
    "IsActive" boolean not null default true,
    "CreatedDate" timestamptz not null default now(),
    "UpdatedDate" timestamptz null,

    constraint "UQ_EmailDomains_Name" unique ("Name"),
    constraint "CK_EmailDomains_Name" check
    (
        "Name" = lower(btrim("Name"))
        and position('@' in "Name") = 0
        and position('.' in "Name") > 0
    ),
    constraint "CK_EmailDomains_SourceCode" check
    (
        "SourceCode" in ('MANUAL', 'DEBOUNCE')
    )
);

insert into public."EmailDomains"
(
    "Name",
    "AllowedEmailDomain",
    "SourceCode",
    "LastCheckedDate",
    "IsActive"
)
values
    ('gmail.com', true, 'MANUAL', now(), true),
    ('googlemail.com', true, 'MANUAL', now(), true),
    ('google.com', true, 'MANUAL', now(), true),
    ('icloud.com', true, 'MANUAL', now(), true),
    ('me.com', true, 'MANUAL', now(), true),
    ('mac.com', true, 'MANUAL', now(), true),
    ('yahoo.com', true, 'MANUAL', now(), true),
    ('yahoo.com.tr', true, 'MANUAL', now(), true),
    ('hotmail.com', true, 'MANUAL', now(), true),
    ('hotmail.com.tr', true, 'MANUAL', now(), true),
    ('outlook.com', true, 'MANUAL', now(), true),
    ('live.com', true, 'MANUAL', now(), true),
    ('msn.com', true, 'MANUAL', now(), true),
    ('proton.me', true, 'MANUAL', now(), true),
    ('protonmail.com', true, 'MANUAL', now(), true),
    ('yandex.com', true, 'MANUAL', now(), true),
    ('yandex.com.tr', true, 'MANUAL', now(), true),
    ('ezimb.com', false, 'MANUAL', now(), true)
on conflict ("Name")
do update set
    "AllowedEmailDomain" = excluded."AllowedEmailDomain",
    "SourceCode" = excluded."SourceCode",
    "LastCheckedDate" = excluded."LastCheckedDate",
    "IsActive" = true,
    "UpdatedDate" = now();


create table if not exists public."SignupSecurityEvents"
(
    "SignupSecurityEventId" bigint generated always as identity primary key,
    "EventTypeCode" varchar(40) not null,
    "EmailDomainId" bigint null,
    "DeviceHash" char(64) null,
    "IpHash" char(64) null,
    "BlockedUntil" timestamptz null,
    "CreatedDate" timestamptz not null default now(),

    constraint "FK_SignupSecurityEvents_EmailDomain"
        foreign key ("EmailDomainId")
        references public."EmailDomains" ("EmailDomainId"),

    constraint "CK_SignupSecurityEvents_EventTypeCode" check
    (
        "EventTypeCode" in
        (
            'DISALLOWED_EMAIL',
            'DEVICE_BLOCK',
            'IP_BLOCK'
        )
    ),

    constraint "CK_SignupSecurityEvents_HashPresent" check
    (
        "DeviceHash" is not null or "IpHash" is not null
    )
);

create index if not exists "IX_SignupSecurityEvents_DeviceHash_CreatedDate"
on public."SignupSecurityEvents" ("DeviceHash", "CreatedDate" desc)
where "DeviceHash" is not null;

create index if not exists "IX_SignupSecurityEvents_IpHash_CreatedDate"
on public."SignupSecurityEvents" ("IpHash", "CreatedDate" desc)
where "IpHash" is not null;

create index if not exists "IX_SignupSecurityEvents_BlockedUntil"
on public."SignupSecurityEvents" ("BlockedUntil" desc)
where "BlockedUntil" is not null;


-- ---------------------------------------------------------
-- Returns the longest currently active device/IP signup block.
-- ---------------------------------------------------------
create or replace function public."GetSignupSecurityBlock"
(
    p_device_hash text,
    p_ip_hash text
)
returns table
(
    "BlockTypeCode" varchar,
    "BlockedUntil" timestamptz
)
language sql
security definer
set search_path = public
as $$
    select
        case
            when e."EventTypeCode" = 'DEVICE_BLOCK' then 'DEVICE'
            when e."EventTypeCode" = 'IP_BLOCK' then 'IP'
            else null
        end::varchar as "BlockTypeCode",
        e."BlockedUntil"
    from public."SignupSecurityEvents" e
    where e."BlockedUntil" > now()
      and
      (
          (e."EventTypeCode" = 'DEVICE_BLOCK'
           and nullif(btrim(p_device_hash), '') is not null
           and e."DeviceHash" = btrim(p_device_hash))
          or
          (e."EventTypeCode" = 'IP_BLOCK'
           and nullif(btrim(p_ip_hash), '') is not null
           and e."IpHash" = btrim(p_ip_hash))
      )
    order by e."BlockedUntil" desc
    limit 1;
$$;


-- ---------------------------------------------------------
-- Records a rejected signup and applies progressive blocks.
-- 1st rejected domain: warning only
-- 2nd rejected domain in 30 days: device blocked for 24 hours
-- 3rd+ rejected domain in 30 days: device blocked for 7 days
-- 5 rejected attempts from one IP in 1 hour: IP blocked for 1 hour
-- ---------------------------------------------------------
create or replace function public."RegisterRejectedSignupEmail"
(
    p_domain_name text,
    p_device_hash text,
    p_ip_hash text
)
returns table
(
    "AttemptCount" integer,
    "BlockTypeCode" varchar,
    "BlockedUntil" timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_domain_name text := lower(btrim(coalesce(p_domain_name, '')));
    v_device_hash text := nullif(btrim(coalesce(p_device_hash, '')), '');
    v_ip_hash text := nullif(btrim(coalesce(p_ip_hash, '')), '');
    v_email_domain_id bigint;
    v_device_attempt_count integer := 0;
    v_ip_attempt_count integer := 0;
    v_device_blocked_until timestamptz;
    v_ip_blocked_until timestamptz;
begin
    if v_device_hash is null and v_ip_hash is null then
        raise exception 'Cihaz veya ağ güvenlik bilgisi bulunamadı.';
    end if;

    select d."EmailDomainId"
      into v_email_domain_id
    from public."EmailDomains" d
    where d."Name" = v_domain_name
      and d."IsActive" = true
    limit 1;

    insert into public."SignupSecurityEvents"
    (
        "EventTypeCode",
        "EmailDomainId",
        "DeviceHash",
        "IpHash"
    )
    values
    (
        'DISALLOWED_EMAIL',
        v_email_domain_id,
        v_device_hash,
        v_ip_hash
    );

    if v_device_hash is not null then
        select count(*)::integer
          into v_device_attempt_count
        from public."SignupSecurityEvents" e
        where e."EventTypeCode" = 'DISALLOWED_EMAIL'
          and e."DeviceHash" = v_device_hash
          and e."CreatedDate" >= now() - interval '30 days';

        if v_device_attempt_count = 2 then
            v_device_blocked_until := now() + interval '24 hours';
        elsif v_device_attempt_count >= 3 then
            v_device_blocked_until := now() + interval '7 days';
        end if;

        if v_device_blocked_until is not null then
            insert into public."SignupSecurityEvents"
            (
                "EventTypeCode",
                "EmailDomainId",
                "DeviceHash",
                "IpHash",
                "BlockedUntil"
            )
            values
            (
                'DEVICE_BLOCK',
                v_email_domain_id,
                v_device_hash,
                v_ip_hash,
                v_device_blocked_until
            );
        end if;
    end if;

    if v_ip_hash is not null then
        select count(*)::integer
          into v_ip_attempt_count
        from public."SignupSecurityEvents" e
        where e."EventTypeCode" = 'DISALLOWED_EMAIL'
          and e."IpHash" = v_ip_hash
          and e."CreatedDate" >= now() - interval '1 hour';

        if v_ip_attempt_count >= 5 then
            v_ip_blocked_until := now() + interval '1 hour';

            insert into public."SignupSecurityEvents"
            (
                "EventTypeCode",
                "EmailDomainId",
                "DeviceHash",
                "IpHash",
                "BlockedUntil"
            )
            values
            (
                'IP_BLOCK',
                v_email_domain_id,
                v_device_hash,
                v_ip_hash,
                v_ip_blocked_until
            );
        end if;
    end if;

    if v_ip_blocked_until is not null
       and (v_device_blocked_until is null or v_ip_blocked_until > v_device_blocked_until) then
        return query
        select v_device_attempt_count, 'IP'::varchar, v_ip_blocked_until;
        return;
    end if;

    if v_device_blocked_until is not null then
        return query
        select v_device_attempt_count, 'DEVICE'::varchar, v_device_blocked_until;
        return;
    end if;

    return query
    select v_device_attempt_count, null::varchar, null::timestamptz;
end;
$$;


-- ---------------------------------------------------------
-- Defense in depth for users who bypass the frontend/Edge Function
-- and call Supabase Auth signup directly.
-- Enable this function from Authentication -> Hooks -> Before User Created.
-- ---------------------------------------------------------
create or replace function public."BeforeUserCreatedCheckEmailDomain"
(
    event jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
    v_email text := lower(btrim(event -> 'user' ->> 'email'));
    v_domain_name text;
begin
    if v_email is null or v_email = '' then
        return '{}'::jsonb;
    end if;

    v_domain_name := lower(btrim(split_part(v_email, '@', 2)));

    if v_domain_name = '' then
        return jsonb_build_object
        (
            'error',
            jsonb_build_object
            (
                'http_code', 400,
                'message', 'Geçerli bir e-posta adresi yazmalısın.'
            )
        );
    end if;

    if exists
    (
        select 1
        from public."EmailDomains" d
        where d."Name" = v_domain_name
          and d."AllowedEmailDomain" = false
          and d."IsActive" = true
    ) then
        return jsonb_build_object
        (
            'error',
            jsonb_build_object
            (
                'http_code', 403,
                'message', 'Bu e-posta adresiyle kayıt olunamaz.'
            )
        );
    end if;

    return '{}'::jsonb;
end;
$$;


alter table public."EmailDomains" enable row level security;
alter table public."SignupSecurityEvents" enable row level security;

revoke all on table public."EmailDomains" from anon, authenticated, public;
revoke all on table public."SignupSecurityEvents" from anon, authenticated, public;

revoke execute on function public."GetSignupSecurityBlock"(text, text)
from anon, authenticated, public;

revoke execute on function public."RegisterRejectedSignupEmail"(text, text, text)
from anon, authenticated, public;

revoke execute on function public."BeforeUserCreatedCheckEmailDomain"(jsonb)
from anon, authenticated, public;

grant execute on function public."GetSignupSecurityBlock"(text, text)
to service_role;

grant execute on function public."RegisterRejectedSignupEmail"(text, text, text)
to service_role;

grant usage on schema public to supabase_auth_admin;
grant select on table public."EmailDomains" to supabase_auth_admin;
grant execute on function public."BeforeUserCreatedCheckEmailDomain"(jsonb)
to supabase_auth_admin;

grant select, insert, update on table public."EmailDomains" to service_role;
grant usage, select on sequence public."EmailDomains_EmailDomainId_seq" to service_role;
