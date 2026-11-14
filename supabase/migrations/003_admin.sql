-- 003: 관리자 페이지 (신고 보기, 랭킹에서 숨기기, 닉네임 초기화, 기록 삭제, 현황)
--
-- 관리자 코드는 저장소나 앱에 넣지 않는다. 이 파일을 실행한 뒤, SQL Editor에서 직접 한 번 등록한다:
--   insert into public.admins (key_hash) values (extensions.digest('여기에-긴-관리자-코드', 'sha256'));
-- 앱의 설정 탭 맨 아래 "관리자"에서 같은 코드를 넣으면 열린다. 서버에는 코드의 해시만 남는다.
-- 코드를 바꾸려면 delete from public.admins; 후 다시 insert 한다.

create table if not exists public.admins (
  key_hash bytea primary key,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;

-- 랭킹에서 숨긴 궁사 (본인에게는 계속 보인다)
alter table public.archers add column if not exists hidden boolean not null default false;

create or replace function public._admin(p_admin text) returns void
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if p_admin is null or char_length(p_admin) < 12
     or not exists (select 1 from admins where key_hash = digest(p_admin, 'sha256')) then
    raise exception 'not admin';
  end if;
end $$;

-- 관리자 코드 확인 (맞으면 true, 틀리면 오류)
create or replace function public.admin_check(p_admin text) returns boolean
language plpgsql stable security definer set search_path = public, extensions as $$
begin perform _admin(p_admin); return true; end $$;

-- 현황: 참여자, 숨긴 궁사, 오늘·이번 주 순 수, 신고 수
create or replace function public.admin_overview(p_admin text)
returns table (archers int, hidden int, ends_today int, ends_week int, active_week int, reports int)
language plpgsql stable security definer set search_path = public, extensions as $$
#variable_conflict use_column
declare t date := _today();
begin
  perform _admin(p_admin);
  return query select
    (select count(*)::int from public.archers),
    (select count(*)::int from public.archers where public.archers.hidden),
    (select count(*)::int from ends where day = t),
    (select count(*)::int from ends where day > t - 7),
    (select count(distinct archer_id)::int from ends where day > t - 7),
    (select count(*)::int from public.reports);
end $$;

-- 신고 목록: 신고마다 대상 닉네임, 소속, 숨김 여부, 그 궁사가 받은 신고 수
create or replace function public.admin_reports(p_admin text)
returns table (id bigint, nickname text, range_name text, hidden boolean, reason text, created_at timestamptz, total int)
language plpgsql stable security definer set search_path = public, extensions as $$
#variable_conflict use_column
begin
  perform _admin(p_admin);
  return query
    select r.id, a.nickname, a.range_name, a.hidden, r.reason, r.created_at,
           (count(*) over (partition by r.target))::int
    from public.reports r join public.archers a on a.id = r.target
    order by r.created_at desc
    limit 200;
end $$;

-- 의심 기록: 최근 p_days일 동안 하루 순 수가 많거나(30순 이상) 순 사이가 지나치게 짧은(평균 1분 미만) 날
create or replace function public.admin_suspects(p_admin text, p_days int default 14)
returns table (nickname text, range_name text, hidden boolean, day date, ends int, hits int, minutes int)
language plpgsql stable security definer set search_path = public, extensions as $$
#variable_conflict use_column
begin
  perform _admin(p_admin);
  return query
    select a.nickname, a.range_name, a.hidden, d.day, d.n, d.h, d.m
    from (
      select e.archer_id, e.day, count(*)::int as n,
             sum((select count(*) from unnest(e.hits) x where x))::int as h,
             (extract(epoch from max(e.recorded_at) - min(e.recorded_at)) / 60)::int as m
      from ends e where e.day > _today() - greatest(1, least(p_days, 60))
      group by e.archer_id, e.day
    ) d join public.archers a on a.id = d.archer_id
    where d.n >= 30 or (d.n >= 5 and d.m < d.n)
    order by d.day desc, d.n desc
    limit 200;
end $$;

create or replace function public.admin_set_hidden(p_admin text, p_nickname text, p_hidden boolean) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform _admin(p_admin);
  update archers set hidden = p_hidden where lower(nickname) = lower(p_nickname);
end $$;

-- 부적절한 닉네임을 "궁사1a2b" 같은 이름으로 바꾼다
create or replace function public.admin_reset_nickname(p_admin text, p_nickname text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform _admin(p_admin);
  update archers set nickname = '궁사' || left(replace(id::text, '-', ''), 6) where lower(nickname) = lower(p_nickname);
end $$;

-- 그 궁사의 하루 기록 삭제 (부정 기록)
create or replace function public.admin_delete_day(p_admin text, p_nickname text, p_day date) returns int
language plpgsql security definer set search_path = public, extensions as $$
declare n int;
begin
  perform _admin(p_admin);
  delete from ends e using archers a
  where a.id = e.archer_id and lower(a.nickname) = lower(p_nickname) and e.day = p_day;
  get diagnostics n = row_count;
  return n;
end $$;

-- 처리한 신고 지우기
create or replace function public.admin_dismiss_report(p_admin text, p_id bigint) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform _admin(p_admin);
  delete from reports where id = p_id;
end $$;

-- 숨긴 궁사는 랭킹과 기록 보기에서 뺀다 (본인 화면에는 그대로 보인다)
create or replace function public.period_totals(p_period text, p_date date, p_key text default null)
returns table (nickname text, range_name text, ends int, hits int, seq boolean[], me boolean)
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
  select a.nickname, a.range_name, g.shots / 5, g.hits, g.seq,
         (p_key is not null and a.key_hash = digest(p_key, 'sha256'))
  from agg g join archers a on a.id = g.archer_id
  where p_period in ('day', 'week', 'month')
    and (not a.hidden or (p_key is not null and a.key_hash = digest(p_key, 'sha256')))
$$;

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
  where lower(a.nickname) = lower(p_nickname) and not a.hidden and e.day between span.d0 and span.d1
    and p_period in ('day', 'week', 'month')
  order by e.day, e.recorded_at
  limit 1500
$$;

revoke all on function public._admin(text) from public, anon, authenticated;
grant execute on function public.admin_check(text), public.admin_overview(text), public.admin_reports(text),
  public.admin_suspects(text, int), public.admin_set_hidden(text, text, boolean), public.admin_reset_nickname(text, text),
  public.admin_delete_day(text, text, date), public.admin_dismiss_report(text, bigint) to anon;

notify pgrst, 'reload schema';
