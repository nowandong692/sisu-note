-- 010: 하루 메모 공개
-- * 순 메모와 같은 표(shared_memos)에 하루 메모를 kind = 'day'로 올린다. 그래서 댓글, 신고, 새 댓글 표시, 관리자 삭제가 그대로 된다.
-- * 하루 메모에는 다섯 시 관중 대신 그날 쏜 순 수(ends)와 관중 수(hit_count)를 올린다. 태그는 없다.
-- * 궁사마다 하루에 하나: client_id는 'day:YYYY-MM-DD'.
-- 여러 번 실행해도 괜찮다. 007, 008, 009를 먼저 실행해야 한다.

begin;

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

commit;
