-- 005: 관리자가 특정 궁사의 기록을 찾아보고 지우기 (순, 일, 주, 월, 전체)
-- 지우기 전에 앱이 같은 함수를 p_dry = true로 불러 몇 순이 지워지는지 먼저 보여 주고, 확인을 받은 뒤 다시 부른다.

-- 닉네임으로 궁사 찾기 (일부만 적어도 된다)
create or replace function public.admin_find_archers(p_admin text, p_query text)
returns table (nickname text, range_name text, hidden boolean, ends int, first_day date, last_day date)
language plpgsql stable security definer set search_path = public, extensions as $$
#variable_conflict use_column
begin
  perform _admin(p_admin);
  return query
    select a.nickname, a.range_name, a.hidden, count(e.id)::int, min(e.day), max(e.day)
    from public.archers a left join public.ends e on e.archer_id = a.id
    where p_query is not null and btrim(p_query) <> ''
      and a.nickname ilike '%' || replace(replace(replace(btrim(p_query), '\', '\\'), '%', '\%'), '_', '\_') || '%'
    group by a.id
    order by lower(a.nickname)
    limit 30;
end $$;

-- 한 궁사의 날마다 순 수와 관중 수 (최근 날부터)
create or replace function public.admin_archer_days(p_admin text, p_nickname text)
returns table (day date, ends int, hits int)
language plpgsql stable security definer set search_path = public, extensions as $$
#variable_conflict use_column
begin
  perform _admin(p_admin);
  return query
    select e.day, count(*)::int, sum((select count(*) from unnest(e.hits) x where x))::int
    from public.ends e join public.archers a on a.id = e.archer_id
    where lower(a.nickname) = lower(p_nickname)
    group by e.day
    order by e.day desc
    limit 400;
end $$;

-- 한 궁사의 하루 순들 (저장한 차례대로)
create or replace function public.admin_archer_day_ends(p_admin text, p_nickname text, p_day date)
returns table (id bigint, recorded_at timestamptz, hits boolean[])
language plpgsql stable security definer set search_path = public, extensions as $$
#variable_conflict use_column
begin
  perform _admin(p_admin);
  return query
    select e.id, e.recorded_at, e.hits
    from public.ends e join public.archers a on a.id = e.archer_id
    where lower(a.nickname) = lower(p_nickname) and e.day = p_day
    order by e.recorded_at, e.id;
end $$;

-- 기록 지우기. p_scope: 'end'(p_end_id 한 순), 'day', 'week'(월~일), 'month'(p_date가 속한 기간), 'all'(전체).
-- p_dry가 true면 지우지 않고 지워질 순 수만 돌려준다.
create or replace function public.admin_delete_ends(p_admin text, p_nickname text, p_scope text, p_date date default null, p_end_id bigint default null, p_dry boolean default true)
returns int
language plpgsql security definer set search_path = public, extensions as $$
declare
  aid uuid;
  d0 date;
  d1 date;
  n int;
begin
  perform _admin(p_admin);
  select a.id into aid from archers a where lower(a.nickname) = lower(p_nickname);
  if aid is null then raise exception 'no such archer'; end if;
  if p_scope = 'end' then
    if p_end_id is null then raise exception 'bad scope'; end if;
  elsif p_scope in ('day', 'week', 'month') then
    if p_date is null then raise exception 'bad scope'; end if;
    d0 := case p_scope when 'day' then p_date
      when 'week' then p_date - ((extract(isodow from p_date)::int) - 1)
      else date_trunc('month', p_date)::date end;
    d1 := case p_scope when 'day' then p_date
      when 'week' then p_date - ((extract(isodow from p_date)::int) - 1) + 6
      else (date_trunc('month', p_date) + interval '1 month - 1 day')::date end;
  elsif p_scope <> 'all' then
    raise exception 'bad scope';
  end if;

  if p_dry then
    select count(*)::int into n from ends e
    where e.archer_id = aid
      and (p_scope = 'all' or (p_scope = 'end' and e.id = p_end_id) or (d0 is not null and e.day between d0 and d1));
  else
    delete from ends e
    where e.archer_id = aid
      and (p_scope = 'all' or (p_scope = 'end' and e.id = p_end_id) or (d0 is not null and e.day between d0 and d1));
    get diagnostics n = row_count;
  end if;
  return n;
end $$;

grant execute on function public.admin_find_archers(text, text), public.admin_archer_days(text, text),
  public.admin_archer_day_ends(text, text, date), public.admin_delete_ends(text, text, text, date, bigint, boolean) to anon;

notify pgrst, 'reload schema';
