-- 국궁록 온라인 랭킹 서버 구조 (Supabase SQL Editor에 그대로 붙여 넣어 실행)
--
-- 개인정보 최소화 원칙
--  * 로그인 없음. 앱이 만든 무작위 열쇠(= 복구 코드)의 SHA-256 해시만 저장한다. 열쇠 원문은 서버에 없다.
--  * 저장하는 것: 닉네임, (원하면) 활터 이름, 순마다 서버 기준 날짜, 저장 시각과 다섯 시의 관중 여부.
--  * 메모와 태그는 궁사가 "공개"로 고른 순만 올린다 (shared_memos). 장비, 위치, 날씨는 올리지 않는다.
--
-- 보안 원칙
--  * 모든 테이블에 RLS를 켜고 정책을 하나도 두지 않는다 → anon 키로는 테이블을 직접 읽지도 쓰지도 못한다.
--  * 앱은 아래 함수(RPC)만 부를 수 있다. 함수가 열쇠를 확인한 뒤 그 궁사의 기록만 고친다.
--  * 순의 날짜는 앱이 보낸 값이 아니라 서버 시각(한국 시간)으로 정한다. 지난 날짜 순은 고치거나 지울 수 없다.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.archers (
  id uuid primary key default gen_random_uuid(),
  key_hash bytea not null unique,
  nickname text not null,
  range_name text,
  -- 관리자가 랭킹에서 숨긴 궁사 (본인에게는 보인다)
  hidden boolean not null default false,
  -- 가장 높은 단 (1~9). 어느 기관 단인지는 저장하지 않는다
  dan smallint,
  created_at timestamptz not null default now(),
  constraint nickname_len check (char_length(nickname) between 1 and 12),
  constraint range_len check (range_name is null or char_length(range_name) <= 30),
  constraint dan_range check (dan is null or dan between 1 and 9)
);
create unique index if not exists archers_nickname_uq on public.archers (lower(nickname));

create table if not exists public.ends (
  id bigint generated always as identity primary key,
  archer_id uuid not null references public.archers (id) on delete cascade,
  client_id text not null,
  day date not null,
  recorded_at timestamptz not null default now(),
  hits boolean[] not null,
  constraint five_shots check (array_length(hits, 1) = 5),
  constraint client_id_len check (char_length(client_id) <= 64),
  unique (archer_id, client_id)
);
create index if not exists ends_day_idx on public.ends (day);

create table if not exists public.reports (
  id bigint generated always as identity primary key,
  target uuid not null references public.archers (id) on delete cascade,
  reason text not null check (char_length(reason) <= 200),
  created_at timestamptz not null default now()
);

alter table public.archers enable row level security;
alter table public.ends enable row level security;
alter table public.reports enable row level security;
revoke all on public.archers, public.ends, public.reports from anon, authenticated;

-- 하루에 올릴 수 있는 최대 순 수 (부풀리기 방지용 상식적인 한도)
create or replace function public._max_ends_per_day() returns int language sql immutable as $$ select 40 $$;

create or replace function public._today() returns date language sql stable as $$
  select (now() at time zone 'Asia/Seoul')::date
$$;

-- 열쇠로 궁사 찾기. 열쇠가 너무 짧거나 맞는 궁사가 없으면 오류.
create or replace function public._archer(p_key text) returns uuid
language plpgsql stable security definer set search_path = public, extensions as $$
declare a uuid;
begin
  if p_key is null or char_length(p_key) < 20 then raise exception 'bad key'; end if;
  select id into a from archers where key_hash = digest(p_key, 'sha256');
  if a is null then raise exception 'unknown key'; end if;
  return a;
end $$;

-- 닉네임 다듬기: 앞뒤 공백 지우기, 겹친 공백 한 칸으로, 한글 자모 조합 맞추기 (앱의 cleanNickname과 같은 규칙)
create or replace function public._clean_nick(p text) returns text
language sql immutable set search_path = public as $$
  select regexp_replace(btrim(normalize(coalesce(p, ''), NFC)), '\s+', ' ', 'g')
$$;

-- 이 닉네임을 쓸 수 있는가 (입력하는 동안 앱이 물어본다). p_key를 주면 내 닉네임은 쓸 수 있는 것으로 본다
create or replace function public.nickname_available(p_nickname text, p_key text default null) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select char_length(_clean_nick(p_nickname)) between 1 and 12
     and not exists (
       select 1 from archers
       where lower(nickname) = lower(_clean_nick(p_nickname))
         and (p_key is null or key_hash <> digest(p_key, 'sha256')))
$$;

