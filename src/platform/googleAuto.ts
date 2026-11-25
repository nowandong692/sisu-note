/**
 * 구글 자동 로그인 (원탭, 016_google_auto_login.sql).
 * 기록이 지워진 기기에서 앱을 열면, 이 브라우저에 구글 계정이 로그인돼 있을 때 구글이 그 계정의 ID 토큰을 앱에 바로 건넨다.
 * 예전에 이 앱에 구글을 연결해 동의한 계정이면 누르지 않아도 넘어오고, 처음이면 구글이 작은 확인 창을 띄운다.
 * 토큰은 서버가 구글에 확인한 뒤 회원 번호로 복구 코드를 되찾는다. 이메일·이름은 쓰지 않는다.
 */
import { rpc } from './online';

const SCRIPT = 'https://accounts.google.com/gsi/client';

interface GoogleId {
  initialize(o: {
    client_id: string;
    callback: (r: { credential?: string }) => void;
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
    use_fedcm_for_prompt?: boolean;
    itp_support?: boolean;
    context?: 'signin' | 'signup' | 'use';
  }): void;
  prompt(): void;
  cancel(): void;
}
declare global {
  interface Window { google?: { accounts?: { id?: GoogleId } } }
}

let loading: Promise<GoogleId> | null = null;
function loadGoogle(): Promise<GoogleId> {
  loading ??= new Promise<GoogleId>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SCRIPT;
    s.async = true;
    s.onload = () => { const id = window.google?.accounts?.id; if (id) resolve(id); else reject(new Error('no gsi')); };
    s.onerror = () => { loading = null; reject(new Error('no gsi')); };
    document.head.appendChild(s);
  });
  return loading;
}

/** 구글이 건넨 계정 토큰을 받으면 onCredential을 부른다. 구글 스크립트를 못 불러오면 조용히 그만둔다 */
export async function promptGoogleAuto(clientId: string, onCredential: (credential: string) => void): Promise<() => void> {
  const id = await loadGoogle();
  id.initialize({
    client_id: clientId,
    auto_select: true,
    cancel_on_tap_outside: true,
    use_fedcm_for_prompt: true,
    itp_support: true,
    context: 'signin',
    callback: (r) => { if (r.credential) onCredential(r.credential); },
  });
  id.prompt();
  return () => { try { id.cancel(); } catch { /* 이미 닫힘 */ } };
}

/** 구글 ID 토큰으로 복구 코드를 되찾는다 */
export function loginWithGoogleToken(credential: string): Promise<string> {
  return rpc<string>('login_with_google_token', { p_credential: credential }, 20000);
}
