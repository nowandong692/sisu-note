-- 국궁록 온라인 랭킹 서버 구조 (Supabase SQL Editor에 그대로 붙여 넣어 실행)
--
-- 개인정보 최소화 원칙
--  * 기본은 로그인 없음 (원하면 카카오·구글 계정만 연결, 014). 앱이 만든 무작위 열쇠(= 복구 코드)의 SHA-256 해시만 저장한다. 열쇠 원문은 서버에 없다.
--  * 저장하는 것: 닉네임, (원하면) 활터 이름, 순마다 서버 기준 날짜, 저장 시각과 다섯 시의 관중 여부.
--  * 메모와 태그는 궁사가 "공개"로 고른 순만 올린다 (shared_memos). 위치, 날씨는 올리지 않는다.
--  * 장비와 설정(등록한 활터 위치 포함)은 복구용 백업(backups)으로만 올린다. 열쇠를 아는 본인만 읽는다 (012).
--  * 순 기록과 하루 메모도 복구용 백업(record_backups)으로만 올린다. 열쇠를 아는 본인만 읽는다 (013).
--  * 카카오·구글 로그인은 이메일·이름을 받지 않는다. 회원 번호의 한 방향 해시와, 그 번호로만 열리게 잠근 복구 코드만 둔다 (014).
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
  -- 실력 등급 (1 나무 ~ 5 황금, 015_grade.sql). 앱이 기록으로 계산해 올린다
  grade smallint,
  -- 대표 칭호 업적 id (015_grade.sql). 이름은 앱이 업적 목록에서 찾는다
  title text,
  created_at timestamptz not null default now(),
  constraint nickname_len check (char_length(nickname) between 1 and 12),
  constraint range_len check (range_name is null or char_length(range_name) <= 30),
  constraint dan_range check (dan is null or dan between 1 and 9),
  constraint grade_range check (grade is null or grade between 1 and 5),
  constraint title_id check (title is null or title ~ '^[a-z0-9-]{1,24}$')
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

