import { useState } from 'react';
import { ShotIcon } from '../components/ShotIcon';
import { endMeta } from '../domain/endMeta';
import { WeatherSheet } from '../components/WeatherSheet';
import { RangeSheet } from '../components/RangeSheet';
import { Target, type Mark } from '../components/Target';
import { AutoTextarea, Sheet, toast } from '../components/ui';
import { classifyTap, directionFor, hitShot, shotLabel } from '../domain/target';
import { hitsOf } from '../domain/stats';
import type { End, GearCategory, Shot } from '../domain/types';
import { MEMO_TAGS, SHOTS_PER_END } from '../domain/types';
import { formatDate, today } from '../domain/util';
import { weatherLabel } from '../domain/weather';
import { useStore } from '../state/store';
import { focusLogEnd } from './LogScreen';
import { showLogView } from './RecordsScreen';

interface Draft {
  /** 고치는 중인 순 id (새 순이면 null) */
  editId: string | null;
  shots: (Shot | null)[];
  active: number;
  tags: string[];
  memo: string;
}
const emptyDraft = (): Draft => ({ editId: null, shots: Array(SHOTS_PER_END).fill(null), active: 0, tags: [], memo: '' });
const draftOf = (e: End): Draft => ({ editId: e.id, shots: [...e.shots], active: 0, tags: [...e.tags], memo: e.memo });

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

