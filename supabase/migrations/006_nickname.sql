-- 006: 닉네임 중복 막기
-- * 닉네임은 대소문자를 가리지 않고 하나뿐이다 (archers_nickname_uq). 이미 겹친 닉네임이 있으면
--   먼저 참여한 궁사가 그대로 쓰고, 나중에 참여한 궁사는 "닉네임2", "닉네임3"…으로 바꾼 뒤 제약을 건다.
-- * 앞뒤 공백, 겹친 공백, 풀어 쓴 한글 자모 차이로 사실상 같은 닉네임이 생기지 않게 서버에서 다듬는다.
-- * 입력하는 동안 앱이 물어볼 수 있게 nickname_available을 연다.
-- 여러 번 실행해도 괜찮다.

begin;

create or replace function public._clean_nick(p text) returns text
language sql immutable set search_path = public as $$
  select regexp_replace(btrim(normalize(coalesce(p, ''), NFC)), '\s+', ' ', 'g')
$$;

-- 이미 있는 닉네임을 다듬고, 겹치는 닉네임은 나중에 참여한 쪽에 번호를 붙인다.
-- 먼저 참여한 순서로 정리하려고 제약을 잠깐 내렸다가 (같은 트랜잭션 안에서) 다시 건다.
drop index if exists public.archers_nickname_uq;
do $$
declare r record; base text; cand text; n int;
begin
  for r in select id, nickname, created_at from archers order by created_at, id loop
    base := left(_clean_nick(r.nickname), 10);
    if base = '' then base := '궁사'; end if;
    cand := _clean_nick(r.nickname);
    if cand = '' or char_length(cand) > 12 then cand := base; end if;
    n := 1;
    while exists (select 1 from archers a where a.id <> r.id and lower(a.nickname) = lower(cand)
                  and (a.created_at, a.id) < (r.created_at, r.id)) loop
      n := n + 1;
      cand := base || n;
    end loop;
    if cand is distinct from r.nickname then
      update archers set nickname = cand where id = r.id;
    end if;
  end loop;
end $$;

create unique index if not exists archers_nickname_uq on public.archers (lower(nickname));

-- 이 닉네임을 쓸 수 있는가. p_key를 주면 내 닉네임은 쓸 수 있는 것으로 본다
create or replace function public.nickname_available(p_nickname text, p_key text default null) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select char_length(_clean_nick(p_nickname)) between 1 and 12
     and not exists (
       select 1 from archers
       where lower(nickname) = lower(_clean_nick(p_nickname))
         and (p_key is null or key_hash <> digest(p_key, 'sha256')))
$$;

create or replace function public.register(p_key text, p_nickname text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if p_key is null or char_length(p_key) < 20 then raise exception 'bad key'; end if;
  insert into archers (key_hash, nickname) values (digest(p_key, 'sha256'), _clean_nick(p_nickname));
exception when unique_violation then
  raise exception 'nickname taken';
end $$;

create or replace function public.set_profile(p_key text, p_nickname text, p_range_name text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  update archers set nickname = _clean_nick(p_nickname), range_name = nullif(btrim(p_range_name), '')
  where id = _archer(p_key);
exception when unique_violation then
  raise exception 'nickname taken';
end $$;

revoke all on function public._clean_nick(text) from public, anon, authenticated;
grant execute on function public.nickname_available(text, text) to anon;

commit;
