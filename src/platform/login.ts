/**
 * 카카오·구글 로그인 (014_login.sql).
 * 로그인 회사 화면으로 보냈다가 인가 코드를 들고 이 앱 주소로 돌아오면, 그 코드를 서버(RPC)에 넘긴다.
 * 서버가 회사와 코드를 바꿔 회원 번호를 받고, 그 해시로 복구 코드를 연결하거나 되찾는다.
 * 이메일·이름 같은 개인정보는 요청하지 않는다 (카카오: 동의 항목 없음, 구글: openid 범위만).
 */
import { rpc } from './online';

export type LoginProvider = 'kakao' | 'google';
/** link: 지금 복구 코드에 계정 연결, login: 계정으로 복구 코드 되찾기 */
export type LoginPurpose = 'link' | 'login';

export const PROVIDER_NAME: Record<LoginProvider, string> = { kakao: '카카오', google: '구글' };

const PENDING = 'sisu-login-pending';
/** 연결을 바꾸면 알리는 창 이벤트 (설정의 로그인 연결 칸이 다시 읽는다) */
export const LOGINS_CHANGED = 'sisu-logins-changed';
const TTL = 15 * 60 * 1000;

interface Pending { state: string; provider: LoginProvider; purpose: LoginPurpose; verifier?: string; hash: string; at: number }

/** 로그인 회사에 등록하는 돌아올 주소: 앱 첫 화면 주소 그대로 (예: https://<사용자>.github.io/sisu-note/) */
export function redirectUri(): string {
  return new URL(import.meta.env.BASE_URL || '/', location.origin).href;
}

let providersCache: Promise<{ provider: LoginProvider; client_id: string }[]> | null = null;
/** 서버에 키를 넣어 둔 로그인 회사. 서버에 014가 없거나 연결이 안 되면 빈 목록 */
export function loginProviders(): Promise<{ provider: LoginProvider; client_id: string }[]> {
  providersCache ??= rpc<{ provider: LoginProvider; client_id: string }[]>('login_providers', {})
    .then((rows) => (rows ?? []).filter((r) => r.provider === 'kakao' || r.provider === 'google'))
    .catch(() => { providersCache = null; return []; });
  return providersCache;
}

function randomText(bytes: number): string {
  const b = crypto.getRandomValues(new Uint8Array(bytes));
  return base64url(b);
}

