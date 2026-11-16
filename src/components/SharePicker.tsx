import { onlineAvailable } from '../platform/online';
import type { MemoShare } from '../domain/types';
import { useStore } from '../state/store';

/** 메모 공개 범위 고르기. 랭킹(겨루기)에 참여해 닉네임이 있어야 공개할 수 있다. */
export function SharePicker({ value, hasContent, onChange, id = 'share', label = '메모 공개', what = '시수, 태그, 메모가', empty = '메모나 태그를 남겨야 올라갑니다.' }: {
  value: MemoShare | null; hasContent: boolean; onChange: (v: MemoShare | null) => void;
  /** 한 화면에 둘 이상 있을 때 구분 */
  id?: string; label?: string;
  /** 공개하면 보이는 것 (조사까지) */
  what?: string;
  /** 내용이 없을 때 덧붙이는 말 */
  empty?: string;
}) {
  const { online } = useStore();
  if (!onlineAvailable()) return null;
  if (!online) {
    return hasContent ? <div className="small muted share-hint">겨루기 탭에서 닉네임을 정하면 메모를 다른 궁사에게 공개하고 조언을 받을 수 있습니다.</div> : null;
  }
  const noClub = !online.rangeName;
  const opts: [MemoShare | null, string][] = [[null, '나만 보기'], ['club', '같은 활터'], ['all', '전체 공개']];
  return (
    <div className="field share-field">
      <label id={`${id}Label`}>{label}</label>
      <div className="seg" role="group" aria-labelledby={`${id}Label`}>
        {opts.map(([v, l]) => (
          <button key={l} className={value === v ? 'on' : ''} aria-pressed={value === v} disabled={v === 'club' && noClub && value !== 'club'} onClick={() => onChange(v)}>{l}</button>
        ))}
      </div>
      {value && <div className="small muted">{online.nickname} 이름으로 {value === 'club' ? `${online.rangeName ?? '내 소속 활터'} 궁사에게` : '모든 궁사에게'} {what} 보입니다.{!hasContent && ` ${empty}`}</div>}
      {!value && noClub && <div className="small muted">같은 활터 공개는 설정에서 소속 활터를 정하면 쓸 수 있습니다.</div>}
    </div>
  );
}

