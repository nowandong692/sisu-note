import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ShotIcon } from '../components/ShotIcon';
import { endMeta } from '../domain/endMeta';
import { WeatherSheet } from '../components/WeatherSheet';
import { RangeSheet } from '../components/RangeSheet';
import { Target, type Mark } from '../components/Target';
import { AutoTextarea, Sheet, toast } from '../components/ui';
import { classifyTap, directionFor, hitShot, shotLabel } from '../domain/target';
import { hitsOf } from '../domain/stats';
import type { End, MemoShare, Shot, TrackedCategory } from '../domain/types';
import { SHOTS_PER_END } from '../domain/types';
import { addTag, myTags, tagChoices, tagProblem, TAG_MAX } from '../domain/tags';
import { TagDeleteSheet, useLongPress } from '../components/TagDeleteSheet';
import { formatDate, today } from '../domain/util';
import { weatherLabel } from '../domain/weather';
import { honorific, trendOf, welcomeFor, welcomeWho } from '../domain/welcome';
import { danShort, topDan } from '../domain/dan';
import { GradeMark } from '../components/GradeMark';
import { DayMemoField } from '../components/DayMemoField';
import { ShareConfirmSheet, ShareNotice, SharePicker } from '../components/SharePicker';
import { defaultShare, needsShareConfirm, SHARE_LABEL } from '../domain/sharedMemo';
import { useStore } from '../state/store';
import { focusLogEnd } from './LogScreen';
import { endColor } from '../components/endColor';
import { showLogView } from './RecordsScreen';
import { GearScreen } from './GearScreen';
import { GEAR_KEY, gearOfEnd, gearOfSettings, lastGearOf, sameGear, type EndGear } from '../domain/endGear';
import { achievements, earnedLine, newlyEarned, type Achievement } from '../domain/achievements';

interface Draft {
  /** 고치는 중인 순 id (새 순이면 null) */
  editId: string | null;
  shots: (Shot | null)[];
  active: number;
  tags: string[];
  memo: string;
  /** 메모 공개 범위 (null = 나만 보기) */
  share: MemoShare | null;
  /** 고치는 순의 장비 (새 순은 오늘 장비를 쓰므로 null) */
  gear: EndGear | null;
}
const emptyDraft = (share: MemoShare | null = null): Draft => ({ editId: null, shots: Array(SHOTS_PER_END).fill(null), active: 0, tags: [], memo: '', share, gear: null });
const draftOf = (e: End): Draft => ({ editId: e.id, shots: [...e.shots], active: 0, tags: [...e.tags], memo: e.memo, share: e.share ?? null, gear: gearOfEnd(e) });

export function EndLine({ end, index, showMeta = true, selected, onSelect, color }: { end: End; index: number; showMeta?: boolean; selected?: boolean; onSelect?: () => void; color?: string }) {
  const { gearName } = useStore();
  const h = hitsOf(end);
  return (
    <div className={`end-line ${onSelect ? 'selectable' : ''} ${selected ? 'selected' : ''}`}
      {...(onSelect ? { role: 'button', tabIndex: 0, 'aria-pressed': !!selected, onClick: onSelect, onKeyDown: (ev: React.KeyboardEvent) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onSelect(); } } } : {})}>
      <span className="idx">{color && <span className="end-dot" style={{ background: color }} aria-hidden />}{index + 1}순</span>
      <span className="dots">{end.shots.map((s, i) => <ShotIcon key={i} shot={s} index={i} />)}</span>
      <span className="cnt">{h}중{h === 5 && <span className="pill best">몰기</span>}</span>
      {showMeta && <span className="meta">{endMeta(end, gearName)}</span>}
    </div>
  );
}

/** 오늘 과녁의 표시 번호: 순(0부터)과 시(0부터)를 하나의 수(1부터)로 */

const keyOf = (ei: number, si: number) => ei * SHOTS_PER_END + si + 1;
const unkey = (n: number) => ({ ei: Math.floor((n - 1) / SHOTS_PER_END), si: (n - 1) % SHOTS_PER_END });

/**
 * 오늘(또는 넣는 중인 지난 날짜) 쏜 화살을 과녁 하나에 모두 찍고 고친다.
 * 표시를 끌어 옮기면 그 순에 저장할지 묻고, 그림 밖으로 끌어내면 그 순을 위 입력 칸에 불러와 그 시를 비운다.
 */
