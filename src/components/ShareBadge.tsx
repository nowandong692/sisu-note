import { SHARE_STATE_LABEL, dayShareStateOf, shareStateOf, type ShareState } from '../domain/sharedMemo';
import type { End } from '../domain/types';
import { useStore } from '../state/store';

function Badge({ s }: { s: ShareState | null }) {
  const { online } = useStore();
  if (!online || !s) return null;
  return <span className={`pill share ${s}`}>{s === 'private' ? '🔒 ' : ''}{SHARE_STATE_LABEL[s]}</span>;
}

/** 메모가 공개인지 나만 보는지 표시. 랭킹에 참여하지 않았거나 메모·태그가 없으면 보이지 않는다 */
export function ShareBadge({ end }: { end: End }) {
  return <Badge s={shareStateOf(end)} />;
}

/** 하루 메모가 공개인지 나만 보는지 표시 */
export function DayShareBadge({ date }: { date: string }) {
  const { days } = useStore();
  return <Badge s={dayShareStateOf(days.find((d) => d.date === date))} />;
}
