/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 카카오맵 JavaScript 키 (등록한 도메인에서만 동작). 없으면 활터 찾기는 OpenStreetMap만 쓴다. */
  readonly VITE_KAKAO_JS_KEY?: string;
}
