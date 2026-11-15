-- 004: 랭킹에 단 보이기
-- 앱 설정의 "내 단"에서 가장 높은 단(1~9) 하나만 올린다. 어느 기관의 단인지는 올리지 않는다.
-- period_totals가 돌려주는 열이 늘어나 함수를 지우고 다시 만든다.

alter table public.archers add column if not exists dan smallint;
do $$ begin
  alter table public.archers add constraint dan_range check (dan is null or dan between 1 and 9);
exception when duplicate_object then null; end $$;

-- 내 단 (1~9, 없으면 null). 여러 기관 단이 있으면 앱이 가장 높은 단만 보낸다.
create or replace function public.set_dan(p_key text, p_dan int) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if p_dan is not null and (p_dan < 1 or p_dan > 9) then raise exception 'bad dan'; end if;
  update archers set dan = p_dan where id = _archer(p_key);
end $$;

drop function if exists public.period_totals(text, date, text);
-- 숨긴 궁사는 랭킹에서 뺀다 (본인 화면에는 그대로 보인다)
create or replace function public.period_totals(p_period text, p_date date, p_key text default null)
returns table (nickname text, range_name text, dan int, ends int, hits int, seq boolean[], me boolean)
language sql stable security definer set search_path = public, extensions as $$
  with span as (
    select case p_period
      when 'day' then p_date
      when 'week' then p_date - ((extract(isodow from p_date)::int) - 1)
      else date_trunc('month', p_date)::date end as d0,
    case p_period
      when 'day' then p_date
      when 'week' then p_date - ((extract(isodow from p_date)::int) - 1) + 6
      else (date_trunc('month', p_date) + interval '1 month - 1 day')::date end as d1
  ), picked as (
    select e.archer_id, e.hits, e.day, e.recorded_at from ends e, span where e.day between span.d0 and span.d1
  ), agg as (
    select archer_id, count(*)::int as shots, (count(*) filter (where h))::int as hits,
      (array_agg(h order by day, recorded_at, i))[1:50] as seq
    from picked, unnest(hits) with ordinality as u(h, i)
    group by archer_id
  )
  select a.nickname, a.range_name, a.dan::int, g.shots / 5, g.hits, g.seq,
         (p_key is not null and a.key_hash = digest(p_key, 'sha256'))
  from agg g join archers a on a.id = g.archer_id
  where p_period in ('day', 'week', 'month')
    and (not a.hidden or (p_key is not null and a.key_hash = digest(p_key, 'sha256')))
$$;

grant execute on function public.set_dan(text, int), public.period_totals(text, date, text) to anon;

notify pgrst, 'reload schema';
