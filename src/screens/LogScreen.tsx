import { useEffect, useState } from 'react';
import { Sheet } from '../components/ui';
import { Target, type Mark } from '../components/Target';
import { PeriodPicker, periodBounds, type Period } from '../components/PeriodPicker';
import { NOTE, PENCIL, TRASH } from '../components/icons';
import { DayMemoField } from '../components/DayMemoField';
import { ConfirmButton, toast } from '../components/ui';
import { hitsOf } from '../domain/stats';
import { weatherLabel } from '../domain/weather';
import { shotLabel } from '../domain/target';
import { dayOffset, formatDate, today } from '../domain/util';
import type { End, Hand } from '../domain/types';
import { useStore } from '../state/store';
import { endMeta } from '../domain/endMeta';
import { EndLine } from './ShootScreen';
import { endColor } from '../components/endColor';
import { MemoView } from './MemoView';
import { dayMinutes, daySegments, formatDuration, spanLabel } from '../domain/session';
import { DayShareBadge, ShareBadge } from '../components/ShareBadge';
import { shareStateOf } from '../domain/sharedMemo';

/**
 * 그날 쏜 화살을 과녁 하나에 모두 찍는다. 습사 탭 오늘 과녁처럼 테두리 색은 순, 원 안 숫자는 몇 번째 시다.
 * 순을 고르면 그 순의 화살만, 시를 고르면 그 시의 화살만 남기고 나머지는 흐리게 한다 (색·크기는 그대로).
 */
function DayTarget({ ends, hand, selEnd, selShot, onShot }: { ends: End[]; hand: Hand; selEnd: string | null; selShot: number | null; onShot: (i: number | null) => void }) {
  const filtering = selEnd != null || selShot != null;
  const endIdx = ends.findIndex((e) => e.id === selEnd);
  const marks: Mark[] = ends.flatMap((e, ei) => e.shots.map((s, si) => {
    const on = (selEnd == null || e.id === selEnd) && (selShot == null || si === selShot);
    return { x: s.x, y: s.y, hit: s.hit, dim: filtering && !on, text: on ? String(si + 1) : '', ring: endColor(ei) };
  }));
  const chosen = ends.flatMap((e) => (selEnd == null || e.id === selEnd ? e.shots.filter((_, si) => selShot == null || si === selShot) : []));
  const unplaced = chosen.filter((s) => s.hit && s.x == null).length;
  const hits = chosen.filter((s) => s.hit).length;
  const hasZones = ends.some((e) => e.shots.some((s) => s.zone != null));
  const what = [endIdx >= 0 ? `${endIdx + 1}순` : '', selShot != null ? `${selShot + 1}시` : ''].filter(Boolean).join(' ');
  return (
    <div className="day-target">
      <div className="chips" role="group" aria-label="시별로 보기">
        <button className={`chip ${selShot == null ? 'on' : ''}`} onClick={() => onShot(null)}>모든 시</button>
        {[0, 1, 2, 3, 4].map((i) => (
          <button key={i} className={`chip ${selShot === i ? 'on' : ''}`} aria-pressed={selShot === i} onClick={() => onShot(selShot === i ? null : i)}>{i + 1}시</button>
        ))}
      </div>
      <div className="target-wrap"><Target hand={hand} grid={hasZones} marks={marks} markRadius={9} label="그날의 탄착" /></div>
      <div className="small muted">
        {filtering
          ? `${what}: ${chosen.length}발 중 ${hits}중. 원 안 숫자는 몇 번째 시인지입니다.`
          : '테두리 색은 아래 순 옆 색이고, 원 안 숫자는 몇 번째 시인지입니다. 흰 원은 관중, 검은 원은 불입니다. 아래에서 순을 누르면 그 순만 봅니다.'}
        {unplaced > 0 && ` 위치 없이 기록한 관중 ${unplaced}시는 과녁에 표시하지 않습니다.`}
      </div>
    </div>
  );
}


/** 다른 화면(순 고치기)에서 돌아올 때 펼쳐 보여 줄 순 */
const FOCUS_EVENT = 'log-focus';
// eslint-disable-next-line react-refresh/only-export-components
export function focusLogEnd(date: string, id: string) { window.dispatchEvent(new CustomEvent(FOCUS_EVENT, { detail: { date, id } })); }