-- 내 실력 등급(1~5, 30순 전이면 null)과 대표 칭호 업적 id (015_grade.sql)
create or replace function public.set_badge(p_key text, p_grade int, p_title text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if p_grade is not null and (p_grade < 1 or p_grade > 5) then raise exception 'bad grade'; end if;
  if p_title is not null and p_title !~ '^[a-z0-9-]{1,24}$' then raise exception 'bad title'; end if;
  update archers set grade = p_grade, title = p_title where id = _archer(p_key);
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
grant execute on function public.nickname_available(text, text), public.register(text, text), public.whoami(text), public.set_profile(text, text, text), public.set_dan(text, int), public.set_badge(text, int, text),
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


-- 공개 메모 댓글 (008)

create table if not exists public.memo_comments (
  id bigint generated always as identity primary key,
  memo_id bigint not null references public.shared_memos (id) on delete cascade,
  archer_id uuid not null references public.archers (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  constraint mc_body_len check (char_length(body) between 1 and 300)
);
create index if not exists memo_comments_memo_idx on public.memo_comments (memo_id, id);
create index if not exists memo_comments_archer_idx on public.memo_comments (archer_id, created_at);

alter table public.memo_comments enable row level security;
revoke all on public.memo_comments from anon, authenticated;

-- 하루에 달 수 있는 댓글 수 (도배 방지용 상식적인 한도)
create or replace function public._max_comments_per_day() returns int language sql immutable as $$ select 100 $$;

-- 이 궁사(p_viewer, 없으면 null)가 이 메모를 볼 수 있는가 (shared_memo_list와 같은 규칙)
create or replace function public._can_see_memo(p_viewer uuid, p_memo bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from shared_memos m join archers a on a.id = m.archer_id
    left join archers v on v.id = p_viewer
    where m.id = p_memo
      and (m.archer_id = p_viewer
        or (not a.hidden and (m.scope = 'all'
          or (v.range_name is not null and lower(a.range_name) = lower(v.range_name)))))
  )
$$;

-- 댓글 달기. 다듬은 본문이 비었거나 300자를 넘으면 오류
create or replace function public.add_comment(p_key text, p_memo_id bigint, p_body text) returns bigint
language plpgsql security definer set search_path = public, extensions as $$
declare
  a uuid := _archer(p_key);
  b text := btrim(regexp_replace(coalesce(p_body, ''), '\n{3,}', E'\n\n', 'g'));
  n int;
  new_id bigint;
begin
  if b = '' then raise exception 'empty comment'; end if;
  if char_length(b) > 300 then raise exception 'comment too long'; end if;
  if not _can_see_memo(a, p_memo_id) then raise exception 'no such memo'; end if;
  select count(*) into n from memo_comments where archer_id = a and created_at >= now() - interval '1 day';
  if n >= _max_comments_per_day() then raise exception 'comment limit'; end if;
  insert into memo_comments (memo_id, archer_id, body) values (p_memo_id, a, b) returning id into new_id;
  return new_id;
end $$;

-- 댓글 지우기: 내가 쓴 댓글, 또는 내 메모에 달린 댓글
create or replace function public.delete_comment(p_key text, p_comment_id bigint) returns void
language sql security definer set search_path = public, extensions as $$
  delete from memo_comments c
  using shared_memos m
  where c.id = p_comment_id and m.id = c.memo_id
    and (c.archer_id = _archer(p_key) or m.archer_id = _archer(p_key))
$$;

-- 한 메모의 댓글 (단 차례대로). mine: 내가 쓴 댓글, can_delete: 내가 지울 수 있는 댓글
create or replace function public.memo_comment_list(p_key text, p_memo_id bigint)
returns table (id bigint, nickname text, range_name text, dan int, body text, created_at timestamptz, mine boolean, can_delete boolean)
language sql stable security definer set search_path = public, extensions as $$
  with me as (select a.id from archers a where p_key is not null and a.key_hash = digest(p_key, 'sha256'))
  select c.id, a.nickname, a.range_name, a.dan::int, c.body, c.created_at,
         (me.id is not null and c.archer_id = me.id),
         (me.id is not null and (c.archer_id = me.id or m.archer_id = me.id))
  from memo_comments c
  join shared_memos m on m.id = c.memo_id
  join archers a on a.id = c.archer_id
  left join me on true
  where c.memo_id = p_memo_id
    and _can_see_memo(me.id, p_memo_id)
    and (not a.hidden or c.archer_id = me.id)
  order by c.id
  limit 200
$$;

-- 공개 메모 목록에 댓글 수를 더한다 (돌려주는 열이 바뀌므로 지우고 다시 만든다)
drop function if exists public.shared_memo_list(text, text, bigint, int);
create function public.shared_memo_list(p_key text default null, p_filter text default 'all', p_before bigint default null, p_limit int default 30)
returns table (id bigint, nickname text, range_name text, dan int, day date, end_no int, hits boolean[], tags text[], memo text, scope text,
               created_at timestamptz, updated_at timestamptz, mine boolean, comments int)
language sql stable security definer set search_path = public, extensions as $$
  with me as (
    select a.id, lower(a.range_name) as club from archers a where p_key is not null and a.key_hash = digest(p_key, 'sha256')
  )
  select m.id, a.nickname, a.range_name, a.dan::int, m.day, m.end_no::int, m.hits, m.tags, m.memo, m.scope,
         m.created_at, m.updated_at, (me.id is not null and m.archer_id = me.id),
         (select count(*)::int from memo_comments c join archers ca on ca.id = c.archer_id
          where c.memo_id = m.id and (not ca.hidden or c.archer_id = me.id))
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

revoke all on function public._max_comments_per_day(), public._can_see_memo(uuid, bigint) from public, anon, authenticated;
grant execute on function public.add_comment(text, bigint, text), public.delete_comment(text, bigint),
  public.memo_comment_list(text, bigint), public.shared_memo_list(text, text, bigint, int) to anon;


-- 공개 메모 신고, 관리자 삭제, 새 댓글 (009)

create table if not exists public.content_reports (
  id bigint generated always as identity primary key,
  memo_id bigint references public.shared_memos (id) on delete cascade,
  comment_id bigint references public.memo_comments (id) on delete cascade,
  reporter uuid not null references public.archers (id) on delete cascade,
  reason text not null default '',
  created_at timestamptz not null default now(),
  constraint cr_one_target check ((memo_id is null) <> (comment_id is null)),
  constraint cr_reason_len check (char_length(reason) <= 200)
);
create unique index if not exists content_reports_memo_uq on public.content_reports (reporter, memo_id) where memo_id is not null;
create unique index if not exists content_reports_comment_uq on public.content_reports (reporter, comment_id) where comment_id is not null;

alter table public.content_reports enable row level security;
revoke all on public.content_reports from anon, authenticated;

-- 메모나 댓글 신고. 볼 수 없는 것, 내 것은 신고하지 않는다.
create or replace function public.report_content(p_key text, p_memo_id bigint, p_comment_id bigint, p_reason text default '') returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  a uuid := _archer(p_key);
  target_memo bigint;
  owner uuid;
  n int;
begin
  if (p_memo_id is null) = (p_comment_id is null) then raise exception 'bad target'; end if;
  if p_comment_id is not null then
    select c.memo_id, c.archer_id into target_memo, owner from memo_comments c where c.id = p_comment_id;
  else
    select m.id, m.archer_id into target_memo, owner from shared_memos m where m.id = p_memo_id;
  end if;
  if target_memo is null or not _can_see_memo(a, target_memo) then raise exception 'no such memo'; end if;
  if owner = a then return; end if;
  select count(*) into n from content_reports where reporter = a and created_at >= now() - interval '1 day';
  if n >= 30 then raise exception 'report limit'; end if;
  insert into content_reports (memo_id, comment_id, reporter, reason)
  values (case when p_comment_id is null then p_memo_id end, p_comment_id, a, left(coalesce(p_reason, ''), 200))
  on conflict do nothing;
end $$;

-- 내 메모에 남이 단 댓글 가운데 p_after보다 뒤의 것: 가장 최근 댓글 id와 그 수
create or replace function public.comment_news(p_key text, p_after bigint default 0)
returns table (latest bigint, unread int)
language sql stable security definer set search_path = public, extensions as $$
  select max(c.id), (count(*) filter (where c.id > coalesce(p_after, 0)))::int
  from memo_comments c
  join shared_memos m on m.id = c.memo_id
  join archers ca on ca.id = c.archer_id
  where m.archer_id = _archer(p_key) and c.archer_id <> m.archer_id and not ca.hidden
$$;

-- 공개 메모 목록에 그 메모의 가장 최근 댓글 id(last_comment)를 더한다 (새 댓글 표시용)
drop function if exists public.shared_memo_list(text, text, bigint, int);
create function public.shared_memo_list(p_key text default null, p_filter text default 'all', p_before bigint default null, p_limit int default 30)
returns table (id bigint, nickname text, range_name text, dan int, day date, end_no int, hits boolean[], tags text[], memo text, scope text,
               created_at timestamptz, updated_at timestamptz, mine boolean, comments int, last_comment bigint)
language sql stable security definer set search_path = public, extensions as $$
  with me as (
    select a.id, lower(a.range_name) as club from archers a where p_key is not null and a.key_hash = digest(p_key, 'sha256')
  )
  select m.id, a.nickname, a.range_name, a.dan::int, m.day, m.end_no::int, m.hits, m.tags, m.memo, m.scope,
         m.created_at, m.updated_at, (me.id is not null and m.archer_id = me.id), cc.n, cc.last
  from shared_memos m
  join archers a on a.id = m.archer_id
  left join me on true
  left join lateral (
    select count(*)::int as n, max(c.id) filter (where c.archer_id <> m.archer_id) as last
    from memo_comments c join archers ca on ca.id = c.archer_id
    where c.memo_id = m.id and (not ca.hidden or c.archer_id = me.id)
  ) cc on true
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

-- 관리자: 메모·댓글 신고 목록. 대상마다 글쓴이, 내용, 받은 신고 수
create or replace function public.admin_content_reports(p_admin text)
returns table (id bigint, kind text, memo_id bigint, comment_id bigint, nickname text, range_name text, hidden boolean, body text,
               reason text, created_at timestamptz, total int)
language plpgsql stable security definer set search_path = public, extensions as $$
#variable_conflict use_column
begin
  perform _admin(p_admin);
  return query
    select r.id, case when r.comment_id is null then 'memo' else 'comment' end,
           coalesce(r.memo_id, c.memo_id), r.comment_id, a.nickname, a.range_name, a.hidden,
           coalesce(c.body, m.memo), r.reason, r.created_at,
           (count(*) over (partition by r.memo_id, r.comment_id))::int
    from public.content_reports r
    left join public.memo_comments c on c.id = r.comment_id
    left join public.shared_memos m on m.id = r.memo_id
    join public.archers a on a.id = coalesce(c.archer_id, m.archer_id)
    order by r.created_at desc
    limit 200;
end $$;

create or replace function public.admin_delete_memo(p_admin text, p_memo_id bigint) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin perform _admin(p_admin); delete from shared_memos where id = p_memo_id; end $$;

create or replace function public.admin_delete_comment(p_admin text, p_comment_id bigint) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin perform _admin(p_admin); delete from memo_comments where id = p_comment_id; end $$;

-- 신고 닫기: 같은 대상에 들어온 신고를 모두 닫는다
create or replace function public.admin_dismiss_content_report(p_admin text, p_id bigint) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare r content_reports;
begin
  perform _admin(p_admin);
  select * into r from content_reports where id = p_id;
  if r.id is null then return; end if;
  delete from content_reports
  where (r.memo_id is not null and memo_id = r.memo_id) or (r.comment_id is not null and comment_id = r.comment_id);
end $$;

grant execute on function public.report_content(text, bigint, bigint, text), public.comment_news(text, bigint),
  public.shared_memo_list(text, text, bigint, int), public.admin_content_reports(text), public.admin_delete_memo(text, bigint),
  public.admin_delete_comment(text, bigint), public.admin_dismiss_content_report(text, bigint) to anon;


-- 하루 메모 공개 (010)
alter table public.shared_memos add column if not exists kind text not null default 'end';
alter table public.shared_memos add column if not exists ends smallint;
alter table public.shared_memos add column if not exists hit_count smallint;

alter table public.shared_memos drop constraint if exists sm_kind;
alter table public.shared_memos add constraint sm_kind check (kind in ('end', 'day'));
-- 순 메모는 다섯 시, 하루 메모는 시 없이 순 수와 관중 수
alter table public.shared_memos drop constraint if exists sm_five;
alter table public.shared_memos add constraint sm_five check (
  (kind = 'end' and array_length(hits, 1) = 5)
  or (kind = 'day' and cardinality(hits) = 0 and ends between 0 and 999 and hit_count between 0 and ends * 5)
);

-- 하루 메모 공개·고치기. 메모가 비었으면 내린다.
create or replace function public.share_day_memo(p_key text, p_day date, p_ends int, p_hits int, p_memo text, p_scope text)
returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  a uuid := _archer(p_key);
  m text := left(btrim(coalesce(p_memo, '')), 500);
  cid text := 'day:' || p_day::text;
  e int := least(greatest(coalesce(p_ends, 0), 0), 999);
  h int;
  n int;
begin
  if p_scope not in ('all', 'club') then raise exception 'bad scope'; end if;
  if p_day is null or p_day > _today() + 1 or p_day < date '2000-01-01' then raise exception 'bad day'; end if;
  h := least(greatest(coalesce(p_hits, 0), 0), e * 5);
  if m = '' then
    delete from shared_memos where archer_id = a and client_id = cid;
    return;
  end if;
  if p_scope = 'club' and (select range_name from archers where id = a) is null then raise exception 'no club'; end if;

  update shared_memos
  set ends = e, hit_count = h, memo = m, scope = p_scope, updated_at = now()
  where archer_id = a and client_id = cid;
  if found then return; end if;

  select count(*) into n from shared_memos where archer_id = a and created_at >= now() - interval '1 day';
  if n >= _max_shares_per_day() then raise exception 'share limit'; end if;
  insert into shared_memos (archer_id, client_id, kind, day, end_no, hits, tags, memo, scope, ends, hit_count)
  values (a, cid, 'day', p_day, null, '{}', '{}', m, p_scope, e, h);
end $$;

-- 공개 메모 목록에 kind, ends, hit_count를 더한다 (나머지는 009와 같다)
drop function if exists public.shared_memo_list(text, text, bigint, int);
create function public.shared_memo_list(p_key text default null, p_filter text default 'all', p_before bigint default null, p_limit int default 30)
returns table (id bigint, nickname text, range_name text, dan int, day date, end_no int, hits boolean[], tags text[], memo text, scope text,
               created_at timestamptz, updated_at timestamptz, mine boolean, comments int, last_comment bigint,
               kind text, ends int, hit_count int)
language sql stable security definer set search_path = public, extensions as $$
  with me as (
    select a.id, lower(a.range_name) as club from archers a where p_key is not null and a.key_hash = digest(p_key, 'sha256')
  )
  select m.id, a.nickname, a.range_name, a.dan::int, m.day, m.end_no::int, m.hits, m.tags, m.memo, m.scope,
         m.created_at, m.updated_at, (me.id is not null and m.archer_id = me.id), cc.n, cc.last,
         m.kind, m.ends::int, m.hit_count::int
  from shared_memos m
  join archers a on a.id = m.archer_id
  left join me on true
  left join lateral (
    select count(*)::int as n, max(c.id) filter (where c.archer_id <> m.archer_id) as last
    from memo_comments c join archers ca on ca.id = c.archer_id
    where c.memo_id = m.id and (not ca.hidden or c.archer_id = me.id)
  ) cc on true
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

grant execute on function public.share_day_memo(text, date, int, int, text, text), public.shared_memo_list(text, text, bigint, int) to anon;


-- 활쏜얘기 글·댓글이 많아질 때 대비 (011)

create index if not exists archers_range_lower_idx on public.archers (lower(range_name)) where range_name is not null;
create index if not exists shared_memos_archer_id_desc_idx on public.shared_memos (archer_id, id desc);
drop index if exists public.shared_memos_archer_idx;

-- 공개 메모 목록 (돌려주는 열은 010과 같다)
create or replace function public.shared_memo_list(p_key text default null, p_filter text default 'all', p_before bigint default null, p_limit int default 30)
returns table (id bigint, nickname text, range_name text, dan int, day date, end_no int, hits boolean[], tags text[], memo text, scope text,
               created_at timestamptz, updated_at timestamptz, mine boolean, comments int, last_comment bigint,
               kind text, ends int, hit_count int)
language plpgsql stable security definer set search_path = public, extensions as $fn$
declare
  me_id uuid;
  me_club text;
  cond text;
begin
  if p_key is not null then
    select a.id, lower(a.range_name) into me_id, me_club from archers a where a.key_hash = digest(p_key, 'sha256');
  end if;
  case coalesce(p_filter, 'all')
    when 'all' then
      cond := case when me_id is null then 'not a.hidden and m.scope = ''all'''
        else format('m.archer_id = %L or (not a.hidden and (m.scope = ''all''%s))', me_id,
          case when me_club is null then '' else format(' or lower(a.range_name) = %L', me_club) end) end;
    when 'club' then
      if me_club is null then return; end if;
      cond := format('lower(a.range_name) = %L and (m.archer_id = %L or not a.hidden)', me_club, me_id);
    when 'mine' then
      if me_id is null then return; end if;
      cond := format('m.archer_id = %L', me_id);
    else return;
  end case;
  -- 조건을 이번 값으로 바로 계획하도록 값을 글자로 넣어 EXECUTE로 부른다 (색인을 타게). %L은 따옴표를 붙여 안전하게 넣는다.
  return query execute format($q$
    with page as materialized (
      -- 먼저 이번에 보일 메모 id만 고른 뒤, 그 메모들에만 댓글 수를 센다
      select m.id from shared_memos m join archers a on a.id = m.archer_id
      where (%s) and m.id < %s
      order by m.id desc
      limit $2
    )
    select m.id, a.nickname, a.range_name, a.dan::int, m.day, m.end_no::int, m.hits, m.tags, m.memo, m.scope,
           m.created_at, m.updated_at, ($1 is not null and m.archer_id = $1), cc.n, cc.last,
           m.kind, m.ends::int, m.hit_count::int
    from page p
    join shared_memos m on m.id = p.id
    join archers a on a.id = m.archer_id
    left join lateral (
      select count(*)::int as n, max(c.id) filter (where c.archer_id <> m.archer_id) as last
      from memo_comments c join archers ca on ca.id = c.archer_id
      where c.memo_id = m.id and (not ca.hidden or c.archer_id is not distinct from $1)
    ) cc on true
    order by m.id desc
  $q$, cond, coalesce(p_before, 9223372036854775807)::text)
  using me_id, least(greatest(coalesce(p_limit, 30), 1), 50);
end $fn$;

-- 한 메모의 댓글. p_before를 주면 그 id보다 앞의 댓글만. 최근 p_limit개를 단 차례대로 돌려준다.
-- total: 이 메모에서 내가 볼 수 있는 댓글 전체 수
drop function if exists public.memo_comment_list(text, bigint);
drop function if exists public.memo_comment_list(text, bigint, bigint, int);
create function public.memo_comment_list(p_key text, p_memo_id bigint, p_before bigint default null, p_limit int default 50)
returns table (id bigint, nickname text, range_name text, dan int, body text, created_at timestamptz, mine boolean, can_delete boolean, total int)
language sql stable security definer set search_path = public, extensions as $$
  with me as (select a.id from archers a where p_key is not null and a.key_hash = digest(p_key, 'sha256')),
  visible as (
    select c.*, m.archer_id as memo_owner, a.nickname, a.range_name, a.dan
    from memo_comments c
    join shared_memos m on m.id = c.memo_id
    join archers a on a.id = c.archer_id
    left join me on true
    where c.memo_id = p_memo_id
      and _can_see_memo(me.id, p_memo_id)
      and (not a.hidden or c.archer_id = me.id)
  ),
  page as (
    select v.* from visible v
    where p_before is null or v.id < p_before
    order by v.id desc
    limit least(greatest(coalesce(p_limit, 50), 1), 100)
  )
  select p.id, p.nickname, p.range_name, p.dan::int, p.body, p.created_at,
         (me.id is not null and p.archer_id = me.id),
         (me.id is not null and (p.archer_id = me.id or p.memo_owner = me.id)),
         (select count(*)::int from visible)
  from page p left join me on true
  order by p.id
$$;

grant execute on function public.memo_comment_list(text, bigint, bigint, int), public.shared_memo_list(text, text, bigint, int) to anon;

-- 012: 장비·설정 백업
-- * 휴대폰 브라우저가 저장소를 비우면 장비와 설정이 사라졌다. 랭킹에 참여한 궁사는 장비 목록과 설정(소속, 단, 활터,
--   태그, 고른 장비, 화면 테마 등)을 서버에 한 덩어리(JSON)로 올려 두고, 복구 코드를 넣으면 다시 불러온다.
-- * 궁사마다 한 줄. 열쇠(복구 코드)를 아는 사람만 읽고 쓴다. 남에게는 보이지 않는다. 탈퇴하면 함께 지워진다.
-- * 너무 큰 백업은 받지 않는다 (200KB).
-- 여러 번 실행해도 괜찮다.

create table if not exists public.backups (
  archer_id uuid primary key references public.archers (id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.backups enable row level security;
revoke all on public.backups from anon, authenticated;

create or replace function public.save_backup(p_key text, p_data jsonb) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare a uuid := _archer(p_key);
begin
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'bad backup'; end if;
  if octet_length(p_data::text) > 200000 then raise exception 'backup too large'; end if;
  insert into backups (archer_id, data, updated_at) values (a, p_data, now())
  on conflict (archer_id) do update set data = excluded.data, updated_at = now();
end $$;

create or replace function public.load_backup(p_key text) returns jsonb
language sql stable security definer set search_path = public, extensions as $$
  select b.data from backups b where b.archer_id = _archer(p_key)
$$;

grant execute on function public.save_backup(text, jsonb), public.load_backup(text) to anon;

-- 순 기록·하루 메모 백업 (013)
create table if not exists public.record_backups (
  archer_id uuid not null references public.archers (id) on delete cascade,
  -- 순은 앱의 순 id, 하루 메모는 'day:YYYY-MM-DD'
  client_id text not null,
  data jsonb not null,
  -- 앱이 마지막으로 고친 시각 (ms). 더 오래된 내용이 새 내용을 덮어쓰지 않게 한다
  updated_ms bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (archer_id, client_id),
  constraint rb_client_id_len check (char_length(client_id) <= 64)
);
alter table public.record_backups enable row level security;
revoke all on public.record_backups from anon, authenticated;

-- 여러 줄 올리기: [{ "id": "...", "u": 1700000000000, "data": {...} }, ...] (한 번에 200줄까지)
create or replace function public.save_records(p_key text, p_rows jsonb) returns int
language plpgsql security definer set search_path = public, extensions as $$
declare a uuid := _archer(p_key); n int;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'bad records'; end if;
  if jsonb_array_length(p_rows) > 200 then raise exception 'too many records'; end if;
  if exists (select 1 from jsonb_array_elements(p_rows) r
             where jsonb_typeof(r->'data') is distinct from 'object' or coalesce(r->>'id', '') = ''
                or char_length(r->>'id') > 64 or octet_length((r->'data')::text) > 20000) then
    raise exception 'bad records';
  end if;
  if (select count(*) from record_backups where archer_id = a) + jsonb_array_length(p_rows) > 50000 then
    raise exception 'too many records';
  end if;
  insert into record_backups (archer_id, client_id, data, updated_ms, updated_at)
  select a, r->>'id', r->'data', coalesce((r->>'u')::bigint, 0), now() from jsonb_array_elements(p_rows) r
  on conflict (archer_id, client_id) do update
    set data = excluded.data, updated_ms = excluded.updated_ms, updated_at = now()
    where record_backups.updated_ms <= excluded.updated_ms;
  get diagnostics n = row_count;
  return n;
end $$;

-- 지운 순·하루 메모를 백업에서도 지운다
create or replace function public.delete_records(p_key text, p_ids text[]) returns void
language sql security definer set search_path = public, extensions as $$
  delete from record_backups where archer_id = _archer(p_key) and client_id = any (p_ids)
$$;

-- 백업 불러오기: client_id 순서로 p_limit줄씩. 다음에는 마지막 client_id를 p_after로 준다
create or replace function public.load_records(p_key text, p_after text default null, p_limit int default 500)
returns table (client_id text, data jsonb)
language sql stable security definer set search_path = public, extensions as $$
  select b.client_id, b.data from record_backups b
  where b.archer_id = _archer(p_key) and (p_after is null or b.client_id > p_after)
  order by b.client_id
  limit least(greatest(coalesce(p_limit, 500), 1), 1000)
$$;

-- 랭킹에 올라간 내 순 모두 (백업 전에 사라진 기록을 되살릴 때 쓴다). 공개했던 순은 메모와 태그도 함께
create or replace function public.my_ranked_ends(p_key text)
returns table (client_id text, day date, recorded_at timestamptz, hits boolean[], tags text[], memo text, scope text)
language sql stable security definer set search_path = public, extensions as $$
  select e.client_id, e.day, e.recorded_at, e.hits, m.tags, m.memo, m.scope
  from ends e
  left join shared_memos m on m.archer_id = e.archer_id and m.client_id = e.client_id
  where e.archer_id = _archer(p_key)
  order by e.recorded_at
$$;

grant execute on function public.save_records(text, jsonb), public.delete_records(text, text[]),
  public.load_records(text, text, int), public.my_ranked_ends(text) to anon;

-- 카카오·구글 로그인으로 기록 되찾기 (014). 개인정보 없이 회원 번호의 한 방향 해시만 둔다. 비밀 값은 Vault에. 키는 login_keys.sql로 넣는다
create extension if not exists http with schema extensions;

create extension if not exists supabase_vault;

-- 로그인 회사별 공개 client_id. (client_secret 칸은 예전 014에서 쓰던 것으로, 이제 비워 두고 Vault를 쓴다)
create table if not exists public.login_config (
  provider text primary key check (provider in ('kakao', 'google')),
  client_id text not null default '',
  client_secret text not null default ''
);
alter table public.login_config enable row level security;
revoke all on public.login_config from anon, authenticated;

-- Vault에 비밀 값 넣기 (있으면 바꾸기). SQL Editor에서만 부른다
create or replace function public._vault_put(p_name text, p_value text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare sid uuid;
begin
  select id into sid from vault.secrets where name = p_name;
  if sid is null then perform vault.create_secret(p_value, p_name);
  else perform vault.update_secret(sid, p_value);
  end if;
end $$;

create or replace function public._vault_get(p_name text) returns text
language sql stable security definer set search_path = public, extensions as $$
  select decrypted_secret from vault.decrypted_secrets where name = p_name
$$;

-- 해시에 섞는 pepper: 처음 한 번 무작위로 만들고 바꾸지 않는다 (바꾸면 연결이 모두 끊긴다).
-- 예전 014의 login_secret 테이블에 있던 값은 그대로 Vault로 옮기고 테이블을 지운다.
do $$
declare old bytea;
begin
  if public._vault_get('sisu_login_pepper') is null then
    if to_regclass('public.login_secret') is not null then
      execute 'select pepper from public.login_secret where id = 1' into old;
    end if;
    perform public._vault_put('sisu_login_pepper', encode(coalesce(old, extensions.gen_random_bytes(32)), 'hex'));
  end if;
  -- 예전 014로 평문에 넣은 Client Secret도 Vault로 옮긴다
  perform public._vault_put('sisu_login_secret_' || provider, client_secret)
  from public.login_config where client_secret <> '';
  update public.login_config set client_secret = '' where client_secret <> '';
end $$;
drop table if exists public.login_secret;

-- 키 넣기: login_keys.sql이 부른다. client_id는 login_config에, client_secret은 Vault에
create or replace function public.set_login_keys(p_provider text, p_client_id text, p_client_secret text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  insert into login_config (provider, client_id, client_secret) values (p_provider, btrim(coalesce(p_client_id, '')), '')
  on conflict (provider) do update set client_id = excluded.client_id, client_secret = '';
  perform _vault_put('sisu_login_secret_' || p_provider, btrim(coalesce(p_client_secret, '')));
end $$;

-- 연결된 로그인. 회원 번호의 해시와, 그 회원 번호로만 열리는 복구 코드
create table if not exists public.archer_logins (
  login_hash bytea primary key,
  archer_id uuid not null references public.archers (id) on delete cascade,
  provider text not null check (provider in ('kakao', 'google')),
  sealed_key bytea not null,
  created_at timestamptz not null default now(),
  unique (archer_id, provider)
);
alter table public.archer_logins enable row level security;
revoke all on public.archer_logins from anon, authenticated;

-- 인가 코드를 로그인 회사에 보내 회원 번호를 받는다. 회원 번호는 이 함수 밖으로 내보내지 않는다.
create or replace function public._login_sub(p_provider text, p_code text, p_redirect text, p_verifier text)
returns text
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  cfg login_config;
  r http_response;
  tok jsonb;
  sub text;
  part text;
  secret text;
begin
  select * into cfg from login_config where provider = p_provider;
  if cfg is null or cfg.client_id = '' then raise exception 'login not ready'; end if;
  secret := coalesce(_vault_get('sisu_login_secret_' || p_provider), '');
  if coalesce(p_code, '') = '' or char_length(p_code) > 2000 or coalesce(p_redirect, '') !~ '^https?://' then
    raise exception 'login failed';
  end if;
  perform http_set_curlopt('CURLOPT_TIMEOUT_MS', '8000');

  if p_provider = 'kakao' then
    r := http_post('https://kauth.kakao.com/oauth/token',
      urlencode(jsonb_strip_nulls(jsonb_build_object(
        'grant_type', 'authorization_code', 'client_id', cfg.client_id, 'redirect_uri', p_redirect,
        'code', p_code, 'client_secret', nullif(secret, '')))),
      'application/x-www-form-urlencoded;charset=utf-8');
    if r.status <> 200 then raise exception 'login failed'; end if;
    tok := r.content::jsonb;
    -- 토큰 정보만 묻는다: 회원 번호(id) 말고는 아무것도 받지 않는다
    r := http(('GET', 'https://kapi.kakao.com/v1/user/access_token_info',
      array[http_header('Authorization', 'Bearer ' || (tok->>'access_token'))], null, null)::http_request);
    if r.status <> 200 then raise exception 'login failed'; end if;
    sub := r.content::jsonb->>'id';
  else
    r := http_post('https://oauth2.googleapis.com/token',
      urlencode(jsonb_strip_nulls(jsonb_build_object(
        'grant_type', 'authorization_code', 'client_id', cfg.client_id, 'client_secret', secret,
        'redirect_uri', p_redirect, 'code', p_code, 'code_verifier', nullif(p_verifier, '')))),
      'application/x-www-form-urlencoded');
    if r.status <> 200 then raise exception 'login failed'; end if;
    tok := r.content::jsonb;
    -- 구글에서 바로 받은 id_token이라 서명 확인 없이 내용을 읽어도 된다. openid 범위라 회원 번호(sub)만 들어 있다
    part := translate(split_part(tok->>'id_token', '.', 2), '-_', '+/');
    part := part || repeat('=', (4 - char_length(part) % 4) % 4);
    sub := convert_from(decode(part, 'base64'), 'utf8')::jsonb->>'sub';
    if (convert_from(decode(part, 'base64'), 'utf8')::jsonb->>'aud') is distinct from cfg.client_id then
      raise exception 'login failed';
    end if;
  end if;

  if coalesce(sub, '') = '' then raise exception 'login failed'; end if;
  return sub;
exception
  when raise_exception then raise;
  when others then raise exception 'login failed';
end $$;

create or replace function public._login_hash(p_provider text, p_sub text) returns bytea
language sql stable security definer set search_path = public, extensions as $$
  select hmac(convert_to(p_provider || ':' || p_sub, 'utf8'), decode(_vault_get('sisu_login_pepper'), 'hex'), 'sha256')
$$;

-- 복구 코드를 잠그는 비밀번호. 저장하는 해시와는 다른 값이라 해시로는 열 수 없다
create or replace function public._login_seal(p_provider text, p_sub text) returns text
language sql stable security definer set search_path = public, extensions as $$
  select encode(hmac(convert_to('seal:' || p_provider || ':' || p_sub, 'utf8'), decode(_vault_get('sisu_login_pepper'), 'hex'), 'sha256'), 'hex')
$$;

-- 앱이 로그인 버튼을 그릴 때 묻는다: 키를 넣어 둔 회사와 공개용 client_id
create or replace function public.login_providers() returns table (provider text, client_id text)
language sql stable security definer set search_path = public, extensions as $$
  select c.provider, c.client_id from login_config c where c.client_id <> '' order by c.provider desc
$$;

-- 지금 쓰는 복구 코드에 로그인 계정을 연결한다. 그 계정이 다른 닉네임에 연결돼 있었으면 이쪽으로 옮긴다
create or replace function public.link_login(p_key text, p_provider text, p_code text, p_redirect text, p_verifier text default null)
returns void
language plpgsql volatile security definer set search_path = public, extensions as $$
declare a uuid := _archer(p_key); sub text; h bytea;
begin
  sub := _login_sub(p_provider, p_code, p_redirect, p_verifier);
  h := _login_hash(p_provider, sub);
  delete from archer_logins where (archer_id = a and provider = p_provider) or login_hash = h;
  insert into archer_logins (login_hash, archer_id, provider, sealed_key)
  values (h, a, p_provider, pgp_sym_encrypt(p_key, _login_seal(p_provider, sub)));
end $$;

-- 로그인으로 복구 코드 되찾기. 연결된 적 없는 계정이면 'not linked'
create or replace function public.login_with(p_provider text, p_code text, p_redirect text, p_verifier text default null)
returns text
language plpgsql volatile security definer set search_path = public, extensions as $$
declare sub text; rec archer_logins;
begin
  sub := _login_sub(p_provider, p_code, p_redirect, p_verifier);
  select * into rec from archer_logins where login_hash = _login_hash(p_provider, sub);
  if rec is null then raise exception 'not linked'; end if;
  return pgp_sym_decrypt(rec.sealed_key, _login_seal(p_provider, sub));
end $$;

-- 내 복구 코드에 연결된 로그인 (회사 이름과 연결한 때만)
create or replace function public.my_logins(p_key text) returns table (provider text, created_at timestamptz)
language sql stable security definer set search_path = public, extensions as $$
  select l.provider, l.created_at from archer_logins l where l.archer_id = _archer(p_key) order by l.created_at
$$;

create or replace function public.unlink_login(p_key text, p_provider text) returns void
language sql security definer set search_path = public, extensions as $$
  delete from archer_logins where archer_id = _archer(p_key) and provider = p_provider
$$;

revoke all on function public._login_sub(text, text, text, text), public._login_hash(text, text),
  public._login_seal(text, text), public._vault_put(text, text), public._vault_get(text),
  public.set_login_keys(text, text, text) from public, anon, authenticated;
grant execute on function public.login_providers(), public.link_login(text, text, text, text, text),
  public.login_with(text, text, text, text), public.my_logins(text), public.unlink_login(text, text) to anon;


-- 구글 자동 로그인 (원탭, 016)
create or replace function public._google_token_sub(p_credential text) returns text
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  cid text;
  r http_response;
  info jsonb;
begin
  select client_id into cid from login_config where provider = 'google';
  if coalesce(cid, '') = '' then raise exception 'login not ready'; end if;
  if coalesce(p_credential, '') !~ '^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$' or char_length(p_credential) > 4000 then
    raise exception 'login failed';
  end if;
  perform http_set_curlopt('CURLOPT_TIMEOUT_MS', '8000');
  -- 구글이 서명과 만료를 확인해 준다. 잘못된 토큰이면 200이 아니다
  r := http_get('https://oauth2.googleapis.com/tokeninfo?id_token=' || p_credential);
  if r.status <> 200 then raise exception 'login failed'; end if;
  info := r.content::jsonb;
  if info->>'aud' is distinct from cid
     or coalesce(info->>'iss', '') not in ('accounts.google.com', 'https://accounts.google.com')
     or coalesce(info->>'sub', '') = '' then
    raise exception 'login failed';
  end if;
  return info->>'sub';
exception
  when raise_exception then raise;
  when others then raise exception 'login failed';
end $$;

-- 구글 ID 토큰으로 복구 코드 되찾기. 연결된 적 없는 계정이면 'not linked'
create or replace function public.login_with_google_token(p_credential text) returns text
language plpgsql volatile security definer set search_path = public, extensions as $$
declare sub text; rec archer_logins;
begin
  sub := _google_token_sub(p_credential);
  select * into rec from archer_logins where login_hash = _login_hash('google', sub);
  if rec is null then raise exception 'not linked'; end if;
  return pgp_sym_decrypt(rec.sealed_key, _login_seal('google', sub));
end $$;

revoke all on function public._google_token_sub(text) from public, anon, authenticated;
revoke all on function public.login_with_google_token(text) from public;
grant execute on function public.login_with_google_token(text) to anon;

-- 활쏜얘기 메모에 반응 (017): 좋아요·슬퍼요·넵!·감사해요. 한 메모에 한 사람이 하나, 내 메모에는 반응하지 않는다. 내 메모에 새 반응은 댓글처럼 알린다
create table if not exists public.memo_reactions (
  memo_id bigint not null references public.shared_memos (id) on delete cascade,
  archer_id uuid not null references public.archers (id) on delete cascade,
  kind text not null,
  created_at timestamptz not null default now(),
  primary key (memo_id, archer_id),
  constraint mr_kind check (kind in ('like', 'sad', 'yes', 'thanks'))
);
create index if not exists memo_reactions_archer_idx on public.memo_reactions (archer_id);
create sequence if not exists public.memo_reactions_seq;
alter table public.memo_reactions add column if not exists seq bigint not null default nextval('public.memo_reactions_seq');
create index if not exists memo_reactions_memo_seq_idx on public.memo_reactions (memo_id, seq);

alter table public.memo_reactions enable row level security;
revoke all on public.memo_reactions from anon, authenticated;
revoke all on sequence public.memo_reactions_seq from anon, authenticated;

-- 한 메모의 반응 수 ({"like": 3, "thanks": 1}처럼, 없는 반응은 빠진다). 숨긴 궁사의 반응은 본인에게만 센다
create or replace function public._memo_reaction_counts(p_memo bigint, p_viewer uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(kind, n), '{}'::jsonb) from (
    select r.kind, count(*)::int as n
    from memo_reactions r join archers a on a.id = r.archer_id
    where r.memo_id = p_memo and (not a.hidden or r.archer_id is not distinct from p_viewer)
    group by r.kind
  ) t
$$;

-- 반응하기. p_kind가 null이거나 지금 반응과 같으면 취소, 다르면 바꾼다. 바뀐 뒤의 반응 수와 내 반응을 돌려준다
create or replace function public.react_memo(p_key text, p_memo_id bigint, p_kind text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  a uuid := _archer(p_key);
  cur text;
begin
  if p_kind is not null and p_kind not in ('like', 'sad', 'yes', 'thanks') then raise exception 'bad reaction'; end if;
  if not _can_see_memo(a, p_memo_id) then raise exception 'no such memo'; end if;
  if exists (select 1 from shared_memos where id = p_memo_id and archer_id = a) then raise exception 'own memo'; end if;
  select kind into cur from memo_reactions where memo_id = p_memo_id and archer_id = a;
  if p_kind is null or p_kind = cur then
    delete from memo_reactions where memo_id = p_memo_id and archer_id = a;
    cur := null;
  else
    insert into memo_reactions (memo_id, archer_id, kind) values (p_memo_id, a, p_kind)
    on conflict (memo_id, archer_id) do update set kind = excluded.kind, created_at = now(), seq = nextval('public.memo_reactions_seq');
    cur := p_kind;
  end if;
  return jsonb_build_object('reactions', _memo_reaction_counts(p_memo_id, a), 'mine', cur);
end $$;

-- 내 메모에 남이 남긴 새 반응 (comment_news와 같은 꼴). latest: 가장 최근 반응 번호, unread: p_after보다 뒤의 반응 수
create or replace function public.reaction_news(p_key text, p_after bigint default 0)
returns table (latest bigint, unread int)
language sql stable security definer set search_path = public, extensions as $$
  select max(r.seq), (count(*) filter (where r.seq > coalesce(p_after, 0)))::int
  from memo_reactions r
  join shared_memos m on m.id = r.memo_id
  join archers ra on ra.id = r.archer_id
  where m.archer_id = _archer(p_key) and r.archer_id <> m.archer_id and not ra.hidden
$$;

-- 공개 메모 목록에 반응 수(reactions), 내 반응(my_reaction), 내 메모면 반응마다 가장 최근 번호(reaction_last)를 더한다 (돌려주는 열이 바뀌므로 지우고 다시 만든다)
drop function if exists public.shared_memo_list(text, text, bigint, int);
create function public.shared_memo_list(p_key text default null, p_filter text default 'all', p_before bigint default null, p_limit int default 30)
returns table (id bigint, nickname text, range_name text, dan int, day date, end_no int, hits boolean[], tags text[], memo text, scope text,
               created_at timestamptz, updated_at timestamptz, mine boolean, comments int, last_comment bigint,
               kind text, ends int, hit_count int, reactions jsonb, my_reaction text, reaction_last jsonb)
language plpgsql stable security definer set search_path = public, extensions as $fn$
declare
  me_id uuid;
  me_club text;
  cond text;
begin
  if p_key is not null then
    select a.id, lower(a.range_name) into me_id, me_club from archers a where a.key_hash = digest(p_key, 'sha256');
  end if;
  case coalesce(p_filter, 'all')
    when 'all' then
      cond := case when me_id is null then 'not a.hidden and m.scope = ''all'''
        else format('m.archer_id = %L or (not a.hidden and (m.scope = ''all''%s))', me_id,
          case when me_club is null then '' else format(' or lower(a.range_name) = %L', me_club) end) end;
    when 'club' then
      if me_club is null then return; end if;
      cond := format('lower(a.range_name) = %L and (m.archer_id = %L or not a.hidden)', me_club, me_id);
    when 'mine' then
      if me_id is null then return; end if;
      cond := format('m.archer_id = %L', me_id);
    else return;
  end case;
  -- 011과 같다. 이번에 보일 메모에만 댓글 수와 반응 수를 센다
  return query execute format($q$
    with page as materialized (
      select m.id from shared_memos m join archers a on a.id = m.archer_id
      where (%s) and m.id < %s
      order by m.id desc
      limit $2
    )
    select m.id, a.nickname, a.range_name, a.dan::int, m.day, m.end_no::int, m.hits, m.tags, m.memo, m.scope,
           m.created_at, m.updated_at, ($1 is not null and m.archer_id = $1), cc.n, cc.last,
           m.kind, m.ends::int, m.hit_count::int,
           _memo_reaction_counts(m.id, $1),
           (select r.kind from memo_reactions r where r.memo_id = m.id and r.archer_id = $1),
           case when m.archer_id = $1 then (
             select coalesce(jsonb_object_agg(t.kind, t.last), '{}'::jsonb) from (
               select r.kind, max(r.seq) as last from memo_reactions r join archers ra on ra.id = r.archer_id
               where r.memo_id = m.id and not ra.hidden group by r.kind
             ) t) end
    from page p
    join shared_memos m on m.id = p.id
    join archers a on a.id = m.archer_id
    left join lateral (
      select count(*)::int as n, max(c.id) filter (where c.archer_id <> m.archer_id) as last
      from memo_comments c join archers ca on ca.id = c.archer_id
      where c.memo_id = m.id and (not ca.hidden or c.archer_id is not distinct from $1)
    ) cc on true
    order by m.id desc
  $q$, cond, coalesce(p_before, 9223372036854775807)::text)
  using me_id, least(greatest(coalesce(p_limit, 30), 1), 50);
end $fn$;

revoke all on function public._memo_reaction_counts(bigint, uuid) from public, anon, authenticated;
grant execute on function public.react_memo(text, bigint, text), public.reaction_news(text, bigint), public.shared_memo_list(text, text, bigint, int) to anon;

-- 반응을 종류마다 한 번씩, 댓글에도 반응 (018)
-- 메모 반응: 한 사람이 종류마다 하나
alter table public.memo_reactions drop constraint if exists memo_reactions_pkey;
alter table public.memo_reactions add constraint memo_reactions_pkey primary key (memo_id, archer_id, kind);

create table if not exists public.comment_reactions (
  comment_id bigint not null references public.memo_comments (id) on delete cascade,
  archer_id uuid not null references public.archers (id) on delete cascade,
  kind text not null,
  created_at timestamptz not null default now(),
  primary key (comment_id, archer_id, kind),
  constraint cr_kind check (kind in ('like', 'sad', 'yes', 'thanks'))
);
create index if not exists comment_reactions_archer_idx on public.comment_reactions (archer_id);

alter table public.comment_reactions enable row level security;
revoke all on public.comment_reactions from anon, authenticated;

-- 한 댓글의 반응 수 (숨긴 궁사의 반응은 본인에게만 센다)
create or replace function public._comment_reaction_counts(p_comment bigint, p_viewer uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(kind, n), '{}'::jsonb) from (
    select r.kind, count(*)::int as n
    from comment_reactions r join archers a on a.id = r.archer_id
    where r.comment_id = p_comment and (not a.hidden or r.archer_id is not distinct from p_viewer)
    group by r.kind
  ) t
$$;

-- 메모에 반응하기: 이 반응을 남겼으면 취소, 아니면 남긴다. 바뀐 뒤의 반응 수와 내 반응 목록을 돌려준다
create or replace function public.react_memo(p_key text, p_memo_id bigint, p_kind text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  a uuid := _archer(p_key);
begin
  if p_kind is null or p_kind not in ('like', 'sad', 'yes', 'thanks') then raise exception 'bad reaction'; end if;
  if not _can_see_memo(a, p_memo_id) then raise exception 'no such memo'; end if;
  if exists (select 1 from shared_memos where id = p_memo_id and archer_id = a) then raise exception 'own memo'; end if;
  delete from memo_reactions where memo_id = p_memo_id and archer_id = a and kind = p_kind;
  if not found then
    insert into memo_reactions (memo_id, archer_id, kind) values (p_memo_id, a, p_kind);
  end if;
  return jsonb_build_object('reactions', _memo_reaction_counts(p_memo_id, a),
    'mine', coalesce((select jsonb_agg(kind order by kind) from memo_reactions where memo_id = p_memo_id and archer_id = a), '[]'::jsonb));
end $$;

-- 댓글에 반응하기 (react_memo와 같은 규칙)
create or replace function public.react_comment(p_key text, p_comment_id bigint, p_kind text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  a uuid := _archer(p_key);
  c record;
begin
  if p_kind is null or p_kind not in ('like', 'sad', 'yes', 'thanks') then raise exception 'bad reaction'; end if;
  select mc.memo_id, mc.archer_id, ca.hidden into c from memo_comments mc join archers ca on ca.id = mc.archer_id where mc.id = p_comment_id;
  if c.memo_id is null or c.hidden or not _can_see_memo(a, c.memo_id) then raise exception 'no such comment'; end if;
  if c.archer_id = a then raise exception 'own comment'; end if;
  delete from comment_reactions where comment_id = p_comment_id and archer_id = a and kind = p_kind;
  if not found then
    insert into comment_reactions (comment_id, archer_id, kind) values (p_comment_id, a, p_kind);
  end if;
  return jsonb_build_object('reactions', _comment_reaction_counts(p_comment_id, a),
    'mine', coalesce((select jsonb_agg(kind order by kind) from comment_reactions where comment_id = p_comment_id and archer_id = a), '[]'::jsonb));
end $$;

-- 공개 메모 목록: my_reaction 대신 my_reactions (나머지는 017과 같다)
drop function if exists public.shared_memo_list(text, text, bigint, int);
create function public.shared_memo_list(p_key text default null, p_filter text default 'all', p_before bigint default null, p_limit int default 30)
returns table (id bigint, nickname text, range_name text, dan int, day date, end_no int, hits boolean[], tags text[], memo text, scope text,
               created_at timestamptz, updated_at timestamptz, mine boolean, comments int, last_comment bigint,
               kind text, ends int, hit_count int, reactions jsonb, my_reactions text[], reaction_last jsonb)
language plpgsql stable security definer set search_path = public, extensions as $fn$
declare
  me_id uuid;
  me_club text;
  cond text;
begin
  if p_key is not null then
    select a.id, lower(a.range_name) into me_id, me_club from archers a where a.key_hash = digest(p_key, 'sha256');
  end if;
  case coalesce(p_filter, 'all')
    when 'all' then
      cond := case when me_id is null then 'not a.hidden and m.scope = ''all'''
        else format('m.archer_id = %L or (not a.hidden and (m.scope = ''all''%s))', me_id,
          case when me_club is null then '' else format(' or lower(a.range_name) = %L', me_club) end) end;
    when 'club' then
      if me_club is null then return; end if;
      cond := format('lower(a.range_name) = %L and (m.archer_id = %L or not a.hidden)', me_club, me_id);
    when 'mine' then
      if me_id is null then return; end if;
      cond := format('m.archer_id = %L', me_id);
    else return;
  end case;
  return query execute format($q$
    with page as materialized (
      select m.id from shared_memos m join archers a on a.id = m.archer_id
      where (%s) and m.id < %s
      order by m.id desc
      limit $2
    )
    select m.id, a.nickname, a.range_name, a.dan::int, m.day, m.end_no::int, m.hits, m.tags, m.memo, m.scope,
           m.created_at, m.updated_at, ($1 is not null and m.archer_id = $1), cc.n, cc.last,
           m.kind, m.ends::int, m.hit_count::int,
           _memo_reaction_counts(m.id, $1),
           coalesce((select array_agg(r.kind order by r.kind) from memo_reactions r where r.memo_id = m.id and r.archer_id = $1), '{}'),
           case when m.archer_id = $1 then (
             select coalesce(jsonb_object_agg(t.kind, t.last), '{}'::jsonb) from (
               select r.kind, max(r.seq) as last from memo_reactions r join archers ra on ra.id = r.archer_id
               where r.memo_id = m.id and not ra.hidden group by r.kind
             ) t) end
    from page p
    join shared_memos m on m.id = p.id
    join archers a on a.id = m.archer_id
    left join lateral (
      select count(*)::int as n, max(c.id) filter (where c.archer_id <> m.archer_id) as last
      from memo_comments c join archers ca on ca.id = c.archer_id
      where c.memo_id = m.id and (not ca.hidden or c.archer_id is not distinct from $1)
    ) cc on true
    order by m.id desc
  $q$, cond, coalesce(p_before, 9223372036854775807)::text)
  using me_id, least(greatest(coalesce(p_limit, 30), 1), 50);
end $fn$;

-- 한 메모의 댓글에 반응 수(reactions)와 내 반응 목록(my_reactions)을 더한다 (나머지는 011과 같다)
drop function if exists public.memo_comment_list(text, bigint, bigint, int);
create function public.memo_comment_list(p_key text, p_memo_id bigint, p_before bigint default null, p_limit int default 50)
returns table (id bigint, nickname text, range_name text, dan int, body text, created_at timestamptz, mine boolean, can_delete boolean, total int,
               reactions jsonb, my_reactions text[])
language sql stable security definer set search_path = public, extensions as $$
  with me as (select a.id from archers a where p_key is not null and a.key_hash = digest(p_key, 'sha256')),
  visible as (
    select c.*, m.archer_id as memo_owner, a.nickname, a.range_name, a.dan
    from memo_comments c
    join shared_memos m on m.id = c.memo_id
    join archers a on a.id = c.archer_id
    left join me on true
    where c.memo_id = p_memo_id
      and _can_see_memo(me.id, p_memo_id)
      and (not a.hidden or c.archer_id = me.id)
  ),
  page as (
    select v.* from visible v
    where p_before is null or v.id < p_before
    order by v.id desc
    limit least(greatest(coalesce(p_limit, 50), 1), 100)
  )
  select p.id, p.nickname, p.range_name, p.dan::int, p.body, p.created_at,
         (me.id is not null and p.archer_id = me.id),
         (me.id is not null and (p.archer_id = me.id or p.memo_owner = me.id)),
         (select count(*)::int from visible),
         _comment_reaction_counts(p.id, me.id),
         coalesce((select array_agg(r.kind order by r.kind) from comment_reactions r where r.comment_id = p.id and r.archer_id = me.id), '{}')
  from page p left join me on true
  order by p.id
$$;

revoke all on function public._comment_reaction_counts(bigint, uuid) from public, anon, authenticated;
grant execute on function public.react_memo(text, bigint, text), public.react_comment(text, bigint, text),
  public.shared_memo_list(text, text, bigint, int), public.memo_comment_list(text, bigint, bigint, int) to anon;

-- 신고가 20건을 넘은 활쏜얘기 메모·댓글은 글쓴이와 관리자만 본다 (019)
create index if not exists content_reports_memo_idx on public.content_reports (memo_id) where memo_id is not null;
create index if not exists content_reports_comment_idx on public.content_reports (comment_id) where comment_id is not null;

-- 이 신고 수를 넘으면 숨긴다
create or replace function public._report_hide_limit() returns int language sql immutable as $$ select 20 $$;

create or replace function public._memo_report_hidden(p_memo bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select count(*) > _report_hide_limit() from content_reports where memo_id = p_memo
$$;

create or replace function public._comment_report_hidden(p_comment bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select count(*) > _report_hide_limit() from content_reports where comment_id = p_comment
$$;

-- 이 궁사가 이 메모를 볼 수 있는가: 008 규칙에 더해, 신고가 많은 남의 메모는 볼 수 없다
-- (댓글 목록, 댓글 달기, 메모 반응, 신고가 모두 이 규칙을 따른다)
create or replace function public._can_see_memo(p_viewer uuid, p_memo bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from shared_memos m join archers a on a.id = m.archer_id
    left join archers v on v.id = p_viewer
    where m.id = p_memo
      and (m.archer_id = p_viewer
        or (not a.hidden and not _memo_report_hidden(m.id) and (m.scope = 'all'
          or (v.range_name is not null and lower(a.range_name) = lower(v.range_name)))))
  )
$$;

-- 내 메모의 새 댓글 알림: 신고가 많은 댓글은 세지 않는다 (나머지는 009와 같다)
create or replace function public.comment_news(p_key text, p_after bigint default 0)
returns table (latest bigint, unread int)
language sql stable security definer set search_path = public, extensions as $$
  select max(c.id), (count(*) filter (where c.id > coalesce(p_after, 0)))::int
  from memo_comments c
  join shared_memos m on m.id = c.memo_id
  join archers ca on ca.id = c.archer_id
  where m.archer_id = _archer(p_key) and c.archer_id <> m.archer_id and not ca.hidden and not _comment_report_hidden(c.id)
$$;

-- 댓글 반응: 신고가 많은 댓글에는 반응하지 않는다 (나머지는 018과 같다)
create or replace function public.react_comment(p_key text, p_comment_id bigint, p_kind text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  a uuid := _archer(p_key);
  c record;
begin
  if p_kind is null or p_kind not in ('like', 'sad', 'yes', 'thanks') then raise exception 'bad reaction'; end if;
  select mc.memo_id, mc.archer_id, ca.hidden into c from memo_comments mc join archers ca on ca.id = mc.archer_id where mc.id = p_comment_id;
  if c.memo_id is null or c.hidden or _comment_report_hidden(p_comment_id) or not _can_see_memo(a, c.memo_id) then raise exception 'no such comment'; end if;
  if c.archer_id = a then raise exception 'own comment'; end if;
  delete from comment_reactions where comment_id = p_comment_id and archer_id = a and kind = p_kind;
  if not found then
    insert into comment_reactions (comment_id, archer_id, kind) values (p_comment_id, a, p_kind);
  end if;
  return jsonb_build_object('reactions', _comment_reaction_counts(p_comment_id, a),
    'mine', coalesce((select jsonb_agg(kind order by kind) from comment_reactions where comment_id = p_comment_id and archer_id = a), '[]'::jsonb));
end $$;

-- 공개 메모 목록: 신고가 많은 남의 메모와 댓글은 빼고, 내 메모면 숨겨졌는지(report_hidden) 알린다 (나머지는 018과 같다)
drop function if exists public.shared_memo_list(text, text, bigint, int);
create function public.shared_memo_list(p_key text default null, p_filter text default 'all', p_before bigint default null, p_limit int default 30)
returns table (id bigint, nickname text, range_name text, dan int, day date, end_no int, hits boolean[], tags text[], memo text, scope text,
               created_at timestamptz, updated_at timestamptz, mine boolean, comments int, last_comment bigint,
               kind text, ends int, hit_count int, reactions jsonb, my_reactions text[], reaction_last jsonb, report_hidden boolean)
language plpgsql stable security definer set search_path = public, extensions as $fn$
declare
  me_id uuid;
  me_club text;
  cond text;
begin
  if p_key is not null then
    select a.id, lower(a.range_name) into me_id, me_club from archers a where a.key_hash = digest(p_key, 'sha256');
  end if;
  case coalesce(p_filter, 'all')
    when 'all' then
      cond := case when me_id is null then 'not a.hidden and m.scope = ''all'''
        else format('m.archer_id = %L or (not a.hidden and (m.scope = ''all''%s))', me_id,
          case when me_club is null then '' else format(' or lower(a.range_name) = %L', me_club) end) end;
    when 'club' then
      if me_club is null then return; end if;
      cond := format('lower(a.range_name) = %L and (m.archer_id = %L or not a.hidden)', me_club, me_id);
    when 'mine' then
      if me_id is null then return; end if;
      cond := format('m.archer_id = %L', me_id);
    else return;
  end case;
  return query execute format($q$
    with page as materialized (
      select m.id from shared_memos m join archers a on a.id = m.archer_id
      where (%s) and m.id < %s
        and (m.archer_id is not distinct from $1 or not _memo_report_hidden(m.id))
      order by m.id desc
      limit $2
    )
    select m.id, a.nickname, a.range_name, a.dan::int, m.day, m.end_no::int, m.hits, m.tags, m.memo, m.scope,
           m.created_at, m.updated_at, ($1 is not null and m.archer_id = $1), cc.n, cc.last,
           m.kind, m.ends::int, m.hit_count::int,
           _memo_reaction_counts(m.id, $1),
           coalesce((select array_agg(r.kind order by r.kind) from memo_reactions r where r.memo_id = m.id and r.archer_id = $1), '{}'),
           case when m.archer_id = $1 then (
             select coalesce(jsonb_object_agg(t.kind, t.last), '{}'::jsonb) from (
               select r.kind, max(r.seq) as last from memo_reactions r join archers ra on ra.id = r.archer_id
               where r.memo_id = m.id and not ra.hidden group by r.kind
             ) t) end,
           (m.archer_id is not distinct from $1 and _memo_report_hidden(m.id))
    from page p
    join shared_memos m on m.id = p.id
    join archers a on a.id = m.archer_id
    left join lateral (
      select count(*)::int as n, max(c.id) filter (where c.archer_id <> m.archer_id) as last
      from memo_comments c join archers ca on ca.id = c.archer_id
      where c.memo_id = m.id and (c.archer_id is not distinct from $1 or (not ca.hidden and not _comment_report_hidden(c.id)))
    ) cc on true
    order by m.id desc
  $q$, cond, coalesce(p_before, 9223372036854775807)::text)
  using me_id, least(greatest(coalesce(p_limit, 30), 1), 50);
end $fn$;

-- 댓글 목록: 신고가 많은 남의 댓글은 빼고, 내 댓글이면 숨겨졌는지(report_hidden) 알린다 (나머지는 018과 같다)
drop function if exists public.memo_comment_list(text, bigint, bigint, int);
create function public.memo_comment_list(p_key text, p_memo_id bigint, p_before bigint default null, p_limit int default 50)
returns table (id bigint, nickname text, range_name text, dan int, body text, created_at timestamptz, mine boolean, can_delete boolean, total int,
               reactions jsonb, my_reactions text[], report_hidden boolean)
language sql stable security definer set search_path = public, extensions as $$
  with me as (select a.id from archers a where p_key is not null and a.key_hash = digest(p_key, 'sha256')),
  visible as (
    select c.*, m.archer_id as memo_owner, a.nickname, a.range_name, a.dan
    from memo_comments c
    join shared_memos m on m.id = c.memo_id
    join archers a on a.id = c.archer_id
    left join me on true
    where c.memo_id = p_memo_id
      and _can_see_memo(me.id, p_memo_id)
      and (c.archer_id = me.id or (not a.hidden and not _comment_report_hidden(c.id)))
  ),
  page as (
    select v.* from visible v
    where p_before is null or v.id < p_before
    order by v.id desc
    limit least(greatest(coalesce(p_limit, 50), 1), 100)
  )
  select p.id, p.nickname, p.range_name, p.dan::int, p.body, p.created_at,
         (me.id is not null and p.archer_id = me.id),
         (me.id is not null and (p.archer_id = me.id or p.memo_owner = me.id)),
         (select count(*)::int from visible),
         _comment_reaction_counts(p.id, me.id),
         coalesce((select array_agg(r.kind order by r.kind) from comment_reactions r where r.comment_id = p.id and r.archer_id = me.id), '{}'),
         (me.id is not null and p.archer_id = me.id and _comment_report_hidden(p.id))
  from page p left join me on true
  order by p.id
$$;

revoke all on function public._memo_report_hidden(bigint), public._comment_report_hidden(bigint) from public, anon, authenticated;
grant execute on function public.comment_news(text, bigint), public.react_comment(text, bigint, text),
  public.shared_memo_list(text, text, bigint, int), public.memo_comment_list(text, bigint, bigint, int) to anon;

-- 활쏜얘기 메모·댓글에 글쓴 때의 등급을 적어 두고 목록에 함께 돌려준다 (020)
alter table public.shared_memos add column if not exists grade smallint;
alter table public.memo_comments add column if not exists grade smallint;

-- 새 글을 넣을 때 글쓴이의 지금 등급을 적는다
create or replace function public._stamp_grade() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.grade := (select a.grade from archers a where a.id = new.archer_id);
  return new;
end $$;
revoke all on function public._stamp_grade() from public, anon, authenticated;

drop trigger if exists shared_memos_grade on public.shared_memos;
create trigger shared_memos_grade before insert on public.shared_memos for each row execute function public._stamp_grade();
drop trigger if exists memo_comments_grade on public.memo_comments;
create trigger memo_comments_grade before insert on public.memo_comments for each row execute function public._stamp_grade();

-- 공개 메모 목록에 글쓴 때의 등급(grade)을 더한다 (나머지는 019와 같다)
drop function if exists public.shared_memo_list(text, text, bigint, int);
create function public.shared_memo_list(p_key text default null, p_filter text default 'all', p_before bigint default null, p_limit int default 30)
returns table (id bigint, nickname text, range_name text, dan int, day date, end_no int, hits boolean[], tags text[], memo text, scope text,
               created_at timestamptz, updated_at timestamptz, mine boolean, comments int, last_comment bigint,
               kind text, ends int, hit_count int, reactions jsonb, my_reactions text[], reaction_last jsonb, report_hidden boolean, grade int)
language plpgsql stable security definer set search_path = public, extensions as $fn$
declare
  me_id uuid;
  me_club text;
  cond text;
begin
  if p_key is not null then
    select a.id, lower(a.range_name) into me_id, me_club from archers a where a.key_hash = digest(p_key, 'sha256');
  end if;
  case coalesce(p_filter, 'all')
    when 'all' then
      cond := case when me_id is null then 'not a.hidden and m.scope = ''all'''
        else format('m.archer_id = %L or (not a.hidden and (m.scope = ''all''%s))', me_id,
          case when me_club is null then '' else format(' or lower(a.range_name) = %L', me_club) end) end;
    when 'club' then
      if me_club is null then return; end if;
      cond := format('lower(a.range_name) = %L and (m.archer_id = %L or not a.hidden)', me_club, me_id);
    when 'mine' then
      if me_id is null then return; end if;
      cond := format('m.archer_id = %L', me_id);
    else return;
  end case;
  return query execute format($q$
    with page as materialized (
      select m.id from shared_memos m join archers a on a.id = m.archer_id
      where (%s) and m.id < %s
        and (m.archer_id is not distinct from $1 or not _memo_report_hidden(m.id))
      order by m.id desc
      limit $2
    )
    select m.id, a.nickname, a.range_name, a.dan::int, m.day, m.end_no::int, m.hits, m.tags, m.memo, m.scope,
           m.created_at, m.updated_at, ($1 is not null and m.archer_id = $1), cc.n, cc.last,
           m.kind, m.ends::int, m.hit_count::int,
           _memo_reaction_counts(m.id, $1),
           coalesce((select array_agg(r.kind order by r.kind) from memo_reactions r where r.memo_id = m.id and r.archer_id = $1), '{}'),
           case when m.archer_id = $1 then (
             select coalesce(jsonb_object_agg(t.kind, t.last), '{}'::jsonb) from (
               select r.kind, max(r.seq) as last from memo_reactions r join archers ra on ra.id = r.archer_id
               where r.memo_id = m.id and not ra.hidden group by r.kind
             ) t) end,
           (m.archer_id is not distinct from $1 and _memo_report_hidden(m.id)),
           m.grade::int
    from page p
    join shared_memos m on m.id = p.id
    join archers a on a.id = m.archer_id
    left join lateral (
      select count(*)::int as n, max(c.id) filter (where c.archer_id <> m.archer_id) as last
      from memo_comments c join archers ca on ca.id = c.archer_id
      where c.memo_id = m.id and (c.archer_id is not distinct from $1 or (not ca.hidden and not _comment_report_hidden(c.id)))
    ) cc on true
    order by m.id desc
  $q$, cond, coalesce(p_before, 9223372036854775807)::text)
  using me_id, least(greatest(coalesce(p_limit, 30), 1), 50);
end $fn$;

-- 댓글 목록에 쓴 때의 등급(grade)을 더한다 (나머지는 019와 같다)
drop function if exists public.memo_comment_list(text, bigint, bigint, int);
create function public.memo_comment_list(p_key text, p_memo_id bigint, p_before bigint default null, p_limit int default 50)
returns table (id bigint, nickname text, range_name text, dan int, body text, created_at timestamptz, mine boolean, can_delete boolean, total int,
               reactions jsonb, my_reactions text[], report_hidden boolean, grade int)
language sql stable security definer set search_path = public, extensions as $$
  with me as (select a.id from archers a where p_key is not null and a.key_hash = digest(p_key, 'sha256')),
  visible as (
    select c.*, m.archer_id as memo_owner, a.nickname, a.range_name, a.dan
    from memo_comments c
    join shared_memos m on m.id = c.memo_id
    join archers a on a.id = c.archer_id
    left join me on true
    where c.memo_id = p_memo_id
      and _can_see_memo(me.id, p_memo_id)
      and (c.archer_id = me.id or (not a.hidden and not _comment_report_hidden(c.id)))
  ),
  page as (
    select v.* from visible v
    where p_before is null or v.id < p_before
    order by v.id desc
    limit least(greatest(coalesce(p_limit, 50), 1), 100)
  )
  select p.id, p.nickname, p.range_name, p.dan::int, p.body, p.created_at,
         (me.id is not null and p.archer_id = me.id),
         (me.id is not null and (p.archer_id = me.id or p.memo_owner = me.id)),
         (select count(*)::int from visible),
         _comment_reaction_counts(p.id, me.id),
         coalesce((select array_agg(r.kind order by r.kind) from comment_reactions r where r.comment_id = p.id and r.archer_id = me.id), '{}'),
         (me.id is not null and p.archer_id = me.id and _comment_report_hidden(p.id)),
         p.grade::int
  from page p left join me on true
  order by p.id
$$;

grant execute on function public.shared_memo_list(text, text, bigint, int), public.memo_comment_list(text, bigint, bigint, int) to anon;
