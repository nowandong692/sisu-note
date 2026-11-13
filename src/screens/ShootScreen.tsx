import { useState } from 'react';
import { ShotIcon } from '../components/ShotIcon';
import { Target, type Mark } from '../components/Target';
import { Sheet, toast } from '../components/ui';
import { classifyTap, directionFor, hitShot, shotLabel } from '../domain/target';
import { hitsOf } from '../domain/stats';
import type { End, GearCategory, Shot } from '../domain/types';
import { MEMO_TAGS, SHOTS_PER_END } from '../domain/types';
import { today } from '../domain/util';
import { useStore } from '../state/store';

interface Draft {
  shots: (Shot | null)[];
  active: number;
  tags: string[];
  memo: string;
}
const emptyDraft = (): Draft => ({ shots: Array(SHOTS_PER_END).fill(null), active: 0, tags: [], memo: '' });

export function EndLine({ end, index, children, selected, onSelect }: { end: End; index: number; children?: React.ReactNode; selected?: boolean; onSelect?: () => void }) {
  const { gearName } = useStore();
  const h = hitsOf(end);
  return (
    <div className={`end-line ${onSelect ? 'selectable' : ''} ${selected ? 'selected' : ''}`}
      {...(onSelect ? { role: 'button', tabIndex: 0, 'aria-pressed': !!selected, onClick: onSelect, onKeyDown: (ev: React.KeyboardEvent) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onSelect(); } } } : {})}>
      <span className="idx">{index + 1}순</span>
      <span className="dots">{end.shots.map((s, i) => <ShotIcon key={i} shot={s} index={i} />)}</span>
      <span className="cnt">{h}중{h === 5 && <span className="pill best">몰기</span>}</span>
      <span className="meta">{gearName(end.bowId)} · {gearName(end.ringId)}{end.tags.length ? ' · #' + end.tags.join(' #') : ''}</span>
      {children && <span onClick={(ev) => ev.stopPropagation()}>{children}</span>}
    </div>
  );
}

export function ShootScreen() {
  const store = useStore();
  const { settings, ends, gearName, gearOf } = store;
  const [d, setD] = useState<Draft>(emptyDraft);
  const [picking, setPicking] = useState(false);

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

  const save = async () => {
    if (filled < SHOTS_PER_END) return;
    const e = await store.saveEnd({ shots: d.shots as Shot[], tags: d.tags, memo: d.memo.trim() });
    const h = hitsOf(e);
    toast(`${todays.length + 1}순 저장 · ${h}중${h === 5 ? ' 몰기!' : ''}`);
    setD(emptyDraft());
    setAsking(false);
  };

  const marks: Mark[] = d.shots.flatMap((s, i) => (s ? [{ x: s.x, y: s.y, hit: s.hit, n: i + 1 }] : []));
  const noGear = !gearOf('bow').length;

  return (
    <>
      <section className="card">
        <div className="end-head">
          <span className="title">{todays.length + 1}순</span>
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
            <button className="btn ghost small" disabled={!filled} onClick={() => setD(emptyDraft())}>다시 입력</button>
          </span>
          <button className="btn small" disabled={filled < SHOTS_PER_END} onClick={save}>{filled === SHOTS_PER_END ? `저장 · ${hitCount}중` : `저장 (${filled}/5)`}</button>
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
          <textarea id="memo" rows={2} placeholder="예: 만작을 길게 가져가니 좋았음" value={d.memo} onChange={(e) => setD({ ...d, memo: e.target.value })} />
        </div>
        <button className="btn" disabled={filled < SHOTS_PER_END} onClick={save}>
          {filled === SHOTS_PER_END ? `${todays.length + 1}순 저장 · ${hitCount}중` : `5시를 모두 입력하세요 (${filled}/5)`}
        </button>
      </section>

      <button className="gear" onClick={() => setPicking(true)}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="label">오늘 장비</div>
          <div className="names">
            {noGear ? '장비 탭에서 활을 추가하면 장비별 분석을 볼 수 있습니다' : `${gearName(settings.current.bow)} · ${gearName(settings.current.ring)} · ${gearName(settings.current.arrow)}`}
          </div>
        </div>
        <span className="change">바꾸기</span>
      </button>

      <section className="card">
        <div className="row between">
          <h2>오늘 기록</h2>
          <span className="num"><b>{todays.length}순 {todayHits}중</b>{todays.length > 0 && <span className="muted small"> 순당 {(todayHits / todays.length).toFixed(1)}중</span>}</span>
        </div>
        {todays.length === 0
          ? <div className="empty">첫 순을 저장하면 여기에 쌓입니다.</div>
          : <div className="today-list">{todays.map((e, i) => <EndLine key={e.id} end={e} index={i} />).reverse()}</div>}
      </section>

      {asking && (
        <Sheet title={`${todays.length + 1}순 저장할까요?`} onClose={() => setAsking(false)}>
          <div className="confirm-end">
            <span className="dots">{(d.shots as Shot[]).map((s, i) => <ShotIcon key={i} shot={s} index={i} />)}</span>
            <b>{hitCount}중{hitCount === 5 ? ' · 몰기' : ''}</b>
          </div>
          <div className="small muted">{d.shots.map((s, i) => `${i + 1}시 ${shotLabel(s, settings.grid)}`).join(', ')}</div>
          <button className="btn" onClick={save}>저장</button>
          <div className="row between">
            <button className="btn ghost small" onClick={() => { setAsking(false); setTimeout(() => document.getElementById('memo')?.focus(), 50); }}>메모 쓰고 저장</button>
            <button className="btn ghost small" onClick={() => setAsking(false)}>고치기</button>
          </div>
        </Sheet>
      )}
      {picking && (
        <Sheet title="오늘 장비" onClose={() => setPicking(false)}>
          <div className="small muted">고른 장비는 다음 순부터 적용됩니다.</div>
          {([['bow', '활'], ['ring', '깍지'], ['arrow', '화살']] as [GearCategory, string][]).map(([c, name]) => (
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