export function LogScreen() {
  const { ends, days, dayMemo, dayDraft, gearName, deleteEnd, settings, setEditId, rangeName, setPastDate, online } = useStore();
  /** 하루 메모를 고치는 중인 날짜 */
  const [memoEdit, setMemoEdit] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  /** 습사 탭을 그 날짜로 연다 */
  const addTo = (date: string) => { setEditId(null); setPastDate(date); setPicking(false); location.hash = ''; };
  const addButton = <button className="btn ghost small" onClick={() => setPicking(true)}>+ 지난 날짜 기록 넣기</button>;
  const pickSheet = picking && <PastDateSheet onPick={addTo} onClose={() => setPicking(false)} />;
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [selEnd, setSelEnd] = useState<string | null>(null);
  const [view, setView] = useState<'date' | 'memo'>('date');
  /** 날짜별 보기의 기간. 처음에는 최근 30일 */
  const [period, setPeriod] = useState<Period>({ days: 30 });
  /** 보여 줄 날짜가 지금 기간 밖이면 그 날짜까지 들어가게 기간을 넓힌다 */
  const reveal = (date: string) => setPeriod((p) => {
    const b = periodBounds(p);
    if (date >= b.from && date <= b.to) return p;
    const to = b.to > today() ? today() : b.to;
    return { from: date < b.from ? date : b.from, to: date > to ? date : to };
  });
  // 기록 탭은 늘 떠 있으므로(숨겨 둘 뿐) 다른 화면에서 고친 순을 보여 달라는 알림을 받아 펼친다
  useEffect(() => {
    const on = (ev: Event) => {
      const { date, id } = (ev as CustomEvent<{ date: string; id: string }>).detail;
      setView('date');
      reveal(date);
      setOpen((o) => ({ ...o, [date]: true }));
      setSelEnd(id);
      setTimeout(() => document.getElementById(`end-${id}`)?.scrollIntoView({ block: 'center' }), 80);
    };
    window.addEventListener(FOCUS_EVENT, on);
    return () => window.removeEventListener(FOCUS_EVENT, on);
  }, []);
  const [selShot, setSelShot] = useState<number | null>(null);
  /** 순 한 덩어리(첫 줄, 불 방향, 메모) 어디를 눌러도 그 순을 고른다 */
  const toggle = (id: string) => setSelEnd((cur) => (cur === id ? null : id));
  const jump = (date: string, id: string) => {
    setView('date');
    reveal(date);
    setOpen((o) => ({ ...o, [date]: true }));
    setSelEnd(id);
    setSelShot(null);
    setTimeout(() => document.getElementById(`end-${id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 60);
  };
  const viewSwitch = (
    <div className="seg view-switch" role="group" aria-label="보기">
      <button className={view === 'date' ? 'on' : ''} aria-pressed={view === 'date'} onClick={() => setView('date')}>날짜별</button>
      <button className={view === 'memo' ? 'on' : ''} aria-pressed={view === 'memo'} onClick={() => setView('memo')}>메모 모아보기</button>
    </div>
  );

  const byDate = new Map<string, typeof ends>();
  for (const e of ends) byDate.set(e.date, [...(byDate.get(e.date) ?? []), e]);
  // 순 없이 하루 메모만 남긴 날도 보인다
  const allDates = [...new Set([...byDate.keys(), ...days.map((d) => d.date)])].sort().reverse();
  const bounds = periodBounds(period);
  const dates = allDates.filter((d) => d >= bounds.from && d <= bounds.to);

  const jumpDay = (date: string) => {
    setView('date');
    reveal(date);
    setOpen((o) => ({ ...o, [date]: true }));
    setSelEnd(null);
    setTimeout(() => document.getElementById(`daymemo-${date}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 60);
  };
  if (view === 'memo') return <>{viewSwitch}<MemoView onJump={jump} onJumpDay={jumpDay} /></>;

  if (!allDates.length) {
    return <section className="card"><div className="empty">아직 기록이 없습니다. 습사 탭에서 첫 순을 저장해 보세요.</div><div className="row">{addButton}</div>{pickSheet}</section>;
  }

  return (
    <>
    {viewSwitch}
    <div className="row">{addButton}</div>
    {pickSheet}
    <PeriodPicker value={period} onChange={setPeriod} idPrefix="log-period" />
    {!dates.length && <section className="card"><div className="empty">이 기간에 기록이 없습니다.</div></section>}
    {dates.length > 0 && <section className="card">
      {dates.map((date) => {
        const list = (byDate.get(date) ?? []).sort((a, b) => a.recordedAt - b.recordedAt);
        const memo = dayMemo(date);
        /** 공개 중인 하루 메모를 고쳤지만 아직 공개를 확인하지 않은 글 */
        const draft = dayDraft(date);
        const h = list.reduce((a, e) => a + hitsOf(e), 0);
        const bows = [...new Set(list.map((e) => gearName(e.bowId)))].join(', ');
        const where = [...new Set(list.flatMap((e) => (e.rangeId ? [rangeName(e.rangeId)] : [])))].join(', ');
        const isOpen = !!open[date];
        return (
          <div className="session" key={date}>
            <button aria-expanded={isOpen} onClick={() => setOpen({ ...open, [date]: !isOpen })}>
              <span><span className="d">{formatDate(date)}</span> <span className="muted small">{where ? `${where} · ` : ''}{bows}</span></span>
              <span className="s">{(memo || draft) && <span className="day-memo-mark" aria-label="하루 메모 있음" title="하루 메모">{NOTE}</span>}{list.length ? `${list.length}순 ${h}중 · ${Math.round((h / (list.length * 5)) * 100)}%` : '메모만'}</span>
            </button>
            {isOpen && (
              <div className="detail">
                {memoEdit === date
                  ? <DayMemoField date={date} label="하루 메모" autoFocus onDone={() => setMemoEdit(null)} />
                  : memo || draft
                    ? (
                      <div className="day-memo-view" id={`daymemo-${date}`}>
                        <div className="dm-head"><span>하루 메모 <DayShareBadge date={date} /></span><button className="act-btn" aria-label={`${formatDate(date)} 하루 메모 고치기`} title="고치기" onClick={() => setMemoEdit(date)}>{PENCIL}</button></div>
                        {memo && <div className="dm-text">{memo}</div>}
                        {draft != null && <div className="small dm-draft">공개 전에 고친 글이 있습니다. 연필을 눌러 확인하고 저장하세요.</div>}
                      </div>
                    )
                    : <div className="row"><button className="btn ghost small" onClick={() => setMemoEdit(date)}>+ 하루 메모 쓰기</button></div>}
                {list.length > 0 && <>
                {(() => {
                  const segs = daySegments(list);
                  if (segs.length === 1) return <div className="weather-line">습사 시간 {spanLabel(segs[0].span)}</div>;
                  // 두 활터 이상을 오간 날: 활터마다 따로 재서 더한다 (이동 시간은 빼고)
                  return (
                    <div className="weather-line">
                      습사 시간 {formatDuration(dayMinutes(list))} <span className="muted">(활터별 합)</span>
                      {segs.map((g) => <div key={g.ends[0].id} className="seg-line">{g.rangeId ? rangeName(g.rangeId) : '활터 미지정'} {spanLabel(g.span)}</div>)}
                    </div>
                  );
                })()}
                {(() => {
                  const ws = [...new Set(list.map((e) => weatherLabel(e.weather)).filter(Boolean))];
                  return ws.length > 0 && <div className="weather-line">날씨 {ws.join(' → ')}</div>;
                })()}
                <DayTarget ends={list} hand={settings.hand} selEnd={list.some((e) => e.id === selEnd) ? selEnd : null} selShot={selShot} onShot={setSelShot} />
                {list.map((e, i) => {
                  const misses = e.shots.flatMap((s, k) => (s.hit ? [] : [`${k + 1}시 ${shotLabel(s, settings.grid, settings.hand)}`]));
                  return (
                    <div key={e.id} id={`end-${e.id}`} className={`end-block ${selEnd === e.id ? 'selected' : ''}`} role="button" tabIndex={0} aria-pressed={selEnd === e.id}
                      onClick={() => toggle(e.id)} onKeyDown={(ev) => { if (ev.target === ev.currentTarget && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); toggle(e.id); } }}>
                      <EndLine end={e} index={i} showMeta={false} color={endColor(i)} />
                      {/* 장비·태그와 고치기·삭제는 둘째 줄에 둔다. 첫 줄(시·몰기)이 길어도 버튼 자리가 늘 같다. */}
                      <div className="end-sub">
                        <span className="meta">{endMeta(e, gearName)}</span>
                        <span className="end-acts" onClick={(ev) => ev.stopPropagation()}>
                          <button className="act-btn" aria-label={`${i + 1}순 고치기`} title="고치기" onClick={() => { setEditId(e.id); location.hash = ''; }}>{PENCIL}</button>
                          <ConfirmButton className="act-btn danger" label={TRASH} ariaLabel={`${i + 1}순 삭제`} confirmLabel="삭제" onConfirm={() => deleteEnd(e.id).then(() => toast('순을 삭제했습니다'))} />
                        </span>
                      </div>
                      {misses.length > 0 && <div className="memo">{misses.join(', ')}</div>}
                      {e.memo && <div className="memo">{e.memo}</div>}
                      {online && shareStateOf(e) && <div className="memo share-line"><ShareBadge end={e} /></div>}
                    </div>
                  );
                })}
                </>}
                {date < dayOffset(0) && (
                  <div className="row"><button className="btn ghost small" onClick={() => addTo(date)}>+ 이 날에 순 추가</button></div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </section>}
    </>
  );
}

/** 넣을 지난 날짜 고르기 (어제까지) */
function PastDateSheet({ onPick, onClose }: { onPick: (date: string) => void; onClose: () => void }) {
  const yesterday = dayOffset(-1);
  const [date, setDate] = useState(yesterday);
  const ok = /^\d{4}-\d{2}-\d{2}$/.test(date) && date <= yesterday;
  return (
    <Sheet title="지난 날짜 기록 넣기" onClose={onClose}>
      <div className="small muted">고른 날짜로 습사 화면이 열립니다. 그날 기록이 있으면 마지막 순 뒤에 붙습니다. 지난 순은 랭킹에 오르지 않고, 업적은 날짜에 맞춰 다시 계산됩니다.</div>
      <div className="field">
        <label htmlFor="pastDate">날짜</label>
        <input id="pastDate" type="date" max={yesterday} value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <button className="btn" disabled={!ok} onClick={() => onPick(date)}>{ok ? `${formatDate(date)} 기록 넣기` : '어제까지의 날짜를 고르세요'}</button>
      <button className="btn ghost small" onClick={onClose}>취소</button>
    </Sheet>
  );
}