function TodayTarget({ ends, onRemoveShot, topHeight }: { ends: End[]; onRemoveShot: (e: End, si: number) => void; topHeight: number | null }) {
  const store = useStore();
  const { settings } = store;
  /** 고른 순 (null = 모든 순) */
  const [sel, setSel] = useState<string | null>(null);
  const selIdx = ends.findIndex((e) => e.id === sel);
  const chosen = selIdx >= 0 ? sel : null;
  /** 끌어 옮기고 저장할지 묻는 중인 시 */
  const [moving, setMoving] = useState<{ ei: number; si: number; next: Shot } | null>(null);
  const [removing, setRemoving] = useState<{ ei: number; si: number } | null>(null);
  const [busy, setBusy] = useState(false);

  const marks: Mark[] = ends.flatMap((e, ei) => e.shots.map((s0, si) => {
    const s = moving && moving.ei === ei && moving.si === si ? moving.next : s0;
    const on = chosen == null || e.id === chosen;
    // 위 입력 칸에서 고치는 중인 순은 거기서 고친다 (두 곳에서 따로 고치지 않게)
    const locked = e.id === store.editId;
    return { x: s.x, y: s.y, hit: s.hit, n: on && !locked ? keyOf(ei, si) : undefined,
      text: on ? String(si + 1) : '',
      // 순을 골라도 모든 순 볼 때와 같은 색·크기로 둔다
      ring: endColor(ei), dim: chosen != null && !on };
  }));
  const totalHits = ends.reduce((a, e) => a + hitsOf(e), 0);
  const unplaced = ends.reduce((a, e) => a + (chosen == null || e.id === chosen ? e.shots.filter((s) => s.hit && s.x == null).length : 0), 0);
  const name = (n: number) => { const { ei, si } = unkey(n); return `${ei + 1}순 ${si + 1}시`; };

  const move = (n: number, x: number, y: number) => {
    const { ei, si } = unkey(n);
    const e = ends[ei];
    if (!e) return;
    setMoving({ ei, si, next: classifyTap(x, y, settings.hand, settings.grid) });
  };
  const saveMove = async () => {
    if (!moving || busy) return;
    const e = ends[moving.ei];
    if (!e) { setMoving(null); return; }
    setBusy(true);
    const shots = e.shots.map((s, k) => (k === moving.si ? moving.next : s));
    await store.updateEnd({ ...e, shots });
    const h = shots.filter((s) => s.hit).length;
    toast(`${moving.ei + 1}순 ${moving.si + 1}시를 ${shotLabel(moving.next, settings.grid, settings.hand)}(으)로 고쳤습니다 · ${h}중`);
    setBusy(false);
    setMoving(null);
  };

  const mv = moving && ends[moving.ei] ? { e: ends[moving.ei], ...moving } : null;
  const rm = removing && ends[removing.ei] ? { e: ends[removing.ei], ...removing } : null;
  const after = mv ? mv.e.shots.map((s, k) => (k === mv.si ? mv.next : s)) : [];
  const afterHits = after.filter((s) => s.hit).length;

  return (
    <div className="today-target">
      {/* 입력 과녁의 시 칸·버튼 줄과 같은 높이로 두어 전환해도 과녁이 제자리에 있게 한다. 순이 많아도 옆으로 밀리지 않는다 */}
      <div className="target-top" style={topHeight ? { height: topHeight } : undefined}>
        <div className="end-step">
          <button className="btn ghost small" aria-label="앞 순" onClick={() => setSel(selIdx <= 0 ? (selIdx === 0 ? null : ends[ends.length - 1].id) : ends[selIdx - 1].id)}>‹</button>
          <button className="end-step-now" onClick={() => setSel(null)} aria-label="모든 순 보기">
            {chosen == null
              ? <><b>모든 순</b><span>{ends.length}순 {totalHits}중</span></>
              : <><b><span className="end-dot" style={{ background: endColor(selIdx) }} aria-hidden />{selIdx + 1}순 · {hitsOf(ends[selIdx])}중</b>
                <span className="dots">{ends[selIdx].shots.map((s, i) => <ShotIcon key={i} shot={s} index={i} />)}</span></>}
          </button>
          <button className="btn ghost small" aria-label="다음 순" onClick={() => setSel(selIdx < 0 ? ends[0].id : selIdx === ends.length - 1 ? null : ends[selIdx + 1].id)}>›</button>
        </div>
        <div className="end-strip" role="group" aria-label="순 고르기">
          {ends.map((e, i) => (
            <button key={e.id} className={chosen === e.id ? 'on' : ''} aria-pressed={chosen === e.id} aria-label={`${i + 1}순 ${hitsOf(e)}중`}
              style={{ background: chosen == null || chosen === e.id ? endColor(i) : undefined, borderColor: endColor(i) }}
              onClick={() => setSel(chosen === e.id ? null : e.id)}>{i + 1}</button>
          ))}
        </div>
      </div>
      <div className="target-wrap">
        <Target hand={settings.hand} grid={settings.grid} marks={marks} markRadius={9}
          onMove={move} onRemove={(n) => setRemoving(unkey(n))}
          onPick={(n) => { const e = ends[unkey(n).ei]; if (e) setSel(chosen === e.id ? null : e.id); }}
          dragLabel={(n, x, y) => `${name(n)} · ${shotLabel(classifyTap(x, y, settings.hand, settings.grid), settings.grid, settings.hand)}`}
          removeLabel={(n) => `놓으면 ${name(n)} 지우기`}
          label={chosen != null ? `${selIdx + 1}순의 탄착` : '오늘의 탄착'} />
      </div>
      <div className="small muted">
        {chosen != null ? `${selIdx + 1}순만 보는 중입니다. 원 안 숫자는 몇 번째 시인지입니다.` : '테두리 색은 위 색 칸의 순이고, 원 안 숫자는 몇 번째 시인지입니다. 표시나 색 칸을 누르면 그 순만 봅니다.'}
        {' '}번호를 끌어 옮기면 그 시를 고치고, 그림 밖으로 끌어내면 지울 수 있습니다.
        {store.editId && ends.some((e) => e.id === store.editId) && ' 고치는 중인 순은 "순 고치기" 쪽에서 고치세요.'}
        {unplaced > 0 && ` 위치 없이 기록한 관중 ${unplaced}시는 과녁에 표시하지 않습니다.`}
      </div>

      {mv && (
        <Sheet title={`${mv.ei + 1}순 ${mv.si + 1}시를 옮겨 저장할까요?`} onClose={() => setMoving(null)}>
          <div className="move-change">
            <span><ShotIcon shot={mv.e.shots[mv.si]} index={mv.si} /> {shotLabel(mv.e.shots[mv.si], settings.grid, settings.hand)}</span>
            <span aria-hidden>→</span>
            <span><ShotIcon shot={mv.next} index={mv.si} /> <b>{shotLabel(mv.next, settings.grid, settings.hand)}</b></span>
          </div>
          <div className="confirm-end">
            <span className="dots">{after.map((s, i) => <ShotIcon key={i} shot={s} index={i} />)}</span>
            <b>{afterHits}중{afterHits === 5 ? ' · 몰기' : ''}</b>
          </div>
          <div className="small muted">{formatDate(mv.e.date)} {mv.ei + 1}순에 바로 저장합니다.</div>
          <button className="btn" disabled={busy} onClick={() => void saveMove()}>저장</button>
          <button className="btn ghost" onClick={() => setMoving(null)}>되돌리기</button>
        </Sheet>
      )}
      {rm && (
        <Sheet title={`${rm.ei + 1}순 ${rm.si + 1}시를 지울까요?`} onClose={() => setRemoving(null)}>
          <div className="move-change">
            <span><ShotIcon shot={rm.e.shots[rm.si]} index={rm.si} /> {rm.ei + 1}순 {rm.si + 1}시 {shotLabel(rm.e.shots[rm.si], settings.grid, settings.hand)}</span>
          </div>
          <div className="small muted">한 순은 5시라서 {rm.ei + 1}순을 위 입력 칸에 불러오고 {rm.si + 1}시를 비워 둡니다. 과녁을 눌러 다시 입력하면 저장할지 묻습니다. 다시 입력하기 전까지 저장된 기록은 그대로입니다.</div>
          <button className="btn danger" onClick={() => { setRemoving(null); onRemoveShot(rm.e, rm.si); }}>{rm.si + 1}시 지우고 다시 입력</button>
          <button className="btn ghost" onClick={() => setRemoving(null)}>지우지 않기</button>
        </Sheet>
      )}
    </div>
  );
}

