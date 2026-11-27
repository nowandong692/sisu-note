-- 017: 활쏜얘기 메모에 반응 (좋아요, 슬퍼요, 넵!, 감사해요)
-- * 랭킹에 참여해 닉네임이 있는 궁사만 반응한다. 그 메모를 볼 수 있어야 하고, 내 메모에는 반응하지 않는다.
-- * 한 메모에 한 사람이 반응 하나. 다른 반응을 누르면 바뀌고, 같은 반응을 다시 누르면 취소된다.
-- * 메모가 내려가거나 탈퇴하면 반응도 함께 지워진다. 랭킹에서 숨긴 궁사의 반응은 세지 않는다.
-- * 내 메모에 새 반응: 반응을 누르거나 바꿀 때마다 새 번호(seq)를 받는다. 앱은 어디까지 봤는지 번호로 기억하고,
--   그보다 뒤의 반응을 새 댓글처럼 알려 준다 (reaction_news, shared_memo_list의 reaction_last).
-- 여러 번 실행해도 괜찮다. 007~011을 먼저 실행해야 한다.

begin;

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

commit;

notify pgrst, 'reload schema';