function base64url(b: Uint8Array): string {
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** 로그인 회사로 보낼 주소 */
export function authorizeUrl(provider: LoginProvider, clientId: string, state: string, redirect: string, challenge?: string): string {
  if (provider === 'kakao') {
    // scope를 주지 않는다: 동의 항목 없이 회원 번호만
    const q = new URLSearchParams({ client_id: clientId, redirect_uri: redirect, response_type: 'code', state });
    return `https://kauth.kakao.com/oauth/authorize?${q}`;
  }
  const q = new URLSearchParams({
    client_id: clientId, redirect_uri: redirect, response_type: 'code', scope: 'openid', state,
    prompt: 'select_account', ...(challenge ? { code_challenge: challenge, code_challenge_method: 'S256' } : {}),
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

/** 로그인 회사 화면으로 간다. 돌아오면 takeLoginReturn()이 이어 받는다 */
export async function startLogin(provider: LoginProvider, clientId: string, purpose: LoginPurpose): Promise<void> {
  const state = randomText(16);
  let verifier: string | undefined;
  let challenge: string | undefined;
  if (provider === 'google') {
    verifier = randomText(32);
    challenge = base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
  }
  const p: Pending = { state, provider, purpose, verifier, hash: location.hash, at: Date.now() };
  // 앱을 떠났다 돌아오므로 localStorage에 둔다 (sessionStorage는 휴대폰에서 새 탭으로 열리면 사라진다)
  try { localStorage.setItem(PENDING, JSON.stringify(p)); } catch { /* 저장 못 하면 돌아와서 다시 하라고 알린다 */ }
  location.assign(authorizeUrl(provider, clientId, state, redirectUri(), challenge));
}

export type LoginReturn =
  | { ok: true; provider: LoginProvider; purpose: LoginPurpose; code: string; verifier?: string; redirect: string }
  | { ok: false; provider?: LoginProvider; purpose?: LoginPurpose; message: string };

/** 주소에서 돌아온 로그인 결과만 읽어 낸다 (화면과 무관, 테스트용으로 따로 둔다) */
export function parseLoginReturn(search: string, pendingRaw: string | null, now: number, redirect: string): LoginReturn | null {
  const q = new URLSearchParams(search);
  const state = q.get('state');
  const code = q.get('code');
  const error = q.get('error');
  if (!state || (!code && !error)) return null;
  let p: Pending | null = null;
  try { p = pendingRaw ? JSON.parse(pendingRaw) as Pending : null; } catch { p = null; }
  if (!p || p.state !== state || now - p.at > TTL) {
    return { ok: false, message: '로그인 확인 시간이 지났거나 다른 창에서 시작했습니다. 한 번 더 눌러 주세요.' };
  }
  if (error || !code) {
    const cancelled = error === 'access_denied' || error === 'consent_required';
    return { ok: false, provider: p.provider, purpose: p.purpose, message: cancelled ? '로그인을 취소했습니다.' : `${PROVIDER_NAME[p.provider]} 로그인이 되지 않았습니다.` };
  }
  return { ok: true, provider: p.provider, purpose: p.purpose, code, verifier: p.verifier, redirect };
}

const STASH = 'sisu-login-return';

/**
 * 앱이 열릴 때 한 번: 로그인 회사에서 돌아왔으면 그 결과를 꺼내고 주소를 원래대로 돌려놓는다.
 * 홈 화면에 설치한 앱(삼성 인터넷 등)은 로그인 창에서 돌아오면 화면이 70%쯤으로 작게 그려지고, 새로 고치면 바로잡힌다.
 * 그래서 돌아오면 결과를 이 탭(sessionStorage)에 잠깐 맡겨 두고 한 번 새로 고친 뒤, 새로 고친 화면에서 결과를 이어 받는다.
 */
export function takeLoginReturn(): LoginReturn | null {
  try {
    const stashed = sessionStorage.getItem(STASH);
    if (stashed) {
      sessionStorage.removeItem(STASH);
      return JSON.parse(stashed) as LoginReturn;
    }
  } catch { /* 맡겨 둔 것 없음 */ }
  const r = readLoginReturn();
  if (!r) return null;
  try {
    sessionStorage.setItem(STASH, JSON.stringify(r));
    location.reload();
    return null;
  } catch {
    return r; // 맡겨 둘 수 없으면 새로 고치지 않고 그대로 이어 한다
  }
}

function readLoginReturn(): LoginReturn | null {
  let raw: string | null = null;
  try { raw = localStorage.getItem(PENDING); } catch { /* 없음 */ }
  const r = parseLoginReturn(location.search, raw, Date.now(), redirectUri());
  if (!r) return null;
  let hash = '';
  try { hash = raw ? (JSON.parse(raw) as Pending).hash ?? '' : ''; } catch { /* 그대로 */ }
  try { localStorage.removeItem(PENDING); } catch { /* 그대로 */ }
  history.replaceState(null, '', location.pathname + (hash || location.hash));
  return r;
}

/** 지금 복구 코드에 연결된 로그인 */
export async function myLogins(key: string): Promise<LoginProvider[]> {
  const rows = await rpc<{ provider: LoginProvider }[]>('my_logins', { p_key: key });
  return (rows ?? []).map((r) => r.provider);
}

export async function linkLogin(key: string, r: Extract<LoginReturn, { ok: true }>): Promise<void> {
  await rpc('link_login', { p_key: key, p_provider: r.provider, p_code: r.code, p_redirect: r.redirect, p_verifier: r.verifier ?? null }, 20000);
}

/** 로그인으로 복구 코드를 되찾는다 */
export async function loginForKey(r: Extract<LoginReturn, { ok: true }>): Promise<string> {
  return rpc<string>('login_with', { p_provider: r.provider, p_code: r.code, p_redirect: r.redirect, p_verifier: r.verifier ?? null }, 20000);
}

export async function unlinkLogin(key: string, provider: LoginProvider): Promise<void> {
  await rpc('unlink_login', { p_key: key, p_provider: provider });
}
