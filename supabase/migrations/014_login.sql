-- 014: 카카오·구글 로그인으로 기록 되찾기
-- * 휴대폰 브라우저가 쿠키·사이트 기록을 지우면 이 기기의 복구 코드도 사라졌다. 카카오나 구글 계정을 한 번 연결해 두면,
--   나중에 그 계정으로 로그인만 해도 복구 코드를 되찾아 닉네임과 기록을 모두 되살린다. 복구 코드는 그대로 쓸 수 있다.
--
-- 개인정보를 저장하지 않는다
--  * 이메일, 이름, 전화번호, 프로필 사진은 요청하지도 받지도 않는다. 카카오는 동의 항목 없이, 구글은 openid 범위만 쓴다.
--  * 로그인 회사가 주는 "이 앱에서의 회원 번호"도 원문으로 두지 않는다. 비밀 값(pepper)을 섞은
--    한 방향 해시(HMAC-SHA256)만 저장한다. 해시에서 회원 번호를 되돌려 낼 수 없다.
--  * 복구 코드는 그 회원 번호로만 열 수 있게 잠가 둔다(sealed_key). 회원 번호는 서버에 없으므로,
--    데이터가 새어 나가도 이 칸만으로는 복구 코드를 열 수 없다. 로그인을 다시 해야 그 순간에만 열린다.
--  * Supabase Auth(auth.users)는 쓰지 않는다. 그쪽은 이메일을 저장하기 때문이다.
--    대신 이 데이터베이스가 로그인 회사와 직접 인가 코드를 바꾼다 (http 확장).
--
--
-- 비밀 값은 Supabase Vault에 암호화해 둔다
--  * 구글·카카오 Client Secret과 해시에 섞는 pepper는 테이블에 평문으로 두지 않고 Vault(vault.secrets)에 둔다.
--    Vault는 데이터베이스 밖에 있는 키로 암호화하므로, 데이터베이스 백업이나 덤프가 새어 나가도 읽을 수 없다.
--  * login_config에는 공개해도 되는 client_id만 둔다 (카카오 REST API 키, 구글 클라이언트 ID는 로그인 주소에 그대로 보인다).
--  * 예전 014로 평문에 넣은 값이 있으면 이 파일이 Vault로 옮기고 평문은 지운다.
--
-- 준비: 이 파일을 실행한 뒤, supabase/login_keys.sql에 카카오·구글에서 받은 키를 넣어 실행한다.
-- 여러 번 실행해도 괜찮다. 013까지 먼저 실행해야 한다.

begin;

create extension if not exists http with schema extensions;

create extension if not exists supabase_vault;

-- 로그인 회사별 공개 client_id. (client_secret 칸은 예전 014에서 쓰던 것으로, 이제 비워 두고 Vault를 쓴다)
create table if not exists public.login_config (
  provider text primary key check (provider in ('kakao', 'google')),
  client_id text not null default '',
  client_secret text not null default ''
);
alter table public.login_config enable row level security;
revoke all on public.login_config from anon, authenticated;

