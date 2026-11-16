-- 009: 공개 메모 3단계 (신고, 관리자 삭제, 새 댓글 표시)
-- * 궁사는 남의 공개 메모나 댓글을 신고한다. 같은 것을 두 번 신고하면 한 번으로 친다.
-- * 관리자는 신고된 메모·댓글을 지우거나, 신고를 처리 완료로 닫는다. 메모를 지우면 그 댓글도 지워진다.
-- * 앱은 내 메모에 남이 단 새 댓글 수를 물어 활쏜얘기 탭에 빨간 점을 띄운다.
-- 여러 번 실행해도 괜찮다. 007, 008을 먼저 실행해야 한다.

begin;

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

commit;
