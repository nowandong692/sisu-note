import { useEffect, useState } from 'react';
import { ConfirmButton, toast } from './ui';
import {
  LOGINS_CHANGED as CHANGED, PROVIDER_NAME, loginProviders, myLogins, startLogin, unlinkLogin,
  type LoginProvider, type LoginPurpose,
} from '../platform/login';
import { useStore } from '../state/store';

function useProviders() {
  const [list, setList] = useState<{ provider: LoginProvider; client_id: string }[] | null>(null);
  useEffect(() => { let on = true; void loginProviders().then((r) => { if (on) setList(r); }); return () => { on = false; }; }, []);
  return list;
}

function errText(e: unknown) {
  return e instanceof Error ? e.message : '알 수 없는 오류가 났습니다.';
}

/** 카카오·구글 버튼. 서버에 키를 넣은 회사만 보인다 */
export function LoginButtons({ purpose, only, label }: { purpose: LoginPurpose; only?: LoginProvider[]; label: (name: string) => string }) {
  const list = useProviders();
  const [going, setGoing] = useState<LoginProvider | null>(null);
  const shown = (list ?? []).filter((p) => !only || only.includes(p.provider));
  if (!shown.length) return null;
  const go = (p: { provider: LoginProvider; client_id: string }) => {
    setGoing(p.provider);
    startLogin(p.provider, p.client_id, purpose).catch(() => { setGoing(null); toast('로그인 화면을 열지 못했습니다'); });
  };
  return (
    <div className="login-btns">
      {shown.map((p) => (
        <button key={p.provider} className={`btn login-${p.provider}`} disabled={!!going} onClick={() => go(p)}>
          {going === p.provider ? '여는 중…' : label(PROVIDER_NAME[p.provider])}
        </button>
      ))}
    </div>
  );
}

/** 설정: 지금 닉네임(복구 코드)에 카카오·구글 계정 연결하기 */
export function LoginSection() {
  const store = useStore();
  const o = store.online;
  const providers = useProviders();
  const [linked, setLinked] = useState<LoginProvider[] | null>(null);
  const [err, setErr] = useState('');
  const key = o?.key;
  useEffect(() => {
    if (!key) return;
    let on = true;
    const load = () => myLogins(key).then((r) => { if (on) { setLinked(r); setErr(''); } }, (e) => { if (on) setErr(errText(e)); });
    void load();
    window.addEventListener(CHANGED, load);
    return () => { on = false; window.removeEventListener(CHANGED, load); };
  }, [key]);
  if (!o || !providers?.length) return null;
  const unlink = async (p: LoginProvider) => {
    try { await unlinkLogin(o.key, p); toast(`${PROVIDER_NAME[p]} 연결을 끊었습니다`); window.dispatchEvent(new Event(CHANGED)); } catch (e) { toast(errText(e)); }
  };
  const notLinked = providers.map((p) => p.provider).filter((p) => !linked?.includes(p));
  return (
    <section className="card">
      <h2>로그인 연결</h2>
      <div className="small muted">
        카카오나 구글 계정을 연결해 두면, 브라우저 기록을 지우거나 휴대폰을 바꿔도 그 계정으로 로그인만 하면 닉네임과 기록을 되찾습니다.
        이메일·이름·전화번호는 받지 않고, 계정마다 다른 번호를 알아볼 수 없게 바꾼 값만 서버에 둡니다. 복구 코드도 그대로 쓸 수 있습니다.
      </div>
      {linked && linked.length > 0 && (
        <ul className="login-linked">
          {linked.map((p) => (
            <li key={p}>
              <span><b>{PROVIDER_NAME[p]}</b> 연결됨</span>
              <ConfirmButton className="btn ghost small" label="연결 끊기" confirmLabel="끊기" onConfirm={() => void unlink(p)} />
            </li>
          ))}
        </ul>
      )}
      {err && <div className="small err-text" role="alert">{err}</div>}
      {linked && notLinked.length > 0 && <LoginButtons purpose="link" only={notLinked} label={(n) => `${n} 계정 연결하기`} />}
    </section>
  );
}
