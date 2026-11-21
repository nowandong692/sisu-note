-- 카카오·구글 로그인 키 넣기 (014_login.sql을 실행한 뒤에)
-- 따옴표 안의 글자만 바꿔서 Supabase SQL Editor에서 실행한다. 키를 바꿀 때도 같은 방법으로 다시 실행한다.
-- 이 파일에 진짜 키를 적은 채로 저장소에 올리지 않는다 (SQL Editor에서만 바꿔 실행).
-- 한쪽만 쓰려면 다른 쪽 줄은 지우고 실행한다. client_id를 ''로 두면 앱에서 그 버튼이 보이지 않는다.

insert into public.login_config (provider, client_id, client_secret) values
  -- 카카오: [앱 키]의 REST API 키, [카카오 로그인 → 보안]의 Client Secret 코드 (쓰지 않으면 '' 그대로)
  ('kakao', '여기에-카카오-REST-API-키', ''),
  -- 구글: 사용자 인증 정보의 클라이언트 ID(…apps.googleusercontent.com)와 클라이언트 보안 비밀번호
  ('google', '여기에-구글-클라이언트-ID', '여기에-구글-클라이언트-보안-비밀번호')
on conflict (provider) do update set client_id = excluded.client_id, client_secret = excluded.client_secret;

-- 잘 들어갔는지 보기 (보안 비밀번호는 앞 네 글자만)
select provider, client_id, left(client_secret, 4) || '…' as secret from public.login_config;
