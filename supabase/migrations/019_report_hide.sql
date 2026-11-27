-- 019: 신고가 20건을 넘은 활쏜얘기 메모·댓글은 다른 사람에게 보이지 않는다
-- * 한 메모(댓글)에 서로 다른 궁사의 신고가 21건 이상 쌓이면 목록, 댓글, 반응, 새 댓글 알림에서 빠진다.
--   메모가 숨겨지면 그 메모의 댓글을 보거나 달 수도 없다 (_can_see_memo).
-- * 글쓴이 본인에게는 그대로 보이고, report_hidden = true로 숨겨진 것을 알린다.
-- * 관리자는 신고 목록(admin_content_reports)에서 그대로 보고, 지우거나 '처리 완료'로 신고를 닫는다.
--   처리 완료로 신고가 지워지면 다시 모두에게 보인다.
-- 여러 번 실행해도 괜찮다. 009, 018을 먼저 실행해야 한다.

begin;

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

commit;

notify pgrst, 'reload schema';
