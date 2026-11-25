-- 016: 구글 자동 로그인 (원탭)
-- * 기록이 지워진 기기에서 앱을 열면, 구글이 이 브라우저에 로그인된 계정의 ID 토큰을 앱에 바로 건넨다(버튼·화면 이동 없음).
-- * 앱이 건넨 토큰은 믿을 수 없으므로 구글 tokeninfo로 서명·만료를 확인하고, 우리 client_id 앞으로 발급된 것인지 본다.
-- * 회원 번호(sub)는 014의 구글 로그인과 같은 값이라, 예전에 연결한 계정이면 그대로 복구 코드를 되찾는다.
-- * 구글 클라우드 콘솔의 OAuth 클라이언트에 "승인된 자바스크립트 원본"으로 앱 주소(예: https://<사용자>.github.io)를 넣어야 한다.

create or replace function public._google_token_sub(p_credential text) returns text
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  cid text;
  r http_response;
  info jsonb;
begin
  select client_id into cid from login_config where provider = 'google';
  if coalesce(cid, '') = '' then raise exception 'login not ready'; end if;
  if coalesce(p_credential, '') !~ '^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$' or char_length(p_credential) > 4000 then
    raise exception 'login failed';
  end if;
  perform http_set_curlopt('CURLOPT_TIMEOUT_MS', '8000');
  -- 구글이 서명과 만료를 확인해 준다. 잘못된 토큰이면 200이 아니다
  r := http_get('https://oauth2.googleapis.com/tokeninfo?id_token=' || p_credential);
  if r.status <> 200 then raise exception 'login failed'; end if;
  info := r.content::jsonb;
  if info->>'aud' is distinct from cid
     or coalesce(info->>'iss', '') not in ('accounts.google.com', 'https://accounts.google.com')
     or coalesce(info->>'sub', '') = '' then
    raise exception 'login failed';
  end if;
  return info->>'sub';
exception
  when raise_exception then raise;
  when others then raise exception 'login failed';
end $$;

-- 구글 ID 토큰으로 복구 코드 되찾기. 연결된 적 없는 계정이면 'not linked'
create or replace function public.login_with_google_token(p_credential text) returns text
language plpgsql volatile security definer set search_path = public, extensions as $$
declare sub text; rec archer_logins;
begin
  sub := _google_token_sub(p_credential);
  select * into rec from archer_logins where login_hash = _login_hash('google', sub);
  if rec is null then raise exception 'not linked'; end if;
  return pgp_sym_decrypt(rec.sealed_key, _login_seal('google', sub));
end $$;

revoke all on function public._google_token_sub(text) from public, anon, authenticated;
revoke all on function public.login_with_google_token(text) from public;
grant execute on function public.login_with_google_token(text) to anon;
