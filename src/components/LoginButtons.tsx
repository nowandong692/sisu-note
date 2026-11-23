import { useEffect, useState } from 'react';
import { Sheet, toast } from './ui';
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
  // 로그인 화면에서 로그인하지 않고 뒤로 오면 브라우저가 떠나기 직전 화면(여는 중…, 버튼 잠김)을 그대로 되살린다.
  // 화면이 다시 보이면 버튼을 풀어 다시 누를 수 있게 한다.
  useEffect(() => {
    const reset = () => setGoing(null);
    const onVisible = () => { if (document.visibilityState === 'visible') reset(); };
    window.addEventListener('pageshow', reset);
    document.addEventListener('visibilitychange', onVisible);
    return () => { window.removeEventListener('pageshow', reset); document.removeEventListener('visibilitychange', onVisible); };
  }, []);
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
  const [asking, setAsking] = useState<LoginProvider | null>(null);
  const [busy, setBusy] = useState(false);
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
    setBusy(true);
    try {
      await unlinkLogin(o.key, p);
      toast(`${PROVIDER_NAME[p]} 연결을 끊었습니다`);
      window.dispatchEvent(new Event(CHANGED));
      setAsking(null);
    } catch (e) { toast(errText(e)); } finally { setBusy(false); }
  };
  const others = (linked ?? []).filter((p) => p !== asking);
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
              <button className="btn ghost small" onClick={() => setAsking(p)}>연결 끊기</button>
            </li>
          ))}
        </ul>
      )}
      {err && <div className="small err-text" role="alert">{err}</div>}
      {linked && notLinked.length > 0 && <LoginButtons purpose="link" only={notLinked} label={(n) => `${n} 계정 연결하기`} />}
      {asking && (
        <Sheet title={`${PROVIDER_NAME[asking]} 연결을 끊을까요?`} onClose={() => !busy && setAsking(null)}>
          <div className="small">
            연결을 끊으면 <b>{PROVIDER_NAME[asking]} 로그인으로는 기록을 되찾을 수 없습니다.</b>
            {others.length
              ? ` ${others.map((p) => PROVIDER_NAME[p]).join('·')} 로그인이나 복구 코드로는 계속 되찾을 수 있습니다.`
              : ' 남는 방법은 복구 코드뿐이니, 끊기 전에 복구 코드를 적어 두었는지 꼭 확인하세요.'}
          </div>
          <div className="small muted">이 기기의 기록과 서버에 백업한 기록은 지워지지 않고, 나중에 다시 연결할 수 있습니다.</div>
          <button className="btn danger" disabled={busy} onClick={() => void unlink(asking)}>{busy ? '끊는 중…' : '연결 끊기'}</button>
          <button className="btn ghost small" disabled={busy} onClick={() => setAsking(null)}>그대로 두기</button>
        </Sheet>
      )}
    </section>
  );
}
