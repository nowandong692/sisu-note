-- 015: 랭킹에 실력 등급(과녁 테두리)과 대표 칭호 보이기
-- * 등급은 앱이 이 기기의 기록(최근 30순의 15시 기준 평균)으로 계산해 1~5 숫자만 올린다. 1 나무, 2 무쇠, 3 청동, 4 백은, 5 황금.
-- * 대표 칭호는 업적 id(예: chomolgi, molgi3)만 올린다. 이름은 앱이 업적 목록에서 찾아 보인다. 아무 글이나 올리지 못하게 id 꼴만 받는다.
-- * period_totals가 돌려주는 열이 늘어나 함수를 지우고 다시 만든다. 예전 앱은 새 열을 무시하므로 그대로 동작한다.

alter table public.archers add column if not exists grade smallint;
alter table public.archers add column if not exists title text;
do $$ begin
  alter table public.archers add constraint grade_range check (grade is null or grade between 1 and 5);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.archers add constraint title_id check (title is null or title ~ '^[a-z0-9-]{1,24}$');
exception when duplicate_object then null; end $$;

-- 내 등급(1~5, 30순 전이면 null)과 대표 칭호 업적 id(없으면 null)
create or replace function public.set_badge(p_key text, p_grade int, p_title text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if p_grade is not null and (p_grade < 1 or p_grade > 5) then raise exception 'bad grade'; end if;
  if p_title is not null and p_title !~ '^[a-z0-9-]{1,24}$' then raise exception 'bad title'; end if;
  update archers set grade = p_grade, title = p_title where id = _archer(p_key);
end $$;

drop function if exists public.period_totals(text, date, text);
-- 숨긴 궁사는 랭킹에서 뺀다 (본인 화면에는 그대로 보인다)
create or replace function public.period_totals(p_period text, p_date date, p_key text default null)
returns table (nickname text, range_name text, dan int, ends int, hits int, seq boolean[], me boolean, grade int, title text)
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
         (p_key is not null and a.key_hash = digest(p_key, 'sha256')), a.grade::int, a.title
  from agg g join archers a on a.id = g.archer_id
  where p_period in ('day', 'week', 'month')
    and (not a.hidden or (p_key is not null and a.key_hash = digest(p_key, 'sha256')))
$$;

grant execute on function public.set_badge(text, int, text), public.period_totals(text, date, text) to anon;

notify pgrst, 'reload schema';
