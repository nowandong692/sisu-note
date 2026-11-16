import { useEffect, useState } from 'react';
import { NICK_MAX, cleanNickname, nicknameProblem, sameNickname } from '../domain/nickname';
import { onlineAvailable, rpc } from '../platform/online';

export type NickStatus = 'idle' | 'checking' | 'ok' | 'taken';

/**
 * 닉네임 입력칸. 입력을 멈추면 서버에 이미 쓰는 닉네임인지 물어보고 바로 알려 준다.
 * mine: 지금 내 닉네임 (그대로 두면 확인하지 않는다), myKey: 내 복구 코드 (서버가 내 닉네임을 빼고 본다)
 */
export function NicknameField({ id, label, value, onChange, onStatus, mine, myKey, autoFocus }: {
  id: string; label: string; value: string; onChange: (v: string) => void; onStatus?: (s: NickStatus) => void;
  mine?: string; myKey?: string; autoFocus?: boolean;
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
      <label htmlFor={id}>{label}</label>
      <input id={id} type="text" maxLength={NICK_MAX + 4} autoFocus={autoFocus} placeholder="예: 바람타는활" value={value}
        aria-invalid={status === 'taken' || !!problem} aria-describedby={`${id}-hint`}
        onChange={(e) => onChange(e.target.value)} />
      <div id={`${id}-hint`} className="small nick-hint" aria-live="polite">
        {problem && value.trim() ? <span className="err-text">{problem}</span>
          : status === 'taken' ? <span className="err-text">이미 쓰는 닉네임입니다. 다른 닉네임을 정해 주세요.</span>
          : status === 'ok' ? <span className="ok-text">쓸 수 있는 닉네임입니다.</span>
          : status === 'checking' ? <span className="muted">확인하는 중…</span>
          : <span className="muted">{NICK_MAX}글자까지, 다른 궁사와 겹치지 않게 정합니다.</span>}
      </div>
    </div>
  );
}
