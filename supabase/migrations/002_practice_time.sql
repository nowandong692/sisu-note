-- 국궁록 서버 고치기 2: 습사 시간과 궁사 기록 보기
-- schema.sql을 이미 실행한 프로젝트에서 SQL Editor에 그대로 붙여 넣어 한 번 실행한다. (여러 번 실행해도 괜찮다)

-- 1) 순 올리기: 앱에서 순을 저장한 시각을 함께 받는다.
--    오늘(한국 시간) 안이고 지금보다 앞선 시각일 때만 그 시각을 쓰고, 아니면 서버 시각을 쓴다.
drop function if exists public.submit_end(text, text, boolean[]);
create or replace function public.submit_end(p_key text, p_client_id text, p_hits boolean[], p_recorded_at timestamptz default null) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare a uuid := _archer(p_key); t date := _today(); n int; r timestamptz := now();
begin
  if array_length(p_hits, 1) is distinct from 5 or array_position(p_hits, null) is not null then raise exception 'need 5 shots'; end if;
  if p_recorded_at is not null and p_recorded_at <= now() and (p_recorded_at at time zone 'Asia/Seoul')::date = t then r := p_recorded_at; end if;
  update ends set hits = p_hits where archer_id = a and client_id = p_client_id and day = t;
  if found then return; end if;
  if exists (select 1 from ends where archer_id = a and client_id = p_client_id) then return; end if; -- 지난 날짜 순
  select count(*) into n from ends where archer_id = a and day = t;
  if n >= _max_ends_per_day() then raise exception 'daily limit'; end if;
  insert into ends (archer_id, client_id, day, recorded_at, hits) values (a, p_client_id, t, r, p_hits);
end $$;

-- 2) 랭킹에서 궁사를 눌렀을 때: 그 기간에 올린 순마다 날짜, 저장 시각, 다섯 시의 관중 여부
create or replace function public.archer_ends(p_nickname text, p_period text, p_date date)
returns table (day date, recorded_at timestamptz, hits boolean[])
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
  )
  select e.day, e.recorded_at, e.hits
  from ends e join archers a on a.id = e.archer_id, span
  where lower(a.nickname) = lower(p_nickname) and e.day between span.d0 and span.d1
    and p_period in ('day', 'week', 'month')
  order by e.day, e.recorded_at
  limit 1500
$$;

grant execute on function public.submit_end(text, text, boolean[], timestamptz), public.archer_ends(text, text, date) to anon;
