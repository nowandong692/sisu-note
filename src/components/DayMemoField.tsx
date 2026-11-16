import { useEffect, useRef, useState } from 'react';
import { useStore } from '../state/store';
import { AutoTextarea } from './ui';
import { SharePicker } from './SharePicker';
import { SHARE_STATE_LABEL } from '../domain/sharedMemo';
import type { MemoShare } from '../domain/types';

/** 쓰다가 잠깐 멈추면 저장한다 (ms) */
const SAVE_AFTER = 700;

/**
 * 하루 메모 입력 칸. 순 저장과 따로, 쓰는 대로 알아서 저장한다.
 * 다른 탭으로 가거나 칸이 사라질 때도 쓰던 글을 저장한다.
 */
export function DayMemoField({ date, label, autoFocus, onDone }: { date: string; label: string; autoFocus?: boolean; onDone?: () => void }) {
  const store = useStore();
  const saved = store.dayMemo(date);
  const [text, setText] = useState(saved);
  /** 공개 범위. 새 하루 메모는 나만 보기로 시작한다 */
  const [share, setShare] = useState<MemoShare | null>(store.dayShare(date));
  const [status, setStatus] = useState<'idle' | 'typing' | 'saved'>('idle');
  const latest = useRef({ date, text, share, save: store.setDayMemo });
  latest.current = { date, text, share, save: store.setDayMemo };

  // 날짜가 바뀌면 (지난 날짜 넣기, 자정) 그날 메모로 바꾼다
  const [shownDate, setShownDate] = useState(date);
  if (shownDate !== date) {
    setShownDate(date);
    setText(saved);
    setShare(store.dayShare(date));
    setStatus('idle');
  }

  useEffect(() => {
    if (text.trim() === saved) return;
    const t = setTimeout(() => { void store.setDayMemo(date, text, share).then(() => setStatus('saved')); }, SAVE_AFTER);
    return () => clearTimeout(t);
  }, [text, saved, date, share, store]);

  // 칸이 사라질 때 아직 저장하지 않은 글을 저장한다
  useEffect(() => () => { const l = latest.current; void l.save(l.date, l.text, l.share); }, []);

  const id = `day-memo-${date}`;
  return (
    <div className="field day-memo day-memo-box">
      <label htmlFor={id}>
        {label}
        <span className="opt">{status === 'typing' ? '쓰는 중' : status === 'saved' ? '저장됨' : SHARE_STATE_LABEL[share ?? 'private']}</span>
      </label>
      <AutoTextarea id={id} rows={2} autoFocus={autoFocus} value={text}
        placeholder="예: 사범님이 줌손을 더 밀라고 하심. 다음엔 첫 순 전에 빈활 열 번."
        onChange={(e) => { setText(e.target.value); setStatus('typing'); }}
        onBlur={(e) => {
          void store.setDayMemo(date, text, share).then(() => { if (text.trim() !== saved) setStatus('saved'); });
          // 공개 범위를 고르러 가는 것이면 칸을 닫지 않는다
          if (!(e.relatedTarget instanceof HTMLElement && e.currentTarget.closest('.day-memo-box')?.contains(e.relatedTarget))) onDone?.();
        }} />
      <SharePicker id={`dayShare-${date}`} label="하루 메모 공개" value={share} hasContent={!!text.trim()} what="그날 순 수와 관중 수, 하루 메모가" empty="메모를 써야 올라갑니다."
        onChange={(v) => { setShare(v); void store.setDayMemo(date, text, v).then(() => { if (text.trim()) setStatus('saved'); }); }} />
    </div>
  );
}