-- Vault에 비밀 값 넣기 (있으면 바꾸기). SQL Editor에서만 부른다
create or replace function public._vault_put(p_name text, p_value text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare sid uuid;
begin
  select id into sid from vault.secrets where name = p_name;
  if sid is null then perform vault.create_secret(p_value, p_name);
  else perform vault.update_secret(sid, p_value);
  end if;
end $$;

create or replace function public._vault_get(p_name text) returns text
language sql stable security definer set search_path = public, extensions as $$
  select decrypted_secret from vault.decrypted_secrets where name = p_name
$$;

-- 해시에 섞는 pepper: 처음 한 번 무작위로 만들고 바꾸지 않는다 (바꾸면 연결이 모두 끊긴다).
-- 예전 014의 login_secret 테이블에 있던 값은 그대로 Vault로 옮기고 테이블을 지운다.
do $$
declare old bytea;
begin
  if public._vault_get('sisu_login_pepper') is null then
    if to_regclass('public.login_secret') is not null then
      execute 'select pepper from public.login_secret where id = 1' into old;
    end if;
    perform public._vault_put('sisu_login_pepper', encode(coalesce(old, extensions.gen_random_bytes(32)), 'hex'));
  end if;
  -- 예전 014로 평문에 넣은 Client Secret도 Vault로 옮긴다
  perform public._vault_put('sisu_login_secret_' || provider, client_secret)
  from public.login_config where client_secret <> '';
  update public.login_config set client_secret = '' where client_secret <> '';
end $$;
drop table if exists public.login_secret;

-- 키 넣기: login_keys.sql이 부른다. client_id는 login_config에, client_secret은 Vault에
create or replace function public.set_login_keys(p_provider text, p_client_id text, p_client_secret text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  insert into login_config (provider, client_id, client_secret) values (p_provider, btrim(coalesce(p_client_id, '')), '')
  on conflict (provider) do update set client_id = excluded.client_id, client_secret = '';
  perform _vault_put('sisu_login_secret_' || p_provider, btrim(coalesce(p_client_secret, '')));
end $$;

-- 연결된 로그인. 회원 번호의 해시와, 그 회원 번호로만 열리는 복구 코드
create table if not exists public.archer_logins (
  login_hash bytea primary key,
  archer_id uuid not null references public.archers (id) on delete cascade,
  provider text not null check (provider in ('kakao', 'google')),
  sealed_key bytea not null,
  created_at timestamptz not null default now(),
  unique (archer_id, provider)
);
alter table public.archer_logins enable row level security;
revoke all on public.archer_logins from anon, authenticated;

-- 인가 코드를 로그인 회사에 보내 회원 번호를 받는다. 회원 번호는 이 함수 밖으로 내보내지 않는다.
create or replace function public._login_sub(p_provider text, p_code text, p_redirect text, p_verifier text)
returns text
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  cfg login_config;
  r http_response;
  tok jsonb;
  sub text;
  part text;
  secret text;
begin
  select * into cfg from login_config where provider = p_provider;
  if cfg is null or cfg.client_id = '' then raise exception 'login not ready'; end if;
  secret := coalesce(_vault_get('sisu_login_secret_' || p_provider), '');
  if coalesce(p_code, '') = '' or char_length(p_code) > 2000 or coalesce(p_redirect, '') !~ '^https?://' then
    raise exception 'login failed';
  end if;
  perform http_set_curlopt('CURLOPT_TIMEOUT_MS', '8000');

  if p_provider = 'kakao' then
    r := http_post('https://kauth.kakao.com/oauth/token',
      urlencode(jsonb_strip_nulls(jsonb_build_object(
        'grant_type', 'authorization_code', 'client_id', cfg.client_id, 'redirect_uri', p_redirect,
        'code', p_code, 'client_secret', nullif(secret, '')))),
      'application/x-www-form-urlencoded;charset=utf-8');
    if r.status <> 200 then raise exception 'login failed'; end if;
    tok := r.content::jsonb;
    -- 토큰 정보만 묻는다: 회원 번호(id) 말고는 아무것도 받지 않는다
    r := http(('GET', 'https://kapi.kakao.com/v1/user/access_token_info',
      array[http_header('Authorization', 'Bearer ' || (tok->>'access_token'))], null, null)::http_request);
    if r.status <> 200 then raise exception 'login failed'; end if;
    sub := r.content::jsonb->>'id';
  else
    r := http_post('https://oauth2.googleapis.com/token',
      urlencode(jsonb_strip_nulls(jsonb_build_object(
        'grant_type', 'authorization_code', 'client_id', cfg.client_id, 'client_secret', secret,
        'redirect_uri', p_redirect, 'code', p_code, 'code_verifier', nullif(p_verifier, '')))),
      'application/x-www-form-urlencoded');
    if r.status <> 200 then raise exception 'login failed'; end if;
    tok := r.content::jsonb;
    -- 구글에서 바로 받은 id_token이라 서명 확인 없이 내용을 읽어도 된다. openid 범위라 회원 번호(sub)만 들어 있다
    part := translate(split_part(tok->>'id_token', '.', 2), '-_', '+/');
    part := part || repeat('=', (4 - char_length(part) % 4) % 4);
    sub := convert_from(decode(part, 'base64'), 'utf8')::jsonb->>'sub';
    if (convert_from(decode(part, 'base64'), 'utf8')::jsonb->>'aud') is distinct from cfg.client_id then
      raise exception 'login failed';
    end if;
  end if;

  if coalesce(sub, '') = '' then raise exception 'login failed'; end if;
  return sub;
exception
  when raise_exception then raise;
  when others then raise exception 'login failed';
end $$;

create or replace function public._login_hash(p_provider text, p_sub text) returns bytea
language sql stable security definer set search_path = public, extensions as $$
  select hmac(convert_to(p_provider || ':' || p_sub, 'utf8'), decode(_vault_get('sisu_login_pepper'), 'hex'), 'sha256')
$$;

-- 복구 코드를 잠그는 비밀번호. 저장하는 해시와는 다른 값이라 해시로는 열 수 없다
create or replace function public._login_seal(p_provider text, p_sub text) returns text
language sql stable security definer set search_path = public, extensions as $$
  select encode(hmac(convert_to('seal:' || p_provider || ':' || p_sub, 'utf8'), decode(_vault_get('sisu_login_pepper'), 'hex'), 'sha256'), 'hex')
$$;

-- 앱이 로그인 버튼을 그릴 때 묻는다: 키를 넣어 둔 회사와 공개용 client_id
create or replace function public.login_providers() returns table (provider text, client_id text)
language sql stable security definer set search_path = public, extensions as $$
  select c.provider, c.client_id from login_config c where c.client_id <> '' order by c.provider desc
$$;

-- 지금 쓰는 복구 코드에 로그인 계정을 연결한다. 그 계정이 다른 닉네임에 연결돼 있었으면 이쪽으로 옮긴다
create or replace function public.link_login(p_key text, p_provider text, p_code text, p_redirect text, p_verifier text default null)
returns void
language plpgsql volatile security definer set search_path = public, extensions as $$
declare a uuid := _archer(p_key); sub text; h bytea;
begin
  sub := _login_sub(p_provider, p_code, p_redirect, p_verifier);
  h := _login_hash(p_provider, sub);
  delete from archer_logins where (archer_id = a and provider = p_provider) or login_hash = h;
  insert into archer_logins (login_hash, archer_id, provider, sealed_key)
  values (h, a, p_provider, pgp_sym_encrypt(p_key, _login_seal(p_provider, sub)));
end $$;

-- 로그인으로 복구 코드 되찾기. 연결된 적 없는 계정이면 'not linked'
create or replace function public.login_with(p_provider text, p_code text, p_redirect text, p_verifier text default null)
returns text
language plpgsql volatile security definer set search_path = public, extensions as $$
declare sub text; rec archer_logins;
begin
  sub := _login_sub(p_provider, p_code, p_redirect, p_verifier);
  select * into rec from archer_logins where login_hash = _login_hash(p_provider, sub);
  if rec is null then raise exception 'not linked'; end if;
  return pgp_sym_decrypt(rec.sealed_key, _login_seal(p_provider, sub));
end $$;

-- 내 복구 코드에 연결된 로그인 (회사 이름과 연결한 때만)
create or replace function public.my_logins(p_key text) returns table (provider text, created_at timestamptz)
language sql stable security definer set search_path = public, extensions as $$
  select l.provider, l.created_at from archer_logins l where l.archer_id = _archer(p_key) order by l.created_at
$$;

create or replace function public.unlink_login(p_key text, p_provider text) returns void
language sql security definer set search_path = public, extensions as $$
  delete from archer_logins where archer_id = _archer(p_key) and provider = p_provider
$$;

revoke all on function public._login_sub(text, text, text, text), public._login_hash(text, text),
  public._login_seal(text, text), public._vault_put(text, text), public._vault_get(text),
  public.set_login_keys(text, text, text) from public, anon, authenticated;
grant execute on function public.login_providers(), public.link_login(text, text, text, text, text),
  public.login_with(text, text, text, text), public.my_logins(text), public.unlink_login(text, text) to anon;

commit;
