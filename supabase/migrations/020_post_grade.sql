-- 020: 활쏜얘기 메모·댓글에 글쓴 때의 등급(과녁 테두리)을 함께 보인다
-- * 메모와 댓글을 처음 올릴 때 글쓴이의 등급(archers.grade, 1~5, 015)을 그 글에 적어 둔다. 나중에 등급이 바뀌어도 그 글의 등급은 그대로다.
--   메모를 고쳐도(같은 순·같은 날 메모를 다시 올려도) 처음 올린 때의 등급을 둔다.
-- * 이 SQL을 실행하기 전에 올린 글은 등급을 모르므로 비워 둔다(null). 앱은 등급이 없는 글에 과녁을 그리지 않는다.
-- * shared_memo_list, memo_comment_list가 grade 열을 더 돌려준다. 예전 앱은 새 열을 무시하므로 그대로 동작한다.
-- 여러 번 실행해도 괜찮다. 015, 019를 먼저 실행해야 한다.

begin;

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

commit;

notify pgrst, 'reload schema';
