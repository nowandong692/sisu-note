-- 008: 공개 메모에 댓글 (2단계: 댓글 달기·지우기)
-- * 랭킹에 참여해 닉네임이 있는 궁사만 댓글을 단다. 그 메모를 볼 수 있어야 한다 (같은 활터 공개는 같은 활터 궁사만).
-- * 댓글은 쓴 사람이 지울 수 있고, 메모 주인은 자기 메모에 달린 댓글을 모두 지울 수 있다.
-- * 메모 공개를 내리거나 순을 지우면 댓글도 함께 지워진다. 탈퇴하면 그 궁사의 댓글도 지워진다.
-- * 랭킹에서 숨긴 궁사의 댓글은 다른 사람에게 보이지 않는다.
-- 여러 번 실행해도 괜찮다. 007_shared_memos.sql을 먼저 실행해야 한다.

begin;

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

commit;
