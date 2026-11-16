-- 007: 순 메모 공개 (1단계: 공개하기와 공개 메모 보기)
-- * 궁사가 "공개"로 고른 순만 올라온다. 기본은 나만 보기(올리지 않음).
-- * 올리는 것: 습사한 날, 그날 몇 번째 순, 다섯 시의 관중 여부, 태그, 메모, 공개 범위.
--   장비, 위치, 날씨는 올리지 않는다.
-- * 공개 범위: 'all' 전체 / 'club' 내 소속 활터(랭킹 프로필의 활터 이름)가 같은 궁사만.
-- * 랭킹에서 숨긴 궁사의 메모는 다른 사람에게 보이지 않는다. 탈퇴(delete_me)하면 함께 지워진다.
-- 여러 번 실행해도 괜찮다.

begin;

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

commit;
