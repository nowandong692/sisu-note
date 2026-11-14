-- 국궁록 온라인 랭킹 서버 구조 (Supabase SQL Editor에 그대로 붙여 넣어 실행)
--
-- 개인정보 최소화 원칙
--  * 로그인 없음. 앱이 만든 무작위 열쇠(= 복구 코드)의 SHA-256 해시만 저장한다. 열쇠 원문은 서버에 없다.
--  * 저장하는 것: 닉네임, (원하면) 활터 이름, 순마다 서버 기준 날짜, 저장 시각과 다섯 시의 관중 여부.
--  * 메모, 태그, 장비, 위치, 날씨는 올리지 않는다.
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
  created_at timestamptz not null default now(),
  constraint nickname_len check (char_length(nickname) between 1 and 12),
  constraint range_len check (range_name is null or char_length(range_name) <= 30)
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

-- 처음 참여: 열쇠와 닉네임 등록
create or replace function public.register(p_key text, p_nickname text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if p_key is null or char_length(p_key) < 20 then raise exception 'bad key'; end if;
  insert into archers (key_hash, nickname) values (digest(p_key, 'sha256'), btrim(p_nickname));
exception when unique_violation then
  raise exception 'nickname taken';
end $$;

-- 복구 코드 확인 (새 휴대폰에서): 맞으면 닉네임을 돌려준다
create or replace function public.whoami(p_key text) returns table (nickname text, range_name text)
language sql stable security definer set search_path = public, extensions as $$
  select nickname, range_name from archers where key_hash = digest(p_key, 'sha256')
$$;

create or replace function public.set_profile(p_key text, p_nickname text, p_range_name text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  update archers set nickname = btrim(p_nickname), range_name = nullif(btrim(p_range_name), '')
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
  where lower(a.nickname) = lower(p_nickname) and e.day between span.d0 and span.d1
    and p_period in ('day', 'week', 'month')
  order by e.day, e.recorded_at
  limit 1500
$$;

create or replace function public.report(p_nickname text, p_reason text) returns void
language sql security definer set search_path = public, extensions as $$
  insert into reports (target, reason) select id, left(p_reason, 200) from archers where lower(nickname) = lower(p_nickname)
$$;

revoke all on function public._archer(text), public._today(), public._max_ends_per_day() from public, anon, authenticated;
grant execute on function public.register(text, text), public.whoami(text), public.set_profile(text, text, text),
  public.submit_end(text, text, boolean[], timestamptz), public.delete_end(text, text), public.delete_me(text),
  public.period_totals(text, date, text), public.archer_ends(text, text, date), public.report(text, text) to anon;
