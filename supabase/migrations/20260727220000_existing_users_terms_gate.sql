begin;

create or replace function public."HasAcceptedCurrentTerms"(
  p_terms_version varchar
)
returns boolean
language plpgsql
stable
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

  return exists (
    select 1
    from public."Users" user_row
    where user_row."AuthUserId" = auth.uid()
      and user_row."IsActive" = true
      and user_row."TermsVersion" = v_terms_version
      and user_row."TermsAcceptedDate" is not null
  );
end;
$$;

revoke all on function public."HasAcceptedCurrentTerms"(varchar) from public;
grant execute on function public."HasAcceptedCurrentTerms"(varchar)
  to authenticated;

commit;
