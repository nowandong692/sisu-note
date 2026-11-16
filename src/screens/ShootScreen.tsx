import { useEffect, useState } from 'react';
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
import { DayMemoField } from '../components/DayMemoField';
import { defaultShare } from '../domain/sharedMemo';
import { onlineAvailable } from '../platform/online';
import { useStore } from '../state/store';
import { focusLogEnd } from './LogScreen';
import { showLogView } from './RecordsScreen';
import { GearScreen } from './GearScreen';
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
}
const emptyDraft = (share: MemoShare | null = null): Draft => ({ editId: null, shots: Array(SHOTS_PER_END).fill(null), active: 0, tags: [], memo: '', share });
const draftOf = (e: End): Draft => ({ editId: e.id, shots: [...e.shots], active: 0, tags: [...e.tags], memo: e.memo, share: e.share ?? null });

export function EndLine({ end, index, showMeta = true, selected, onSelect }: { end: End; index: number; showMeta?: boolean; selected?: boolean; onSelect?: () => void }) {
  const { gearName } = useStore();
  const h = hitsOf(end);
  return (
    <div className={`end-line ${onSelect ? 'selectable' : ''} ${selected ? 'selected' : ''}`}
      {...(onSelect ? { role: 'button', tabIndex: 0, 'aria-pressed': !!selected, onClick: onSelect, onKeyDown: (ev: React.KeyboardEvent) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onSelect(); } } } : {})}>
      <span className="idx">{index + 1}순</span>
      <span className="dots">{end.shots.map((s, i) => <ShotIcon key={i} shot={s} index={i} />)}</span>
      <span className="cnt">{h}중{h === 5 && <span className="pill best">몰기</span>}</span>
      {showMeta && <span className="meta">{endMeta(end, gearName)}</span>}
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

