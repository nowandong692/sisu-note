-- 카카오·구글 로그인 키 넣기 (014_login.sql을 실행한 뒤에)
-- 따옴표 안의 글자만 바꿔서 Supabase SQL Editor에서 실행한다. 키를 바꿀 때도 같은 방법으로 다시 실행한다.
-- Client Secret은 테이블에 평문으로 남지 않고 Supabase Vault에 암호화해 저장된다.
-- 다 넣은 뒤에는 SQL Editor의 이 탭을 지우고, 진짜 키를 적은 채로 파일을 저장하거나 저장소에 올리지 않는다.
-- 한쪽만 쓰려면 다른 쪽 줄은 지우고 실행한다. client_id를 ''로 두면 앱에서 그 버튼이 보이지 않는다.

-- 카카오: [앱 키]의 REST API 키, [카카오 로그인 → 보안]의 Client Secret 코드 (쓰지 않으면 '' 그대로)
select public.set_login_keys('kakao', '여기에-카카오-REST-API-키', '');
-- 구글: 클라이언트 ID(…apps.googleusercontent.com)와 클라이언트 보안 비밀번호
select public.set_login_keys('google', '여기에-구글-클라이언트-ID', '여기에-구글-클라이언트-보안-비밀번호');

-- 잘 들어갔는지 보기: client_id와, Vault에 비밀번호가 들어 있는지만 (비밀번호 자체는 보이지 않는다)
select c.provider, c.client_id,
       coalesce((select d.decrypted_secret <> '' from vault.decrypted_secrets d where d.name = 'sisu_login_secret_' || c.provider), false) as secret_saved
from public.login_config c;
