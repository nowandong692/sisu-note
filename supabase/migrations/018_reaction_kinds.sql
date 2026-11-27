-- 018: 반응을 종류마다 한 번씩, 댓글에도 반응
-- * 한 사람이 한 메모(댓글)에 좋아요·슬퍼요·넵!·감사해요를 종류마다 한 번씩 남길 수 있다 (여러 개 함께 가능).
--   같은 반응을 다시 누르면 그 반응만 취소된다. (017은 한 사람이 하나만 남겼다)
-- * 댓글에도 같은 반응을 남긴다. 그 메모를 볼 수 있어야 하고, 내 댓글에는 반응하지 않는다.
--   댓글이 지워지거나 탈퇴하면 반응도 함께 지워진다. 랭킹에서 숨긴 궁사의 반응은 세지 않는다.
-- * 돌려주는 값: my_reaction(하나) 대신 my_reactions(목록). 메모 목록과 댓글 목록 모두.
-- 여러 번 실행해도 괜찮다. 017을 먼저 실행해야 한다.

begin;

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

commit;

notify pgrst, 'reload schema';
