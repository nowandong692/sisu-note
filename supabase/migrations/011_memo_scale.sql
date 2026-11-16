-- 011: 활쏜얘기 글과 댓글이 많아질 때 대비
-- * "우리 활터" 거르기: 활터 이름 색인과 궁사별 최근 메모 색인으로, 같은 활터 궁사의 메모만 바로 찾는다.
-- * 공개 메모 목록: 거르기마다 알맞은 조건으로 바로 찾도록 다시 만든다. 전에는 서버가 매번 메모 전체를
--   훑은 뒤 최근 30개를 골랐다 (메모 20만 개에서 한 번에 약 0.4초, 바꾼 뒤 1밀리초 안팎).
-- * 댓글: 한 번에 최근 50개씩, 앞의 댓글은 "이전 댓글 더 보기"로 이어서 불러온다 (전에는 200개에서 끊겼다).
-- 여러 번 실행해도 괜찮다. 007~010을 먼저 실행해야 한다.

begin;

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

commit;
