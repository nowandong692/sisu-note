-- 같은 사람이 닉네임 두 개(예: "노완동"과 "노완동o")로 나뉘었을 때 하나로 합치기
-- Supabase SQL Editor에서 쓴다. 앱이 부르는 함수가 아니다.
--
-- 1단계 (확인만, 아무것도 바뀌지 않는다): 아래 [1단계] 부분만 골라 실행한다.
--   '여기에-복구-코드'를 지금 앱의 복구 코드로 바꾸면 (화면에 보이는 그대로, 하이픈 포함) "내_코드" 칸이 true인 줄이 지금 쓰는 닉네임이다.
-- 2단계 (합치기): [2단계] 부분을 실행한다. my_code, want_name, others를 먼저 고친다.
--   * 지금 복구 코드의 닉네임으로 다른 닉네임의 랭킹 순, 공개 메모, 댓글, 백업을 모두 옮긴다.
--   * 옮긴 뒤 다른 닉네임은 지우고, 남은 닉네임 이름을 want_name으로 바꾼다.
--   * 복구 코드는 지금 것을 그대로 쓴다.
--   * 하나라도 잘못되면 아무것도 바뀌지 않는다.

-- [1단계] 확인 ------------------------------------------------------------
select a.nickname as 닉네임,
       a.created_at::date as 만든_날,
       (select count(*) from ends e where e.archer_id = a.id) as 랭킹_순_수,
       (select min(day) from ends e where e.archer_id = a.id) as 첫_날,
       (select max(day) from ends e where e.archer_id = a.id) as 마지막_날,
       exists (select 1 from backups b where b.archer_id = a.id) as 장비_백업,
       a.key_hash = extensions.digest('여기에-복구-코드', 'sha256') as 내_코드
from archers a
where a.nickname like '노완동%'
order by a.created_at;

-- [2단계] 합치기 ----------------------------------------------------------
do $$
declare
  my_code   text   := '여기에-복구-코드';      -- 지금 앱에서 쓰는 복구 코드 (겨루기 탭 → 복구 코드)
  want_name text   := '노완동';                -- 합친 뒤 쓸 닉네임
  others    text[] := array['노완동', '노완동o']; -- 합칠 닉네임들 (내 닉네임이 들어 있어도 괜찮다)
  s text;
  keep uuid;
  o record;
  moved int;
begin
  -- 앱과 같은 규칙으로 코드 정리: 대문자, 기호 빼고 4글자마다 하이픈
  s := upper(regexp_replace(my_code, '[^0-9A-Za-z]', '', 'g'));
  select string_agg(substr(s, i, 4), '-' order by i) into my_code from generate_series(1, char_length(s), 4) i;
  select id into keep from archers where key_hash = extensions.digest(my_code, 'sha256');
  if keep is null then raise exception '복구 코드가 맞는 닉네임이 없습니다. 코드를 다시 확인해 주세요.'; end if;

  for o in select id, nickname, range_name, dan from archers
           where lower(nickname) = any (select lower(x) from unnest(others) x) and id <> keep loop
    update ends set archer_id = keep
      where archer_id = o.id and client_id not in (select client_id from ends where archer_id = keep);
    get diagnostics moved = row_count;
    update shared_memos set archer_id = keep
      where archer_id = o.id and client_id not in (select client_id from shared_memos where archer_id = keep);
    update memo_comments set archer_id = keep where archer_id = o.id;
    update content_reports c set reporter = keep where reporter = o.id
      and not exists (select 1 from content_reports k where k.reporter = keep
                      and (k.memo_id = c.memo_id or k.comment_id = c.comment_id));
    update reports set target = keep where target = o.id;
    -- 장비·설정 백업: 지금 닉네임에 없으면 옮긴다
    update backups set archer_id = keep where archer_id = o.id and not exists (select 1 from backups where archer_id = keep);
    -- 순 기록 백업 (013을 실행했으면)
    if to_regclass('public.record_backups') is not null then
      execute 'update record_backups set archer_id = $1 where archer_id = $2
               and client_id not in (select client_id from record_backups where archer_id = $1)' using keep, o.id;
    end if;
    update archers set range_name = coalesce(range_name, o.range_name), dan = coalesce(dan, o.dan) where id = keep;
    delete from archers where id = o.id; -- 옮기지 못한 겹친 줄은 함께 지워진다
    raise notice '"%"의 랭킹 순 %개를 옮기고 지웠습니다', o.nickname, moved;
  end loop;

  update archers set nickname = _clean_nick(want_name) where id = keep;
  raise notice '이제 닉네임은 "%"이고, 랭킹 순은 모두 %개입니다', want_name, (select count(*) from ends where archer_id = keep);
end $$;
