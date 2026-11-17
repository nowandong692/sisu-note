-- 012: 장비·설정 백업
-- * 휴대폰 브라우저가 저장소를 비우면 장비와 설정이 사라졌다. 랭킹에 참여한 궁사는 장비 목록과 설정(소속, 단, 활터,
--   태그, 고른 장비, 화면 테마 등)을 서버에 한 덩어리(JSON)로 올려 두고, 복구 코드를 넣으면 다시 불러온다.
-- * 궁사마다 한 줄. 열쇠(복구 코드)를 아는 사람만 읽고 쓴다. 남에게는 보이지 않는다. 탈퇴하면 함께 지워진다.
-- * 너무 큰 백업은 받지 않는다 (200KB).
-- 여러 번 실행해도 괜찮다.

begin;

create table if not exists public.backups (
  archer_id uuid primary key references public.archers (id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.backups enable row level security;
revoke all on public.backups from anon, authenticated;

create or replace function public.save_backup(p_key text, p_data jsonb) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare a uuid := _archer(p_key);
begin
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'bad backup'; end if;
  if octet_length(p_data::text) > 200000 then raise exception 'backup too large'; end if;
  insert into backups (archer_id, data, updated_at) values (a, p_data, now())
  on conflict (archer_id) do update set data = excluded.data, updated_at = now();
end $$;

create or replace function public.load_backup(p_key text) returns jsonb
language sql stable security definer set search_path = public, extensions as $$
  select b.data from backups b where b.archer_id = _archer(p_key)
$$;

grant execute on function public.save_backup(text, jsonb), public.load_backup(text) to anon;

commit;
