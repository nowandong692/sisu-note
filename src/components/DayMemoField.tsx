import { useEffect, useRef, useState } from 'react';
import { useStore } from '../state/store';
import { AutoTextarea } from './ui';
import { ShareConfirmSheet, SharePicker } from './SharePicker';
import { SHARE_LABEL, SHARE_STATE_LABEL } from '../domain/sharedMemo';
import type { MemoShare } from '../domain/types';

/** 쓰다가 잠깐 멈추면 저장한다 (ms) */
const SAVE_AFTER = 700;
const WHAT = '그날 순 수와 관중 수, 하루 메모가';

/**
 * 하루 메모 입력 칸. 나만 보기면 쓰는 대로 알아서 저장한다.
 * 같은 활터·전체 공개면 쓰는 글은 기기에만 초안으로 두고, "공개하고 저장"으로 한 번 확인받은 뒤에 올린다.
 * 다른 탭으로 가거나 칸이 사라질 때도 쓰던 글을 (초안으로) 남긴다.
 */
export function DayMemoField({ date, label, autoFocus, onDone }: { date: string; label: string; autoFocus?: boolean; onDone?: () => void }) {
  const store = useStore();
  const saved = store.dayMemo(date);
  const [text, setText] = useState(store.dayDraft(date) ?? saved);
  /** 공개 범위. 새 하루 메모는 나만 보기로 시작한다 */
  const [share, setShare] = useState<MemoShare | null>(store.dayShare(date));
  const [status, setStatus] = useState<'idle' | 'typing' | 'saved'>('idle');
  /** 공개 확인 창: 이 범위로 공개하고 저장할지 묻는 중 */
  const [asking, setAsking] = useState<MemoShare | null>(null);
  /** 공개 중인데 아직 확인받지 않은 글이 있다 */
  const pending = !!share && !!text.trim() && text.trim() !== saved;

  // 날짜가 바뀌면 (지난 날짜 넣기, 자정) 그날 메모로 바꾼다
  const [shownDate, setShownDate] = useState(date);
  if (shownDate !== date) {
    setShownDate(date);
    setText(store.dayDraft(date) ?? saved);
    setShare(store.dayShare(date));
    setStatus('idle');
    setAsking(null);
  }

  /** 지금 글을 남긴다: 나만 보기거나 비웠으면 바로 저장, 공개 중이면 초안으로만 */
  const keep = (s: typeof store, d: string, t: string, sh: MemoShare | null) => {
    const memo = s.dayMemo(d);
    if (!sh || !t.trim()) return s.setDayMemo(d, t, sh);
    return s.setDayDraft(d, t.trim() === memo ? null : t);
  };
  const latest = useRef({ date, text, share, store, keep });
  latest.current = { date, text, share, store, keep };

  useEffect(() => {
    if (text.trim() === saved && !store.dayDraft(date)) return;
    const t = setTimeout(() => { void keep(store, date, text, share).then(() => setStatus(share && text.trim() ? 'idle' : 'saved')); }, SAVE_AFTER);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, saved, date, share, store]);

  // 칸이 사라질 때 아직 저장하지 않은 글을 남긴다
  useEffect(() => () => { const l = latest.current; void l.keep(l.store, l.date, l.text, l.share); }, []);

  /** 확인받고 이 범위로 공개 저장 */
  const publish = (scope: MemoShare) => {
    setAsking(null);
    setShare(scope);
    void store.setDayMemo(date, text, scope).then(() => setStatus('saved'));
  };
  const pickShare = (v: MemoShare | null) => {
    // 같은 활터·전체로 바꾸면 글이 있을 때 먼저 묻는다. 나만 보기로 바꾸면 바로 내린다
    if (v && text.trim() && v !== share) { setAsking(v); return; }
    setShare(v);
    void store.setDayMemo(date, text, v).then(() => { if (text.trim()) setStatus('saved'); });
  };

  const id = `day-memo-${date}`;
  return (
    <div className="field day-memo day-memo-box">
      <label htmlFor={id}>
        {label}
        <span className={`opt ${pending ? 'pending' : ''}`}>{pending ? '공개 전' : status === 'typing' ? '쓰는 중' : status === 'saved' ? '저장됨' : SHARE_STATE_LABEL[share ?? 'private']}</span>
      </label>
      <AutoTextarea id={id} rows={3} autoFocus={autoFocus} value={text}
        placeholder="예: 사범님이 줌손을 더 밀라고 하심. 다음엔 첫 순 전에 빈활 열 번."
        onChange={(e) => { setText(e.target.value); setStatus('typing'); }}
        onBlur={(e) => {
          void keep(store, date, text, share).then(() => { if (!share && text.trim() !== saved) setStatus('saved'); });
          // 공개 범위를 고르러 가거나 공개 확인이 남았으면 칸을 닫지 않는다
          const inside = e.relatedTarget instanceof HTMLElement && e.currentTarget.closest('.day-memo-box')?.contains(e.relatedTarget);
          if (!inside && !pending) onDone?.();
        }} />
      {pending && share && (
        <div className="row between day-memo-pending">
          <span className="small muted">{saved ? '고친 글은 아직 이 기기에만 있고, 공개된 글은 그대로입니다.' : '아직 공개하지 않았습니다. 이 기기에만 있습니다.'}</span>
          <button className="btn small" onClick={() => setAsking(share)}>{SHARE_LABEL[share]}하고 저장</button>
        </div>
      )}
      <SharePicker id={`dayShare-${date}`} label="하루 메모 공개" value={share} hasContent={!!text.trim()} what={WHAT} empty="메모를 써야 올라갑니다."
        onChange={pickShare} />
      {asking && (
        <ShareConfirmSheet scope={asking} what={WHAT} memo={text}
          onConfirm={() => publish(asking)}
          onPrivate={() => { setAsking(null); setShare(null); void store.setDayMemo(date, text, null).then(() => setStatus('saved')); }}
          onClose={() => setAsking(null)} />
      )}
    </div>
  );
}