const RESET_WORD = '초기화';

/** 오늘 기록 초기화: "초기화"를 직접 입력해야 지운다 */
function ResetTodaySheet({ count, hits, onClose }: { count: number; hits: number; onClose: () => void }) {
  const store = useStore();
  const [word, setWord] = useState('');
  const [busy, setBusy] = useState(false);
  const ok = word.trim() === RESET_WORD;
  const run = async () => {
    if (!ok || busy) return;
    setBusy(true);
    const n = await store.clearToday();
    toast(`오늘 기록 ${n}순을 지웠습니다`);
    onClose();
  };
  return (
    <Sheet title="오늘 기록을 초기화할까요?" onClose={onClose}>
      <div className="small">오늘 저장한 <b>{count}순 {hits}중</b>이 모두 지워지고 되돌릴 수 없습니다.{store.online && ' 랭킹에 올린 오늘 순도 함께 지워집니다.'} 장비와 지난 기록은 그대로입니다.</div>
      <div className="field">
        <label htmlFor="resetWord">확인을 위해 <b>{RESET_WORD}</b>라고 입력하세요</label>
        <input id="resetWord" type="text" autoComplete="off" placeholder={RESET_WORD} value={word}
          onChange={(e) => setWord(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void run(); }} />
      </div>
      <button className="btn danger" disabled={!ok || busy} onClick={() => void run()}>{busy ? '지우는 중…' : '오늘 기록 초기화'}</button>
      <button className="btn ghost small" onClick={onClose}>취소</button>
    </Sheet>
  );
}

