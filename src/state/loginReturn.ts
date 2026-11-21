import { useEffect, useRef, useState } from 'react';
import { toast } from '../components/ui';
import { restoreMessage } from '../domain/recordBackup';
import { LOGINS_CHANGED as CHANGED, PROVIDER_NAME, linkLogin, loginForKey, type LoginReturn } from '../platform/login';
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
