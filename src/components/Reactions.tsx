import { useRef, useState } from 'react';
import { REACTIONS, myReactionsOf, shownReactions, toggleReaction, type ReactionCounts, type ReactionKind } from '../domain/sharedMemo';
import { rpc } from '../platform/online';
import { useStore } from '../state/store';
import { toast } from './ui';

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * 메모·댓글 하나의 반응 상태. toggle은 누르는 즉시 화면에 반영하고 서버에 보낸 뒤 서버 값으로 맞춘다 (실패하면 되돌린다).
 * fn: react_memo 또는 react_comment, args: 그 함수의 대상 id
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useReactionToggle(counts0: ReactionCounts | undefined, mine0: ReactionKind[], fn: 'react_memo' | 'react_comment', args: Record<string, unknown>) {
  const { online } = useStore();
  const [state, setState] = useState({ counts: counts0 ?? {}, mine: mine0 });
  const busy = useRef(false);
  const toggle = async (kind: ReactionKind) => {
    if (!online || busy.current) return;
    const before = state;
    setState(toggleReaction(state.counts, state.mine, kind));
    busy.current = true;
    try {
      const r = await rpc<{ reactions: ReactionCounts; mine: ReactionKind[] | ReactionKind | null }>(fn, { p_key: online.key, ...args, p_kind: kind });
      setState({ counts: r.reactions ?? {}, mine: Array.isArray(r.mine) ? r.mine : myReactionsOf({ my_reaction: r.mine }) });
    } catch (e) {
      setState(before);
      toast(errText(e));
    } finally {
      busy.current = false;
    }
  };
  return { ...state, toggle };
}

/**
 * 누른 사람이 있는 반응만 보인다. 누를 수 있으면 눌러서 내 반응을 더하거나 취소한다.
 * fresh: 내 메모에 새로 온 반응 (강조)
 */
export function ReactionBar({ counts, mine, canReact, fresh = [], onToggle }: {
  counts: ReactionCounts; mine: ReactionKind[]; canReact: boolean; fresh?: ReactionKind[]; onToggle: (k: ReactionKind) => void;
}) {
  const shown = shownReactions(counts);
  if (!shown.length) return null;
  return (
    <div className="reactions" role="group" aria-label="반응">
      {shown.map((r) => {
        const n = counts[r.kind] ?? 0;
        const isNew = fresh.includes(r.kind);
        const label = `${r.label} ${n}명${mine.includes(r.kind) ? ', 나도 누름' : ''}${isNew ? ', 새 반응' : ''}`;
        return canReact ? (
          <button key={r.kind} className={`react-btn ${mine.includes(r.kind) ? 'on' : ''}`} aria-pressed={mine.includes(r.kind)} aria-label={label} title={r.label} onClick={() => onToggle(r.kind)}>
            <span aria-hidden="true">{r.emoji}</span><b>{n}</b>
          </button>
        ) : (
          <span key={r.kind} className={`react-btn static ${isNew ? 'new' : ''}`} aria-label={label} title={r.label}>
            <span aria-hidden="true">{r.emoji}</span><b>{n}</b>
          </span>
        );
      })}
    </div>
  );
}

/** 반응 고르기 (길게 누르거나 "반응" 버튼을 누르면 열린다). 이미 남긴 반응을 고르면 취소된다 */
export function ReactionPicker({ mine, onPick, onClose }: { mine: ReactionKind[]; onPick: (k: ReactionKind) => void; onClose: () => void }) {
  return (
    <div className="react-pick" role="group" aria-label="반응 고르기">
      {REACTIONS.map((r) => (
        <button key={r.kind} className={mine.includes(r.kind) ? 'on' : ''} aria-pressed={mine.includes(r.kind)} aria-label={r.label} title={r.label}
          onClick={() => { onPick(r.kind); onClose(); }}>
          <span aria-hidden="true">{r.emoji}</span>
        </button>
      ))}
      <button className="react-pick-close" aria-label="반응 고르기 닫기" onClick={onClose}>✕</button>
    </div>
  );
}

/**
 * 메모·댓글을 길게 누르기. 버튼·입력 칸을 누를 때와 손가락이 움직이면(스크롤) 무시한다.
 * 길게 누르는 동안 글자가 선택되거나 메뉴가 뜨지 않게 한다.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useHoldToReact(onHold: () => void, enabled: boolean, ms = 500) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const clear = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; start.current = null; };
  if (!enabled) return {};
  return {
    onPointerDown: (e: React.PointerEvent) => {
      if ((e.target as HTMLElement).closest('button, a, input, textarea, [role="group"]')) return;
      clear();
      start.current = { x: e.clientX, y: e.clientY };
      timer.current = setTimeout(() => { clear(); navigator.vibrate?.(15); onHold(); }, ms);
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 10) clear();
    },
    onPointerUp: clear,
    onPointerLeave: clear,
    onPointerCancel: clear,
    onContextMenu: (e: React.MouseEvent) => { if (!(e.target as HTMLElement).closest('textarea, input')) e.preventDefault(); },
  };
}
