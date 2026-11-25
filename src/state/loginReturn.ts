import { useEffect, useRef, useState } from 'react';
import { toast } from '../components/ui';
import { restoreMessage } from '../domain/recordBackup';
import { LOGINS_CHANGED as CHANGED, PROVIDER_NAME, linkLogin, loginForKey, loginProviders, type LoginReturn } from '../platform/login';
import { loginWithGoogleToken, promptGoogleAuto } from '../platform/googleAuto';
import { OnlineError, onlineAvailable } from '../platform/online';
import { useStore } from './store';

function errText(e: unknown) {
  return e instanceof Error ? e.message : '알 수 없는 오류가 났습니다.';
}

/** 로그인 회사에서 돌아왔을 때: 연결하거나, 복구 코드를 되찾아 기록을 되살린다 */
export function useLoginReturn(ret: LoginReturn | null): string | null {
  const store = useStore();
  const done = useRef(false);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    if (!ret || !store.loaded || done.current) return;
    done.current = true;
    if (!ret.ok) { toast(ret.message); return; }
    const name = PROVIDER_NAME[ret.provider];
    void (async () => {
      try {
        if (ret.purpose === 'link') {
          const key = store.online?.key;
          if (!key) { toast('먼저 닉네임을 정해 랭킹에 참여한 뒤 연결해 주세요.'); return; }
          setBusy(`${name} 계정을 연결하는 중…`);
          await linkLogin(key, ret);
          toast(`${name} 계정을 연결했습니다. 다음부터는 ${name} 로그인으로 기록을 되찾을 수 있습니다`);
          window.dispatchEvent(new Event(CHANGED));
        } else {
          setBusy(`${name} 로그인으로 기록을 불러오는 중…`);
          const key = await loginForKey(ret);
          const r = await store.restoreOnline(key);
          toast(restoreMessage(r));
        }
      } catch (e) {
        toast(errText(e));
      } finally {
        setBusy(null);
      }
    })();
  }, [ret, store, store.loaded]);
  return busy;
}

const AUTO_TRIED = 'sisu-google-auto-tried';
/** 앱을 연 뒤 한 번만 (개발 모드에서 효과가 두 번 돌아도 한 번) */
let autoStarted = false;
let autoCancel: (() => void) | null = null;

/**
 * 기록이 하나도 없고 랭킹에도 참여하지 않은 기기(처음 깔았거나 기록이 지워진 기기)에서 앱을 열면 한 번:
 * 구글 원탭으로 이 브라우저의 구글 계정을 받아, 연결해 둔 계정이면 기록을 되살린다.
 * 같은 탭에서는 한 번만 묻는다. 창을 닫으면 구글이 알아서 한동안 다시 띄우지 않는다.
 */
export function useGoogleAutoLogin(skip: boolean): string | null {
  const store = useStore();
  const storeRef = useRef(store);
  storeRef.current = store;
  const [busy, setBusy] = useState<string | null>(null);
  const fresh = store.loaded && !store.online && store.ends.length === 0;
  useEffect(() => {
    // 그사이 순을 저장했거나 다른 방법으로 이어 쓰게 됐으면 구글 창을 거둔다
    if (!fresh) { autoCancel?.(); autoCancel = null; return; }
    if (skip || autoStarted || !onlineAvailable() || !navigator.onLine) return;
    try { if (sessionStorage.getItem(AUTO_TRIED)) return; sessionStorage.setItem(AUTO_TRIED, '1'); } catch { /* 그대로 한 번 해 본다 */ }
    autoStarted = true;
    void (async () => {
      const google = (await loginProviders()).find((p) => p.provider === 'google');
      if (!google) return;
      try {
        autoCancel = await promptGoogleAuto(google.client_id, (credential) => {
          autoCancel = null;
          void (async () => {
            setBusy('구글 계정으로 기록을 찾는 중…');
            try {
              const key = await loginWithGoogleToken(credential);
              const r = await storeRef.current.restoreOnline(key);
              toast(restoreMessage(r));
            } catch (e) {
              // 서버에 016이 아직 없으면 조용히 넘어간다. 연결 안 된 계정 등은 알려 준다
              if (!(e instanceof OnlineError && e.code === 'missing')) toast(errText(e));
            } finally {
              setBusy(null);
            }
          })();
        });
      } catch { /* 구글 스크립트를 못 불러오면 버튼으로 로그인하면 된다 */ }
    })();
  }, [skip, fresh]);
  return busy;
}