-- 처음 참여: 열쇠와 닉네임 등록
create or replace function public.register(p_key text, p_nickname text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if p_key is null or char_length(p_key) < 20 then raise exception 'bad key'; end if;
  insert into archers (key_hash, nickname) values (digest(p_key, 'sha256'), _clean_nick(p_nickname));
exception when unique_violation then
  raise exception 'nickname taken';
end $$;

-- 내 단 (1~9, 없으면 null). 여러 기관 단이 있으면 앱이 가장 높은 단만 보낸다.
create or replace function public.set_dan(p_key text, p_dan int) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if p_dan is not null and (p_dan < 1 or p_dan > 9) then raise exception 'bad dan'; end if;
  update archers set dan = p_dan where id = _archer(p_key);
end $$;

-- 복구 코드 확인 (새 휴대폰에서): 맞으면 닉네임을 돌려준다
create or replace function public.whoami(p_key text) returns table (nickname text, range_name text)
language sql stable security definer set search_path = public, extensions as $$
  select nickname, range_name from archers where key_hash = digest(p_key, 'sha256')
$$;

create or replace function public.set_profile(p_key text, p_nickname text, p_range_name text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  update archers set nickname = _clean_nick(p_nickname), range_name = nullif(btrim(p_range_name), '')
  where id = _archer(p_key);
exception when unique_violation then
  raise exception 'nickname taken';
end $$;

-- 순 올리기·고치기. 오늘(한국 시간) 순만 받고, 지난 날짜 순은 고치지 않는다.
-- 앱이 보낸 저장 시각은 오늘 안이고 지금보다 앞설 때만 쓴다 (습사 시간 계산용).
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

create or replace function public.delete_end(p_key text, p_client_id text) returns void
language sql security definer set search_path = public, extensions as $$
  delete from ends where archer_id = _archer(p_key) and client_id = p_client_id and day = _today()
$$;

-- 탈퇴: 그 궁사의 모든 서버 기록 삭제
create or replace function public.delete_me(p_key text) returns void
language sql security definer set search_path = public, extensions as $$
  delete from archers where id = _archer(p_key)
$$;

-- 기간 집계: 'day' | 'week' | 'month', 기준 날짜. 궁사별 순 수, 관중 수, 선다시수용 앞 50시.
-- 순위·시상은 앱이 같은 규칙(src/domain/ranking.ts)으로 매긴다. 궁사 id 대신 닉네임만 내보낸다.
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

-- 랭킹에서 궁사를 눌렀을 때: 그 기간에 올린 순마다 날짜, 저장 시각, 다섯 시의 관중 여부
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

create or replace function public.report(p_nickname text, p_reason text) returns void
language sql security definer set search_path = public, extensions as $$
  insert into reports (target, reason) select id, left(p_reason, 200) from archers where lower(nickname) = lower(p_nickname)
$$;

revoke all on function public._archer(text), public._today(), public._max_ends_per_day(), public._clean_nick(text) from public, anon, authenticated;
grant execute on function public.nickname_available(text, text), public.register(text, text), public.whoami(text), public.set_profile(text, text, text), public.set_dan(text, int),
  public.submit_end(text, text, boolean[], timestamptz), public.delete_end(text, text), public.delete_me(text),
  public.period_totals(text, date, text), public.archer_ends(text, text, date), public.report(text, text) to anon;

-- 관리자 (003_admin.sql). 관리자 코드는 저장소에 넣지 않고 SQL Editor에서 직접 등록한다:
--   insert into public.admins (key_hash) values (extensions.digest('긴-관리자-코드', 'sha256'));
create table if not exists public.admins (
  key_hash bytea primary key,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;


create or replace function public._admin(p_admin text) returns void
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if p_admin is null or char_length(p_admin) < 20
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

revoke all on function public._admin(text) from public, anon, authenticated;
grant execute on function public.admin_check(text), public.admin_overview(text), public.admin_reports(text),
  public.admin_suspects(text, int), public.admin_set_hidden(text, text, boolean), public.admin_reset_nickname(text, text),
  public.admin_delete_day(text, text, date), public.admin_dismiss_report(text, bigint) to anon;

-- 관리자: 궁사 기록 찾아보기와 지우기 (005)
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

-- 순 메모 공개 (007)

create table if not exists public.shared_memos (
  id bigint generated always as identity primary key,
  archer_id uuid not null references public.archers (id) on delete cascade,
  client_id text not null,
  day date not null,
  end_no smallint,
  hits boolean[] not null,
  tags text[] not null default '{}',
  memo text not null default '',
  scope text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sm_scope check (scope in ('all', 'club')),
  constraint sm_five check (array_length(hits, 1) = 5),
  constraint sm_memo_len check (char_length(memo) <= 500),
  constraint sm_tags_n check (cardinality(tags) <= 10),
  constraint sm_client_len check (char_length(client_id) <= 64),
  constraint sm_end_no check (end_no is null or end_no between 1 and 99),
  unique (archer_id, client_id)
);
create index if not exists shared_memos_archer_idx on public.shared_memos (archer_id);

alter table public.shared_memos enable row level security;
revoke all on public.shared_memos from anon, authenticated;

-- 하루에 새로 공개할 수 있는 메모 수 (도배 방지용 상식적인 한도)
create or replace function public._max_shares_per_day() returns int language sql immutable as $$ select 40 $$;

-- 메모 공개·고치기. 메모와 태그가 모두 비었으면 내린다.
create or replace function public.share_memo(p_key text, p_client_id text, p_day date, p_end_no int, p_hits boolean[], p_tags text[], p_memo text, p_scope text)
returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  a uuid := _archer(p_key);
  m text := left(btrim(coalesce(p_memo, '')), 500);
  tg text[];
  n int;
begin
  if p_scope not in ('all', 'club') then raise exception 'bad scope'; end if;
  if array_length(p_hits, 1) is distinct from 5 or array_position(p_hits, null) is not null then raise exception 'need 5 shots'; end if;
  if p_client_id is null or char_length(p_client_id) > 64 then raise exception 'bad id'; end if;
  if p_day is null or p_day > _today() + 1 or p_day < date '2000-01-01' then raise exception 'bad day'; end if;
  select coalesce(array_agg(t order by i), '{}') into tg
  from (select left(regexp_replace(t, '[#\s]', '', 'g'), 10) as t, i
        from unnest(coalesce(p_tags, '{}')) with ordinality as u(t, i)) x
  where t <> '' and i <= 10;
  if m = '' and cardinality(tg) = 0 then
    delete from shared_memos where archer_id = a and client_id = p_client_id;
    return;
  end if;
  if p_scope = 'club' and (select range_name from archers where id = a) is null then raise exception 'no club'; end if;

  update shared_memos
  set day = p_day, end_no = case when p_end_no between 1 and 99 then p_end_no end, hits = p_hits, tags = tg, memo = m, scope = p_scope, updated_at = now()
  where archer_id = a and client_id = p_client_id;
  if found then return; end if;

  select count(*) into n from shared_memos where archer_id = a and created_at >= now() - interval '1 day';
  if n >= _max_shares_per_day() then raise exception 'share limit'; end if;
  insert into shared_memos (archer_id, client_id, day, end_no, hits, tags, memo, scope)
  values (a, p_client_id, p_day, case when p_end_no between 1 and 99 then p_end_no end, p_hits, tg, m, p_scope);
end $$;

-- 공개 내리기 (순을 지웠거나 나만 보기로 바꿨을 때)
create or replace function public.unshare_memo(p_key text, p_client_id text) returns void
language sql security definer set search_path = public, extensions as $$
  delete from shared_memos where archer_id = _archer(p_key) and client_id = p_client_id
$$;

-- 공개 메모 목록 (최근에 공개한 것부터). p_key는 없어도 된다 (그러면 전체 공개만 보인다).
-- p_filter: 'all' 볼 수 있는 모든 메모 / 'club' 내 소속 활터 궁사의 메모 / 'mine' 내가 공개한 메모
-- p_before: 이 id보다 앞서 공개한 것만 (더 보기)
create or replace function public.shared_memo_list(p_key text default null, p_filter text default 'all', p_before bigint default null, p_limit int default 30)
returns table (id bigint, nickname text, range_name text, dan int, day date, end_no int, hits boolean[], tags text[], memo text, scope text,
               created_at timestamptz, updated_at timestamptz, mine boolean)
language sql stable security definer set search_path = public, extensions as $$
  with me as (
    select a.id, lower(a.range_name) as club from archers a where p_key is not null and a.key_hash = digest(p_key, 'sha256')
  )
  select m.id, a.nickname, a.range_name, a.dan::int, m.day, m.end_no::int, m.hits, m.tags, m.memo, m.scope,
         m.created_at, m.updated_at, (me.id is not null and m.archer_id = me.id)
  from shared_memos m
  join archers a on a.id = m.archer_id
  left join me on true
  where (
      (me.id is not null and m.archer_id = me.id)
      or (not a.hidden and (m.scope = 'all' or (me.club is not null and lower(a.range_name) = me.club)))
    )
    and case coalesce(p_filter, 'all')
      when 'all' then true
      when 'club' then me.club is not null and lower(a.range_name) = me.club
      when 'mine' then me.id is not null and m.archer_id = me.id
      else false end
    and (p_before is null or m.id < p_before)
  order by m.id desc
  limit least(greatest(coalesce(p_limit, 30), 1), 50)
$$;

revoke all on function public._max_shares_per_day() from public, anon, authenticated;
grant execute on function public.share_memo(text, text, date, int, boolean[], text[], text, text), public.unshare_memo(text, text),
  public.shared_memo_list(text, text, bigint, int) to anon;

