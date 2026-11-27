import { useEffect, useState, type ReactNode } from 'react';
import { NICK_MAX, cleanNickname, nicknameProblem, sameNickname } from '../domain/nickname';
import { onlineAvailable, rpc } from '../platform/online';

export type NickStatus = 'idle' | 'checking' | 'ok' | 'taken';

/**
 * 닉네임 입력칸. 입력을 멈추면 서버에 이미 쓰는 닉네임인지 물어보고 바로 알려 준다.
 * mine: 지금 내 닉네임 (그대로 두면 확인하지 않는다), myKey: 내 복구 코드 (서버가 내 닉네임을 빼고 본다)
 */
export function NicknameField({ id, label, value, onChange, onStatus, mine, myKey, autoFocus, takenHint, quiet }: {
  id: string; label: string; value: string; onChange: (v: string) => void; onStatus?: (s: NickStatus) => void;
  mine?: string; myKey?: string; autoFocus?: boolean;
  /** 이미 쓰는 닉네임일 때 덧붙일 안내 (예: 복구 코드로 이어 쓰기) */
  takenHint?: ReactNode;
  /** 라벨은 화면 읽기 프로그램에만 두고, 평소 안내(글자 수)는 숨긴다. 겹침·오류 알림은 그대로 보인다 */
  quiet?: boolean;
}) {
  const [status, setStatus] = useState<NickStatus>('idle');
  const nick = cleanNickname(value);
  const problem = value ? nicknameProblem(value) : null;

  useEffect(() => {
    const set = (s: NickStatus) => { setStatus(s); onStatus?.(s); };
    if (!nick || problem || (mine && sameNickname(nick, mine)) || !onlineAvailable()) { set('idle'); return; }
    set('checking');
    let alive = true;
    const t = setTimeout(() => {
      rpc<boolean>('nickname_available', { p_nickname: nick, p_key: myKey ?? null }, 6000)
        // 서버에 확인 기능이 아직 없거나 연결이 안 되면 조용히 넘어간다. 저장할 때 서버가 다시 막는다
        .then((ok) => { if (alive) set(ok ? 'ok' : 'taken'); }, () => { if (alive) set('idle'); });
    }, 400);
    return () => { alive = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nick, problem, mine, myKey]);

  return (
    <div className="field">
      <label htmlFor={id} className={quiet ? 'sr-only' : undefined}>{label}</label>
      <input id={id} type="text" maxLength={NICK_MAX + 4} autoFocus={autoFocus} placeholder="예: 바람타는활" value={value}
        aria-invalid={status === 'taken' || !!problem} aria-describedby={`${id}-hint`}
        onChange={(e) => onChange(e.target.value)} />
      <div id={`${id}-hint`} className={`small nick-hint ${quiet ? 'quiet' : ''}`} aria-live="polite">
        {problem && value.trim() ? <span className="err-text">{problem}</span>
          : status === 'taken' ? <><span className="err-text">이미 쓰는 닉네임입니다. 다른 닉네임을 정해 주세요.</span>{takenHint && <> <span className="muted">{takenHint}</span></>}</>
          : status === 'ok' ? <span className="ok-text">쓸 수 있는 닉네임입니다.</span>
          : status === 'checking' ? <span className="muted">확인하는 중…</span>
          : quiet ? null : <span className="muted">{NICK_MAX}글자까지, 다른 궁사와 겹치지 않게 정합니다.</span>}
      </div>
    </div>
  );
}