/** 메모 공개 범위 고르기. 랭킹(겨루기)에 참여해 닉네임이 있어야 공개할 수 있다. */
function SharePicker({ value, hasContent, onChange }: { value: MemoShare | null; hasContent: boolean; onChange: (v: MemoShare | null) => void }) {
  const { online } = useStore();
  if (!onlineAvailable()) return null;
  if (!online) {
    return hasContent ? <div className="small muted share-hint">겨루기 탭에서 닉네임을 정하면 메모를 다른 궁사에게 공개하고 조언을 받을 수 있습니다.</div> : null;
  }
  const noClub = !online.rangeName;
  const opts: [MemoShare | null, string][] = [[null, '나만 보기'], ['club', '같은 활터'], ['all', '전체 공개']];
  return (
    <div className="field share-field">
      <label id="shareLabel">메모 공개</label>
      <div className="seg" role="group" aria-labelledby="shareLabel">
        {opts.map(([v, l]) => (
          <button key={l} className={value === v ? 'on' : ''} aria-pressed={value === v} disabled={v === 'club' && noClub && value !== 'club'} onClick={() => onChange(v)}>{l}</button>
        ))}
      </div>
      {value && <div className="small muted">{online.nickname} 이름으로 {value === 'club' ? `${online.rangeName ?? '내 소속 활터'} 궁사에게` : '모든 궁사에게'} 시수, 태그, 메모가 보입니다.{!hasContent && ' 메모나 태그를 남겨야 올라갑니다.'}</div>}
      {!value && noClub && <div className="small muted">같은 활터 공개는 설정에서 소속 활터를 정하면 쓸 수 있습니다.</div>}
    </div>
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
  if ((editing?.id ?? null) !== d.editId) setD(editing ? draftOf(editing) : fresh());
  const editIndex = editing ? ends.filter((e) => e.date === editing.date && e.recordedAt <= editing.recordedAt).length : 0;
  const cancelEdit = () => store.setEditId(null);
  const [weathering, setWeathering] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [rangeOpen, setRangeOpen] = useState(false);

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

  const setHand = (hand: 'right' | 'left') => {
    store.updateSettings({ hand });
    setD((p) => ({ ...p, shots: p.shots.map((s) => (s && !s.hit && s.side ? { ...s, direction: directionFor(s.side, hand) } : s)) }));
  };

  /** stay: 다른 탭으로 가면서 저장할 때는 기록 탭으로 데려가지 않는다 */
  const save = async (stay = false) => {
    if (filled < SHOTS_PER_END) return;
    if (editing) {
      await store.updateEnd({ ...editing, shots: d.shots as Shot[], tags: d.tags, memo: d.memo.trim(), share: d.share });
      toast(`${editing.date === today() ? '' : formatDate(editing.date) + ' '}${editIndex}순을 고쳤습니다 · ${hitCount}중`);
      setAsking(false);
      if (stay) return;
      store.setEditId(null);
      if (editing.date !== today()) { focusLogEnd(editing.date, editing.id); showLogView(); location.hash = 'log'; }
      return;
    }
    const e = await store.saveEnd({ shots: d.shots as Shot[], tags: d.tags, memo: d.memo.trim(), share: d.share }, past ?? undefined);
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
  store.editSaver.current = editing ? { canSave: filled === SHOTS_PER_END, save: () => save(true) } : null;

  const marks: Mark[] = d.shots.flatMap((s, i) => (s ? [{ x: s.x, y: s.y, hit: s.hit, n: i + 1 }] : []));
  const noGear = !gearOf('bow').length;
  const myDan = topDan(settings.dans);
  const welcome = welcomeFor(today(), trendOf(ends, today()));

  return (
    <>
      {!editing && !past && (
        <div className="welcome">
          <p><b>{welcomeWho(settings.club?.name, settings.online?.nickname, honorific(ends.some((e) => hitsOf(e) === SHOTS_PER_END)), myDan ? danShort(myDan) : null)}</b>, {welcome.greet}</p>
          <p className="remark">{welcome.remark}</p>
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
        <div className="shot-tabs">
          {d.shots.map((s, i) => (
            <button key={i} className={`st ${i === d.active ? 'active' : ''} ${s?.hit ? 'hit' : ''}`} onClick={() => setD((p) => ({ ...p, active: i }))}
              aria-label={`${i + 1}시 ${s ? shotLabel(s, settings.grid) : '미입력'}`}>
              <b>{i + 1}시</b><span>{s ? shotLabel(s, settings.grid) : '—'}</span>
            </button>
          ))}
        </div>
        <div className="row between">
          <span className="row">
            <button className="btn ghost small" onClick={() => applyShots(Array.from({ length: SHOTS_PER_END }, hitShot), d.active)}>몰기</button>
            <button className="btn ghost small" disabled={!filled} onClick={() => setD((p) => ({ ...p, shots: Array(SHOTS_PER_END).fill(null), active: 0 }))}>다시 입력</button>
          </span>
          <button className="btn small" disabled={filled < SHOTS_PER_END} onClick={() => save()}>{filled === SHOTS_PER_END ? `${editing ? '고친 내용 저장' : '저장'} · ${hitCount}중` : `저장 (${filled}/5)`}</button>
        </div>
        <div className="target-wrap">
          <Target hand={settings.hand} grid={settings.grid} marks={marks} onTap={tap} label={`과녁을 눌러 ${d.active + 1}시 입력`} />
          <div className="hint">
            {filled === SHOTS_PER_END
              ? '5시 입력 완료. 고칠 시를 위에서 고르고 다시 누르세요.'
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
        <button className="btn" disabled={filled < SHOTS_PER_END} onClick={() => save()}>
          {filled === SHOTS_PER_END ? `${editing ? `${editIndex}순 고친 내용 저장` : `${todays.length + 1}순 저장`} · ${hitCount}중` : `5시를 모두 입력하세요 (${filled}/5)`}
        </button>
        {editing && <button className="btn ghost" onClick={cancelEdit}>고치지 않고 돌아가기</button>}
      </section>

      {/* 지난 날짜에 그날 기록이 있으면 장비·활터는 그날 마지막 순을 따르므로 고르는 칸을 숨긴다 */}
      {!(past && todays.length > 0) && <>
      <button className="gear" onClick={() => (noGear ? setManaging(true) : setPicking(true))}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="label">{past ? '이 날 장비' : '오늘 장비'}</div>
          <div className="names">
            {noGear ? '눌러서 활을 추가하면 장비별 분석을 볼 수 있습니다' : `${gearName(settings.current.bow)} · ${gearName(settings.current.ring)} · ${gearName(settings.current.arrow)}${settings.current.string ? ` · ${gearName(settings.current.string)}` : ''}`}
          </div>
        </div>
        <span className="change">바꾸기</span>
      </button>
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
          <div className="small muted">{d.shots.map((s, i) => `${i + 1}시 ${shotLabel(s, settings.grid)}`).join(', ')}</div>
          <button className="btn" onClick={() => save()}>저장</button>
          <div className="row between">
            <button className="btn ghost small" onClick={() => { setAsking(false); setTimeout(() => document.getElementById('memo')?.focus(), 50); }}>메모 쓰고 저장</button>
            <button className="btn ghost small" onClick={() => setAsking(false)}>고치기</button>
          </div>
        </Sheet>
      )}
      {resetting && <ResetTodaySheet count={todays.length} hits={todayHits} onClose={() => setResetting(false)} />}
      {weathering && <WeatherSheet onClose={() => setWeathering(false)} />}
      {rangeOpen && <RangeSheet onClose={() => setRangeOpen(false)} />}
      {picking && (
        <Sheet title="오늘 장비" onClose={() => setPicking(false)}>
          <div className="small muted">고른 장비는 다음 순부터 적용됩니다.</div>
          {([['bow', '활'], ['ring', '깍지'], ['arrow', '화살'], ['string', '현']] as [TrackedCategory, string][]).map(([c, name]) => (
            <div className="field" key={c}>
              <label>{name}</label>
              <div className="chips">
                {gearOf(c).length === 0 && <span className="small muted">등록된 {name}이(가) 없습니다.</span>}
                {gearOf(c).map((g) => (
                  <button key={g.id} className={`chip ${settings.current[c] === g.id ? 'on' : ''}`}
                    onClick={() => store.updateSettings({ current: { ...settings.current, [c]: g.id } })}>{g.nickname}</button>
                ))}
              </div>
            </div>
          ))}
          <div className="row">
            <button className="btn ghost small" onClick={() => { setPicking(false); setManaging(true); }}>장비 추가·고치기</button>
          </div>
          <button className="btn" onClick={() => setPicking(false)}>완료</button>
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
