-- 013: 순 기록·하루 메모 백업
-- * 휴대폰 브라우저가 저장소를 비우면 순 기록과 하루 메모가 모두 사라졌다. 012는 장비와 설정만 백업했다.
-- * 랭킹에 참여한 궁사는 순 기록(과녁 위치, 장비, 태그, 메모, 날씨 포함)과 하루 메모를 한 줄씩 서버에 올려 두고,
--   복구 코드를 넣으면 모두 다시 불러온다. 012와 같이 열쇠(복구 코드)를 아는 본인만 읽고 쓴다. 탈퇴하면 함께 지워진다.
-- * 백업이 생기기 전에 사라진 기록을 위해, 복구할 때 랭킹에 올라간 순(날짜, 저장 시각, 다섯 시 관중 여부)과
--   공개했던 메모·태그도 돌려준다 (my_ranked_ends).
-- * 한 줄은 20KB까지, 궁사마다 5만 줄까지 받는다.
-- 여러 번 실행해도 괜찮다. 012를 먼저 실행해야 한다.

begin;

create table if not exists public.record_backups (
  archer_id uuid not null references public.archers (id) on delete cascade,
  -- 순은 앱의 순 id, 하루 메모는 'day:YYYY-MM-DD'
  client_id text not null,
  data jsonb not null,
  -- 앱이 마지막으로 고친 시각 (ms). 더 오래된 내용이 새 내용을 덮어쓰지 않게 한다
  updated_ms bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (archer_id, client_id),
  constraint rb_client_id_len check (char_length(client_id) <= 64)
);
alter table public.record_backups enable row level security;
revoke all on public.record_backups from anon, authenticated;

-- 여러 줄 올리기: [{ "id": "...", "u": 1700000000000, "data": {...} }, ...] (한 번에 200줄까지)
create or replace function public.save_records(p_key text, p_rows jsonb) returns int
language plpgsql security definer set search_path = public, extensions as $$
declare a uuid := _archer(p_key); n int;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'bad records'; end if;
  if jsonb_array_length(p_rows) > 200 then raise exception 'too many records'; end if;
  if exists (select 1 from jsonb_array_elements(p_rows) r
             where jsonb_typeof(r->'data') is distinct from 'object' or coalesce(r->>'id', '') = ''
                or char_length(r->>'id') > 64 or octet_length((r->'data')::text) > 20000) then
    raise exception 'bad records';
  end if;
  if (select count(*) from record_backups where archer_id = a) + jsonb_array_length(p_rows) > 50000 then
    raise exception 'too many records';
  end if;
  insert into record_backups (archer_id, client_id, data, updated_ms, updated_at)
  select a, r->>'id', r->'data', coalesce((r->>'u')::bigint, 0), now() from jsonb_array_elements(p_rows) r
  on conflict (archer_id, client_id) do update
    set data = excluded.data, updated_ms = excluded.updated_ms, updated_at = now()
    where record_backups.updated_ms <= excluded.updated_ms;
  get diagnostics n = row_count;
  return n;
end $$;

-- 지운 순·하루 메모를 백업에서도 지운다
create or replace function public.delete_records(p_key text, p_ids text[]) returns void
language sql security definer set search_path = public, extensions as $$
  delete from record_backups where archer_id = _archer(p_key) and client_id = any (p_ids)
$$;

-- 백업 불러오기: client_id 순서로 p_limit줄씩. 다음에는 마지막 client_id를 p_after로 준다
create or replace function public.load_records(p_key text, p_after text default null, p_limit int default 500)
returns table (client_id text, data jsonb)
language sql stable security definer set search_path = public, extensions as $$
  select b.client_id, b.data from record_backups b
  where b.archer_id = _archer(p_key) and (p_after is null or b.client_id > p_after)
  order by b.client_id
  limit least(greatest(coalesce(p_limit, 500), 1), 1000)
$$;

-- 랭킹에 올라간 내 순 모두 (백업 전에 사라진 기록을 되살릴 때 쓴다). 공개했던 순은 메모와 태그도 함께
create or replace function public.my_ranked_ends(p_key text)
returns table (client_id text, day date, recorded_at timestamptz, hits boolean[], tags text[], memo text, scope text)
language sql stable security definer set search_path = public, extensions as $$
  select e.client_id, e.day, e.recorded_at, e.hits, m.tags, m.memo, m.scope
  from ends e
  left join shared_memos m on m.archer_id = e.archer_id and m.client_id = e.client_id
  where e.archer_id = _archer(p_key)
  order by e.recorded_at
$$;

grant execute on function public.save_records(text, jsonb), public.delete_records(text, text[]),
  public.load_records(text, text, int), public.my_ranked_ends(text) to anon;

commit;