export function ShootScreen() {
  const store = useStore();
  const { settings, ends, gearName, gearOf } = store;
  const [d, setD] = useState<Draft>(emptyDraft);
  const [picking, setPicking] = useState(false);

  /** 다른 곳(오늘 기록, 기록 탭)에서 고칠 순을 고르면 입력 칸에 그 순을 불러온다 */
  const editing = store.editId ? ends.find((e) => e.id === store.editId) ?? null : null;
  if ((editing?.id ?? null) !== d.editId) setD(editing ? draftOf(editing) : emptyDraft());
  const editIndex = editing ? ends.filter((e) => e.date === editing.date && e.recordedAt <= editing.recordedAt).length : 0;
  const cancelEdit = () => store.setEditId(null);
  const [weathering, setWeathering] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [rangeOpen, setRangeOpen] = useState(false);

  const todays = ends.filter((e) => e.date === today()).sort((a, b) => a.recordedAt - b.recordedAt);
  const todayHits = todays.reduce((a, e) => a + hitsOf(e), 0);
  const filled = d.shots.filter(Boolean).length;
  const hitCount = d.shots.filter((s) => s?.hit).length;

  const [asking, setAsking] = useState(false);

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
      await store.updateEnd({ ...editing, shots: d.shots as Shot[], tags: d.tags, memo: d.memo.trim() });
      toast(`${editing.date === today() ? '' : formatDate(editing.date) + ' '}${editIndex}순을 고쳤습니다 · ${hitCount}중`);
      setAsking(false);
      if (stay) return;
      store.setEditId(null);
      if (editing.date !== today()) { focusLogEnd(editing.date, editing.id); showLogView(); location.hash = 'log'; }
      return;
    }
    const e = await store.saveEnd({ shots: d.shots as Shot[], tags: d.tags, memo: d.memo.trim() });
    const h = hitsOf(e);
    toast(`${todays.length + 1}순 저장 · ${h}중${h === 5 ? ' 몰기!' : ''}`);
    setD(emptyDraft());
    setAsking(false);
  };

  // 고치는 중에 다른 탭으로 가려 할 때 App이 "저장하고 이동"을 할 수 있게 알려 둔다
  store.editSaver.current = editing ? { canSave: filled === SHOTS_PER_END, save: () => save(true) } : null;

  const marks: Mark[] = d.shots.flatMap((s, i) => (s ? [{ x: s.x, y: s.y, hit: s.hit, n: i + 1 }] : []));
  const noGear = !gearOf('bow').length;

  return (
    <>
      <section className={`card shoot-card ${editing ? 'editing' : ''}`}>
        {editing && (
          <div className="edit-banner">
            <span><b>{formatDate(editing.date)} {editIndex}순</b> 고치는 중</span>
            <button className="btn ghost small" onClick={cancelEdit}>그만 고치기</button>
          </div>
        )}
        <div className="end-head">
          <span className="title">{editing ? `${editIndex}순 고치기` : `${todays.length + 1}순`} {!editing && <span className="end-date">{formatDate(today())}</span>}</span>
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
        <div className="field">
          <label>메모 태그</label>
          <div className="chips">
            {MEMO_TAGS.map((t) => (
              <button key={t} className={`chip ${d.tags.includes(t) ? 'on' : ''}`} aria-pressed={d.tags.includes(t)}
                onClick={() => setD((p) => ({ ...p, tags: p.tags.includes(t) ? p.tags.filter((x) => x !== t) : [...p.tags, t] }))}>{t}</button>
            ))}
          </div>
        </div>
        <div className="field">
          <label htmlFor="memo">순 메모</label>
          <AutoTextarea id="memo" rows={2} placeholder="예: 만작을 길게 가져가니 좋았음" value={d.memo} onChange={(e) => setD({ ...d, memo: e.target.value })} />
        </div>
        <button className="btn" disabled={filled < SHOTS_PER_END} onClick={() => save()}>
          {filled === SHOTS_PER_END ? `${editing ? `${editIndex}순 고친 내용 저장` : `${todays.length + 1}순 저장`} · ${hitCount}중` : `5시를 모두 입력하세요 (${filled}/5)`}
        </button>
        {editing && <button className="btn ghost" onClick={cancelEdit}>고치지 않고 돌아가기</button>}
      </section>

      <button className="gear" onClick={() => setPicking(true)}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="label">오늘 장비</div>
          <div className="names">
            {noGear ? '장비 탭에서 활을 추가하면 장비별 분석을 볼 수 있습니다' : `${gearName(settings.current.bow)} · ${gearName(settings.current.ring)} · ${gearName(settings.current.arrow)}${settings.current.string ? ` · ${gearName(settings.current.string)}` : ''}`}
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
      <button className="gear" onClick={() => setWeathering(true)}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="label">오늘 날씨 <span className="opt">선택</span></div>
          <div className={`names ${store.todayWeather ? '' : 'muted-names'}`}>{weatherLabel(store.todayWeather) || '날씨·기온·바람을 남기면 날씨별로 비교할 수 있습니다'}</div>
        </div>
        <span className="change">{store.todayWeather ? '바꾸기' : '입력'}</span>
      </button>

      <section className="card">
        <div className="row between">
          <h2>오늘 기록</h2>
          <span className="num"><b>{todays.length}순 {todayHits}중</b>{todays.length > 0 && <span className="muted small"> 순당 {(todayHits / todays.length).toFixed(1)}중</span>}</span>
        </div>
        {todays.length === 0
          ? <div className="empty">첫 순을 저장하면 여기에 쌓입니다.</div>
          : <>
            <div className="today-list">{todays.map((e, i) => (
              <EndLine key={e.id} end={e} index={i} selected={e.id === store.editId}
                onSelect={() => { store.setEditId(e.id === store.editId ? null : e.id); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />
            )).reverse()}</div>
            <div className="row between">
              <span className="small muted">저장한 순을 누르면 위 입력 칸에 불러와 고칠 수 있습니다.</span>
              <button className="btn ghost small danger-text" onClick={() => setResetting(true)}>오늘 기록 초기화</button>
            </div>
          </>}
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
          {([['bow', '활'], ['ring', '깍지'], ['arrow', '화살'], ['string', '현']] as [GearCategory, string][]).map(([c, name]) => (
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
          <button className="btn" onClick={() => setPicking(false)}>완료</button>
        </Sheet>
      )}
    </>
  );
}