/** 순에 붙일 메모 태그. 끝의 "+ 태그"로 내 목록에 새 태그를 더하고 바로 붙인다. */
function TagPicker({ picked, onChange }: { picked: string[]; onChange: (tags: string[]) => void }) {
  const store = useStore();
  const list = myTags(store.settings);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [err, setErr] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const toggle = (t: string) => onChange(picked.includes(t) ? picked.filter((x) => x !== t) : [...picked, t]);
  const add = async () => {
    const bad = tagProblem(name, list);
    if (bad) { setErr(bad); return; }
    const next = addTag(list, name);
    const t = next[next.length - 1];
    await store.updateSettings({ memoTags: next });
    if (!picked.includes(t)) onChange([...picked, t]);
    setName(''); setErr(''); setAdding(false);
  };
  const close = () => { setAdding(false); setName(''); setErr(''); };
  return (
    <div className="field">
      <label>메모 태그</label>
      <div className="chips">
        {tagChoices(list, picked).map((t) => (
          <TagChip key={t} tag={t} on={picked.includes(t)} onToggle={() => toggle(t)} onLong={list.includes(t) ? () => setDeleting(t) : undefined} />
        ))}
        {!adding && <button className="chip add-chip" onClick={() => setAdding(true)}>+ 태그</button>}
      </div>
      {adding && (
        <div className="row tag-add">
          <input type="text" autoFocus aria-label="새 태그 이름" placeholder="예: 발디딤" maxLength={TAG_MAX + 2} value={name}
            onChange={(e) => { setName(e.target.value); setErr(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter') void add(); if (e.key === 'Escape') close(); }} />
          <button className="btn small" onClick={() => void add()}>추가</button>
          <button className="btn ghost small" onClick={close}>취소</button>
        </div>
      )}
      {err && <div className="small err-text" role="alert">{err}</div>}
      <div className="small muted">태그를 길게 누르면 목록에서 뺄 수 있습니다.</div>
      {deleting && <TagDeleteSheet tag={deleting} inDraft={picked.includes(deleting)} onClose={() => setDeleting(null)} />}
    </div>
  );
}

/** 누르면 붙이고 떼고, 길게 누르면 빼기 창 */
function TagChip({ tag, on, onToggle, onLong }: { tag: string; on: boolean; onToggle: () => void; onLong?: () => void }) {
  const lp = useLongPress(() => onLong?.());
  const { take, ...handlers } = lp;
  return (
    <button className={`chip tag-chip ${on ? 'on' : ''}`} aria-pressed={on} {...(onLong ? handlers : {})}
      onClick={() => { if (take()) onToggle(); }}>{tag}</button>
  );
}

const OPEN_GEAR = 'gukgungrok:open-gear';
/** 다른 화면에서 장비 관리를 열 때 (습사 탭으로 옮긴 뒤 부른다) */
// eslint-disable-next-line react-refresh/only-export-components
export function openGearManager() { window.dispatchEvent(new Event(OPEN_GEAR)); }

export function ShootScreen() {
  const store = useStore();
  const { settings, ends, gearName, gearOf } = store;
  const fresh = () => emptyDraft(defaultShare(store.settings, store.online));
  const [d, setD] = useState<Draft>(fresh);
  const [picking, setPicking] = useState(false);
  const [managing, setManaging] = useState(false);
  useEffect(() => {
    const on = () => { setPicking(false); setManaging(true); };
    window.addEventListener(OPEN_GEAR, on);
    return () => window.removeEventListener(OPEN_GEAR, on);
  }, []);

  /** 다른 곳(오늘 기록, 기록 탭)에서 고칠 순을 고르면 입력 칸에 그 순을 불러온다 */
  const editing = store.editId ? ends.find((e) => e.id === store.editId) ?? null : null;
  /** 위 과녁: 이번 순 입력, 또는 오늘 쏜 화살 모두 보기 */
  const [view, setView] = useState<'input' | 'today'>('input');
  /** 입력 과녁 위 (시 칸 + 버튼 줄) 높이. 오늘 전체에서도 같은 높이를 써서 과녁 위치를 맞춘다 */
  const topRef = useRef<HTMLDivElement>(null);
  const [topH, setTopH] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = topRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setTopH(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [view]);
  if ((editing?.id ?? null) !== d.editId) {
    setD(editing ? draftOf(editing) : fresh());
    // 고칠 순을 고르면 입력 과녁으로 돌아간다
    if (editing) setView('input');
  }
  const editIndex = editing ? ends.filter((e) => e.date === editing.date && e.recordedAt <= editing.recordedAt).length : 0;
  const cancelEdit = () => store.setEditId(null);
  const [weathering, setWeathering] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [rangeOpen, setRangeOpen] = useState(false);
  /** 오늘 과녁에서 끌어내 지운 시: 그 순을 입력 칸에 불러와 그 시를 비운다 */
  const removeSavedShot = (e: End, si: number) => {
    store.setEditId(e.id);
    setD({ ...draftOf(e), shots: e.shots.map((s, k) => (k === si ? null : s)), active: si });
    setView('input');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    toast(`${si + 1}시를 지웠습니다. 과녁을 눌러 다시 입력하세요`);
  };

  /** 지난 날짜에 순을 넣는 중이면 그날, 아니면 오늘 */
  const past = store.pastDate;
  const day = past ?? today();
  const todays = ends.filter((e) => e.date === day).sort((a, b) => a.recordedAt - b.recordedAt);
  const todayHits = todays.reduce((a, e) => a + hitsOf(e), 0);
  const filled = d.shots.filter(Boolean).length;
  const hitCount = d.shots.filter((s) => s?.hit).length;

  const [asking, setAsking] = useState(false);
  /** 방금 이룬 초몰기·3연몰 (축하 창) */
  const [cheer, setCheer] = useState<Achievement[]>([]);

  /** 5시가 처음 다 채워지는 순간 저장할지 묻는다 */
  const applyShots = (shots: (Shot | null)[], active: number) => {
    const wasFull = d.shots.every(Boolean);
    setD({ ...d, shots, active });
    if (!wasFull && shots.every(Boolean)) setAsking(true);
  };

  const tap = (x: number, y: number) => {
    const shots = [...d.shots];
    shots[d.active] = classifyTap(x, y, settings.hand, settings.grid);
    let active = d.active;
    for (let q = 1; q <= SHOTS_PER_END; q++) {
      const c = (d.active + q) % SHOTS_PER_END;
      if (!shots[c]) { active = c; break; }
    }
    applyShots(shots, active);
  };

  /** 과녁의 표시를 끌어 옮긴 시. 저장한 순을 고칠 때만 저장할지 묻는다 (prev: 되돌릴 때 쓸 원래 시) */
  const [moved, setMoved] = useState<{ i: number; prev: Shot } | null>(null);
  const dragLabel = (n: number, x: number, y: number) => `${n}시 · ${shotLabel(classifyTap(x, y, settings.hand, settings.grid), settings.grid, settings.hand)}`;
  const moveShot = (n: number, x: number, y: number) => {
    const i = n - 1;
    const prev = d.shots[i];
    if (!prev) return;
    const next = classifyTap(x, y, settings.hand, settings.grid);
    const shots = [...d.shots];
    shots[i] = next;
    if (editing && shots.every(Boolean)) {
      // 저장한 순: 옮긴 모습을 보여 주고 저장할지 묻는다
      setD({ ...d, shots, active: i });
      setMoved({ i, prev });
      return;
    }
    // 아직 저장하지 않은 순: 그냥 옮긴다 (저장할 때 다시 묻는다)
    setD({ ...d, shots });
    toast(`${n}시를 ${shotLabel(next, settings.grid, settings.hand)}(으)로 옮겼습니다`);
  };
  /** 입력한 5시를 모두 지울지 묻는 중 */
  const [clearing, setClearing] = useState(false);
  const clearShots = () => {
    setD((p) => ({ ...p, shots: Array(SHOTS_PER_END).fill(null), active: 0 }));
    setClearing(false);
  };
  /** 과녁 밖으로 끌어내 지우려는 시 (0부터) */
  const [removing, setRemoving] = useState<number | null>(null);
  const removeShot = (i: number) => {
    // 한 순은 5시라서 지운 시는 비워 두고 그 칸을 골라 다시 입력하게 한다
    setD((p) => ({ ...p, shots: p.shots.map((s, k) => (k === i ? null : s)), active: i }));
    setRemoving(null);
    setMoved(null);
    toast(`${i + 1}시를 지웠습니다. 과녁을 눌러 다시 입력하세요`);
  };
  const undoMove = () => {
    if (!moved) return;
    setD((p) => ({ ...p, shots: p.shots.map((s, k) => (k === moved.i ? moved.prev : s)) }));
    setMoved(null);
  };

  const setHand = (hand: 'right' | 'left') => {
    store.updateSettings({ hand });
    setD((p) => ({ ...p, shots: p.shots.map((s) => (s && !s.hit && s.side ? { ...s, direction: directionFor(s.side, hand) } : s)) }));
  };

  /** 같은 활터·전체 공개로 저장하려면 한 번 묻는다 (store.online이 없으면 공개되지 않으니 묻지 않는다) */
  const askShare = !!store.online && needsShareConfirm(editing, d);
  /** 공개 확인 창 (stay: 아래 save와 같다) */
  const [confirming, setConfirming] = useState<{ stay: boolean } | null>(null);
  const requestSave = (stay = false) => {
    if (filled < SHOTS_PER_END) return;
    if (askShare) { setAsking(false); setConfirming({ stay }); return; }
    void save(stay);
  };

  /** stay: 다른 탭으로 가면서 저장할 때는 기록 탭으로 데려가지 않는다. asPrivate: 나만 보기로 바꿔 저장 */
  const save = async (stay = false, asPrivate = false) => {
    if (filled < SHOTS_PER_END) return;
    setConfirming(null);
    const share = asPrivate ? null : d.share;
    if (editing) {
      await store.updateEnd({ ...editing, shots: d.shots as Shot[], tags: d.tags, memo: d.memo.trim(), share, ...(d.gear ?? {}) });
      toast(`${editing.date === today() ? '' : formatDate(editing.date) + ' '}${editIndex}순을 고쳤습니다 · ${hitCount}중`);
      setAsking(false);
      if (stay) return;
      store.setEditId(null);
      if (editing.date !== today()) { focusLogEnd(editing.date, editing.id); showLogView(); location.hash = 'log'; }
      return;
    }
    const e = await store.saveEnd({ shots: d.shots as Shot[], tags: d.tags, memo: d.memo.trim(), share }, past ?? undefined);
    const h = hitsOf(e);
    if (past) {
      // 지난 순은 업적을 다시 계산해 목록에만 남긴다 (축하 창은 오늘 순에만 띄운다)
      const line = earnedLine(newlyEarned(achievements(ends, {}, today(), store.gear), achievements([...ends, e], {}, today(), store.gear)));
      toast(`${formatDate(past)} ${todays.length + 1}순 저장 · ${h}중${h === 5 ? ' 몰기!' : ''}${line ? ` · ${line}` : ''}`);
      setD(fresh());
      setAsking(false);
      return;
    }
    const earned = newlyEarned(achievements(ends, {}, today(), store.gear), achievements([...ends, e], {}, today(), store.gear));
    const line = earnedLine(earned);
    const special = earned.filter((a) => a.special);
    // 초몰기·3연몰은 축하 창이 대신 알린다 (알림이 창을 가리지 않게)
    if (special.length) setCheer(special);
    else toast(`${todays.length + 1}순 저장 · ${h}중${h === 5 ? ' 몰기!' : ''}${line ? ` · ${line}` : ''}`);
    setD(fresh());
    setAsking(false);
  };

  // 고치는 중에 다른 탭으로 가려 할 때 App이 "저장하고 이동"을 할 수 있게 알려 둔다
  // 공개 확인이 필요하면 App의 "저장하고 이동" 창이 대신 공개 범위를 알리고 묻는다
  store.editSaver.current = editing ? { canSave: filled === SHOTS_PER_END, share: askShare && d.share ? { scope: d.share, memo: d.memo, tags: d.tags } : null, save: () => save(true) } : null;

  /**
   * 장비 칸이 다루는 것
   * end: 고치는 중인 순의 장비 (저장할 때 그 순에만)
   * day: 기록이 있는 지난 날짜 (그날 저장한 순 모두를 바꾼다. 새로 넣는 순도 그날 마지막 순을 따른다)
   * today: 오늘 장비 (다음 순부터. 이미 저장한 오늘 순에도 한 번에 적용할 수 있다)
   */
  const gearMode: 'end' | 'day' | 'today' = editing ? 'end' : past && todays.length > 0 ? 'day' : 'today';
  const [dayGear, setDayGear] = useState<EndGear | null>(null);
  const shownGear: EndGear = gearMode === 'end' && d.gear ? d.gear
    : gearMode === 'day' ? dayGear ?? lastGearOf(ends, day)! : gearOfSettings(settings.current);
  const gearTitle = gearMode === 'end' ? `${editIndex}순 장비` : past ? '이 날 장비' : '오늘 장비';
  const gearLine = (g: EndGear) => `${gearName(g.bowId)} · ${gearName(g.ringId)} · ${gearName(g.arrowId)}${g.stringId ? ` · ${gearName(g.stringId)}` : ''}`;
  const dayDiffers = gearMode === 'day' && todays.some((e) => !sameGear(e, shownGear));
  const todaysDiffer = gearMode === 'today' ? todays.filter((e) => !sameGear(e, shownGear)).length : 0;
  const openPicker = () => {
    if (noGear) { setManaging(true); return; }
    setDayGear(gearMode === 'day' ? lastGearOf(ends, day) : null);
    setPicking(true);
  };
  const pickGear = (c: TrackedCategory, id: string) => {
    const k = GEAR_KEY[c];
    if (gearMode === 'end') setD((p) => ({ ...p, gear: { ...(p.gear ?? shownGear), [k]: id } }));
    else if (gearMode === 'day') setDayGear((p) => ({ ...(p ?? shownGear), [k]: id }));
    else void store.updateSettings({ current: { ...settings.current, [c]: id } });
  };
  const applyDayGear = async (g: EndGear) => {
    const n = await store.setDayGear(day, g);
    setPicking(false);
    toast(n ? `${past ? formatDate(day) : '오늘'} ${n}순의 장비를 바꿨습니다` : '바꿀 순이 없습니다');
  };

  const marks: Mark[] = d.shots.flatMap((s, i) => (s ? [{ x: s.x, y: s.y, hit: s.hit, n: i + 1 }] : []));
  const noGear = !gearOf('bow').length;
  const myDan = topDan(settings.dans);
  const welcome = welcomeFor(today(), trendOf(ends, today()));

  return (
    <>
      {!editing && !past && (
        <div className="welcome-row">
          {store.grade.grade && <GradeMark grade={store.grade.grade} size={40} />}
          <div className="welcome">
            <p><b>{welcomeWho(settings.club?.name, settings.online?.nickname, honorific(ends.some((e) => hitsOf(e) === SHOTS_PER_END)), myDan ? danShort(myDan) : null)}</b>, {welcome.greet}</p>
            <p className="remark">{store.title && <span className="pill title big">{store.title}</span>} {welcome.remark}</p>
          </div>
        </div>
      )}
      <section className={`card shoot-card ${editing ? 'editing' : ''}`}>
        {editing && (
          <div className="edit-banner">
            <span><b>{formatDate(editing.date)} {editIndex}순</b> 고치는 중</span>
            <button className="btn ghost small" onClick={cancelEdit}>그만 고치기</button>
          </div>
        )}
        {past && !editing && (
          <div className="edit-banner">
            <span><b>{formatDate(past)}</b> 기록 넣는 중</span>
            <button className="btn ghost small" onClick={() => store.setPastDate(null)}>오늘로 돌아가기</button>
          </div>
        )}
        {past && !editing && (
          <div className="small muted">{todays.length
            ? '장비·활터·날씨는 그날 마지막 순과 같게 저장하고, 그날 마지막 순 뒤에 붙습니다.'
            : '그날 기록이 없어 지금 고른 장비와 활터로 저장하고 날씨는 비워 둡니다.'} 지난 순은 랭킹에 오르지 않고, 업적은 날짜에 맞춰 다시 계산됩니다.</div>
        )}
        <div className="end-head">
          <span className="title">{editing ? `${editIndex}순 고치기` : `${todays.length + 1}순`} {!editing && <span className="end-date">{formatDate(day)}</span>}</span>
          <span className="row">
            <span className="seg" role="group" aria-label="우궁 좌궁">
              <button className={settings.hand === 'right' ? 'on' : ''} onClick={() => setHand('right')}>우궁</button>
              <button className={settings.hand === 'left' ? 'on' : ''} onClick={() => setHand('left')}>좌궁</button>
            </span>
            <button className={`chip ${settings.grid ? 'on' : ''}`} aria-pressed={settings.grid} onClick={() => store.updateSettings({ grid: !settings.grid })}>9등분</button>
          </span>
        </div>
        {todays.length > 0 && (
          <div className="seg shoot-view" role="group" aria-label="과녁 보기">
            <button className={view === 'input' ? 'on' : ''} aria-pressed={view === 'input'} onClick={() => setView('input')}>{editing ? `${editIndex}순 고치기` : `${todays.length + 1}순 입력`}</button>
            <button className={view === 'today' ? 'on' : ''} aria-pressed={view === 'today'} onClick={() => setView('today')}>{past ? '그날' : '오늘'} 전체 {todays.length}순</button>
          </div>
        )}
        {view === 'today' && todays.length > 0 ? <TodayTarget ends={todays} onRemoveShot={removeSavedShot} topHeight={topH} /> : <>
        <div className="target-top" ref={topRef}>
        <div className="shot-tabs">
          {d.shots.map((s, i) => (
            <button key={i} className={`st ${i === d.active ? 'active' : ''} ${s?.hit ? 'hit' : ''}`} onClick={() => setD((p) => ({ ...p, active: i }))}
              aria-label={`${i + 1}시 ${s ? shotLabel(s, settings.grid, settings.hand) : '미입력'}`}>
              <b>{i + 1}시</b><span>{s ? shotLabel(s, settings.grid, settings.hand) : '—'}</span>
            </button>
          ))}
        </div>
        <div className="row between">
          <span className="row">
            <button className="btn ghost small" onClick={() => applyShots(Array.from({ length: SHOTS_PER_END }, hitShot), d.active)}>몰기</button>
            <button className="btn ghost small" disabled={!filled} onClick={() => setClearing(true)}>초기화</button>
          </span>
          <button className="btn small" disabled={filled < SHOTS_PER_END} onClick={() => requestSave()}>{filled === SHOTS_PER_END ? `${editing ? '고친 내용 저장' : '저장'} · ${hitCount}중` : `저장 (${filled}/5)`}</button>
        </div>
        </div>
        <div className="target-wrap">
          <Target hand={settings.hand} grid={settings.grid} marks={marks} onTap={tap} onMove={moveShot} onRemove={(n) => { if (d.shots[n - 1]) setRemoving(n - 1); }} dragLabel={dragLabel} label={`과녁을 눌러 ${d.active + 1}시 입력`} />
          <div className="hint">
            {filled === SHOTS_PER_END
              ? '5시 입력 완료. 과녁의 번호를 끌어서 옮기면 그 시를 고치고, 그림 밖으로 끌어내면 지울 수 있습니다.'
              : `${d.active + 1}시: 과녁을 누르면 관중${settings.grid ? '(칸 위치 기록)' : ''}, 바깥 띠를 누르면 불입니다. 안쪽 띠는 조금, 바깥 띠는 많이 빠진 것입니다.`}
          </div>
        </div>
        <TagPicker picked={d.tags} onChange={(tags) => setD((p) => ({ ...p, tags }))} />
        <div className="field">
          <label htmlFor="memo">순 메모</label>
          <AutoTextarea id="memo" rows={2} placeholder="예: 만작을 길게 가져가니 좋았음" value={d.memo} onChange={(e) => setD({ ...d, memo: e.target.value })} />
        </div>
        <SharePicker value={d.share} hasContent={!!(d.memo.trim() || d.tags.length)} onChange={(share) => {
          setD((p) => ({ ...p, share }));
          // 새 순에서 고른 범위는 다음 순에도 쓴다 (지난 순을 고칠 때는 기억하지 않는다)
          if (!editing) void store.updateSettings({ lastShare: share });
        }} />
        <button className="btn" disabled={filled < SHOTS_PER_END} onClick={() => requestSave()}>
          {filled === SHOTS_PER_END ? `${editing ? `${editIndex}순 고친 내용 저장` : `${todays.length + 1}순 저장`} · ${hitCount}중` : `5시를 모두 입력하세요 (${filled}/5)`}
        </button>
        {editing && <button className="btn ghost" onClick={cancelEdit}>고치지 않고 돌아가기</button>}
        </>}
      </section>

      <button className="gear" onClick={openPicker}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="label">{gearTitle}</div>
          <div className="names">
            {noGear ? '눌러서 활을 추가하면 장비별 분석을 볼 수 있습니다' : gearLine(shownGear)}
          </div>
        </div>
        <span className="change">바꾸기</span>
      </button>
      {/* 지난 날짜에 그날 기록이 있으면 활터는 그날 마지막 순을 따르므로 고르는 칸을 숨긴다 */}
      {!(past && todays.length > 0) && <>
      <button className="gear" onClick={() => setRangeOpen(true)}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="label">활터 <span className="opt">선택</span>{store.currentRange && !settings.currentRangeManual && <span className="opt">위치로 고름</span>}</div>
          <div className={`names ${store.currentRange ? '' : 'muted-names'}`}>
            {store.currentRange ? store.currentRange.name : store.unknownSpot ? '등록되지 않은 곳입니다. 활터라면 눌러서 등록하세요' : '활터를 등록하면 위치로 알아서 고르고, 활터별로 비교할 수 있습니다'}
          </div>
        </div>
        <span className="change">{store.currentRange ? '바꾸기' : '등록'}</span>
      </button>
      </>}
      {!past && <button className="gear" onClick={() => setWeathering(true)}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="label">오늘 날씨 <span className="opt">선택</span></div>
          <div className={`names ${store.todayWeather ? '' : 'muted-names'}`}>{weatherLabel(store.todayWeather) || '날씨·기온·바람을 남기면 날씨별로 비교할 수 있습니다'}</div>
        </div>
        <span className="change">{store.todayWeather ? '바꾸기' : '입력'}</span>
      </button>}

      <section className="card">
        <div className="row between">
          <h2>{past ? `${formatDate(past)} 기록` : '오늘 기록'}</h2>
          <span className="num"><b>{todays.length}순 {todayHits}중</b>{todays.length > 0 && <span className="muted small"> 순당 {(todayHits / todays.length).toFixed(1)}중</span>}</span>
        </div>
        {todays.length === 0
          ? <div className="empty">첫 순을 저장하면 여기에 쌓입니다.</div>
          : <>
            <div className="today-list">{todays.map((e, i) => (
              <EndLine key={e.id} end={e} index={i} selected={e.id === store.editId}
                onSelect={() => { store.setEditId(e.id === store.editId ? null : e.id); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />
            ))}</div>
            <div className="row between">
              <span className="small muted">저장한 순을 누르면 위 입력 칸에 불러와 고칠 수 있습니다.</span>
              {!past && <button className="btn ghost small danger-text" onClick={() => setResetting(true)}>오늘 기록 초기화</button>}
            </div>
          </>}
        {/* 순 메모와 따로, 그날 전체를 돌아보는 메모 (편집 중인 순과 상관없이 보이는 날짜의 메모) */}
        <DayMemoField date={day} label={past ? '이 날 메모' : '오늘 메모'} />
      </section>

      {asking && (
        <Sheet title={editing ? `${editIndex}순 고친 내용을 저장할까요?` : `${todays.length + 1}순 저장할까요?`} onClose={() => setAsking(false)}>
          <div className="confirm-end">
            <span className="dots">{(d.shots as Shot[]).map((s, i) => <ShotIcon key={i} shot={s} index={i} />)}</span>
            <b>{hitCount}중{hitCount === 5 ? ' · 몰기' : ''}</b>
          </div>
          <div className="small muted">{d.shots.map((s, i) => `${i + 1}시 ${shotLabel(s, settings.grid, settings.hand)}`).join(', ')}</div>
          {askShare && d.share
            ? <>
              <ShareNotice scope={d.share} what="시수, 태그, 메모가" memo={d.memo} tags={d.tags} />
              <button className="btn" onClick={() => save()}>{SHARE_LABEL[d.share]}하고 저장</button>
              <button className="btn ghost" onClick={() => save(false, true)}>나만 보기로 저장</button>
            </>
            : <button className="btn" onClick={() => save()}>저장</button>}
          <div className="row between">
            <button className="btn ghost small" onClick={() => { setAsking(false); setTimeout(() => document.getElementById('memo')?.focus(), 50); }}>메모 쓰고 저장</button>
            <button className="btn ghost small" onClick={() => setAsking(false)}>고치기</button>
          </div>
        </Sheet>
      )}
      {moved && editing && (() => {
        const now = d.shots[moved.i];
        return (
          <Sheet title={`${moved.i + 1}시를 옮겨 저장할까요?`} onClose={undoMove}>
            <div className="move-change">
              <span><ShotIcon shot={moved.prev} index={moved.i} /> {shotLabel(moved.prev, settings.grid, settings.hand)}</span>
              <span aria-hidden>→</span>
              <span><ShotIcon shot={now!} index={moved.i} /> <b>{shotLabel(now, settings.grid, settings.hand)}</b></span>
            </div>
            <div className="confirm-end">
              <span className="dots">{(d.shots as Shot[]).map((s, i) => <ShotIcon key={i} shot={s} index={i} />)}</span>
              <b>{hitCount}중{hitCount === 5 ? ' · 몰기' : ''}</b>
            </div>
            <div className="small muted">{formatDate(editing.date)} {editIndex}순에 바로 저장합니다.</div>
            <button className="btn" onClick={() => { setMoved(null); requestSave(true); }}>저장</button>
            <button className="btn ghost" onClick={undoMove}>되돌리기</button>
            <button className="btn ghost small" onClick={() => setMoved(null)}>저장하지 않고 더 고치기</button>
          </Sheet>
        );
      })()}
      {clearing && (
        <Sheet title={`입력한 ${filled}시를 모두 지울까요?`} onClose={() => setClearing(false)}>
          <div className="confirm-end">
            <span className="dots">{d.shots.map((s, i) => s ? <ShotIcon key={i} shot={s} index={i} /> : null)}</span>
            <b>{hitCount}중</b>
          </div>
          <div className="small muted">{editing
            ? `과녁을 눌러 1시부터 다시 입력합니다. 5시를 다 넣고 저장하기 전까지 ${editIndex}순의 저장된 기록은 그대로입니다. 태그와 메모는 지우지 않습니다.`
            : '과녁을 눌러 1시부터 다시 입력합니다. 태그와 메모는 지우지 않습니다.'}</div>
          <button className="btn danger" onClick={clearShots}>초기화</button>
          <button className="btn ghost" onClick={() => setClearing(false)}>그대로 두기</button>
        </Sheet>
      )}
      {removing != null && d.shots[removing] && (
        <Sheet title={`${removing + 1}시를 지울까요?`} onClose={() => setRemoving(null)}>
          <div className="move-change">
            <span><ShotIcon shot={d.shots[removing]!} index={removing} /> {removing + 1}시 {shotLabel(d.shots[removing], settings.grid, settings.hand)}</span>
          </div>
          <div className="small muted">{editing
            ? `한 순은 5시라서 지운 칸은 비워 둡니다. 과녁을 눌러 ${removing + 1}시를 다시 입력하면 ${editIndex}순에 저장할지 묻습니다. 다시 입력하기 전까지 저장된 기록은 그대로입니다.`
            : `한 순은 5시라서 지운 칸은 비워 둡니다. 과녁을 눌러 ${removing + 1}시를 다시 입력하세요.`}</div>
          <button className="btn danger" onClick={() => removeShot(removing)}>{removing + 1}시 지우기</button>
          <button className="btn ghost" onClick={() => setRemoving(null)}>지우지 않기</button>
        </Sheet>
      )}
      {confirming && d.share && (
        <ShareConfirmSheet scope={d.share} what="시수, 태그, 메모가" memo={d.memo} tags={d.tags}
          onConfirm={() => save(confirming.stay)} onPrivate={() => save(confirming.stay, true)} onClose={() => setConfirming(null)} />
      )}
      {resetting && <ResetTodaySheet count={todays.length} hits={todayHits} onClose={() => setResetting(false)} />}
      {weathering && <WeatherSheet onClose={() => setWeathering(false)} />}
      {rangeOpen && <RangeSheet onClose={() => setRangeOpen(false)} />}
      {picking && (
        <Sheet title={gearTitle} onClose={() => setPicking(false)}>
          <div className="small muted">{gearMode === 'end'
            ? `고른 장비는 "고친 내용 저장"을 누르면 ${editIndex}순에만 적용됩니다.`
            : gearMode === 'day'
              ? `아래 "바꾸기"를 누르면 ${formatDate(day)}에 저장한 ${todays.length}순 모두의 장비가 바뀝니다.`
              : '고른 장비는 다음 순부터 적용됩니다.'}</div>
          {([['bow', '활'], ['ring', '깍지'], ['arrow', '화살'], ['string', '현']] as [TrackedCategory, string][]).map(([c, name]) => (
            <div className="field" key={c}>
              <label>{name}</label>
              <div className="chips">
                {gearOf(c).length === 0 && <span className="small muted">등록된 {name}이(가) 없습니다.</span>}
                {gearOf(c).map((g) => (
                  <button key={g.id} className={`chip ${shownGear[GEAR_KEY[c]] === g.id ? 'on' : ''}`}
                    onClick={() => pickGear(c, g.id)}>{g.nickname}</button>
                ))}
              </div>
            </div>
          ))}
          <div className="row">
            <button className="btn ghost small" onClick={() => { setPicking(false); setManaging(true); }}>장비 추가·고치기</button>
          </div>
          {gearMode === 'day'
            ? <>
              <button className="btn" disabled={!dayDiffers} onClick={() => void applyDayGear(dayGear!)}>{formatDate(day)} {todays.length}순 장비 바꾸기</button>
              <button className="btn ghost" onClick={() => setPicking(false)}>바꾸지 않고 닫기</button>
            </>
            : <>
              {gearMode === 'today' && todaysDiffer > 0 && (
                <button className="btn ghost" onClick={() => void applyDayGear(shownGear)}>이미 저장한 {todaysDiffer}순도 이 장비로 바꾸기</button>
              )}
              <button className="btn" onClick={() => setPicking(false)}>완료</button>
            </>}
        </Sheet>
      )}
      {cheer.length > 0 && (
        <Sheet title="업적 달성" onClose={() => setCheer([])}>
          {cheer.map((a) => (
            <div key={a.id} className="celebrate">
              <span className="feat-badge" aria-hidden>中</span>
              <b className="feat-name">{a.name}</b>
              <span className="small muted">{a.desc}</span>
              <span className="small"><b>{a.date!.slice(0, 4)}년 {formatDate(a.date!)}</b> {a.endNo}순</span>
            </div>
          ))}
          <div className="small muted" style={{ textAlign: 'center' }}>축하합니다! {todays.length}순 저장. 기록과 통계 탭의 업적에 이 날짜로 남습니다.</div>
          <button className="btn" onClick={() => setCheer([])}>확인</button>
        </Sheet>
      )}
      {managing && (
        <Sheet title="내 장비" onClose={() => { setManaging(false); setPicking(true); }}>
          <div className="gear-manage"><GearScreen /></div>
          <button className="btn" onClick={() => { setManaging(false); setPicking(true); }}>오늘 장비 고르기로 돌아가기</button>
        </Sheet>
      )}
    </>
  );
}
