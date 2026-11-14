/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 카카오맵 JavaScript 키 (등록한 도메인에서만 동작). 없으면 활터 찾기는 OpenStreetMap만 쓴다. */
  readonly VITE_KAKAO_JS_KEY?: string;
  /** 온라인 랭킹 서버(Supabase) 주소와 공개용(publishable/anon) 키. 없으면 랭킹 탭은 준비 중으로 보인다. */
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_KEY?: string;
}
