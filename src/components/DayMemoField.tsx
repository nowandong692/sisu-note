import { useEffect, useRef, useState } from 'react';
import { useStore } from '../state/store';
import { AutoTextarea } from './ui';

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
  const [status, setStatus] = useState<'idle' | 'typing' | 'saved'>('idle');
  const latest = useRef({ date, text, save: store.setDayMemo });
  latest.current = { date, text, save: store.setDayMemo };

  // 날짜가 바뀌면 (지난 날짜 넣기, 자정) 그날 메모로 바꾼다
  const [shownDate, setShownDate] = useState(date);
  if (shownDate !== date) {
    setShownDate(date);
    setText(saved);
    setStatus('idle');
  }

  useEffect(() => {
    if (text.trim() === saved) return;
    const t = setTimeout(() => { void store.setDayMemo(date, text).then(() => setStatus('saved')); }, SAVE_AFTER);
    return () => clearTimeout(t);
  }, [text, saved, date, store]);

  // 칸이 사라질 때 아직 저장하지 않은 글을 저장한다
  useEffect(() => () => { const l = latest.current; void l.save(l.date, l.text); }, []);

  const id = `day-memo-${date}`;
  return (
    <div className="field day-memo">
      <label htmlFor={id}>
        {label}
        <span className="opt">{status === 'typing' ? '쓰는 중' : status === 'saved' ? '저장됨' : '나만 보기'}</span>
      </label>
      <AutoTextarea id={id} rows={2} autoFocus={autoFocus} value={text}
        placeholder="예: 사범님이 줌손을 더 밀라고 하심. 다음엔 첫 순 전에 빈활 열 번."
        onChange={(e) => { setText(e.target.value); setStatus('typing'); }}
        onBlur={() => { void store.setDayMemo(date, text).then(() => { if (text.trim() !== saved) setStatus('saved'); }); onDone?.(); }} />
    </div>
  );
}
