import { SHARE_STATE_LABEL, shareStateOf } from '../domain/sharedMemo';
import type { End } from '../domain/types';
import { useStore } from '../state/store';

/** 메모가 공개인지 나만 보는지 표시. 랭킹에 참여하지 않았거나 메모·태그가 없으면 보이지 않는다 */
export function ShareBadge({ end }: { end: End }) {
  const { online } = useStore();
  const s = shareStateOf(end);
  if (!online || !s) return null;
  return <span className={`pill share ${s}`}>{s === 'private' ? '🔒 ' : ''}{SHARE_STATE_LABEL[s]}</span>;
}
