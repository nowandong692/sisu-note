import { useState } from 'react';
import { Target, type Mark } from '../components/Target';
import { ConfirmButton, toast } from '../components/ui';
import { hitsOf } from '../domain/stats';
import { weatherLabel } from '../domain/weather';
import { shotLabel } from '../domain/target';
import { formatDate } from '../domain/util';
import type { End, Hand } from '../domain/types';
import { useStore } from '../state/store';
import { EndLine } from './ShootScreen';

/**
 * 그날 쏜 화살을 과녁 하나에 모두 찍는다.
 * 순을 고르면 그 순의 화살만, 시를 고르면 그 시의 화살만 번호와 함께 강조한다 (둘 다 고르면 그 한 발).
 */
function DayTarget({ ends, hand, selEnd, selShot, onShot }: { ends: End[]; hand: Hand; selEnd: string | null; selShot: number | null; onShot: (i: number | null) => void }) {
  const filtering = selEnd != null || selShot != null;
  const endIdx = ends.findIndex((e) => e.id === selEnd);
  const marks: Mark[] = ends.flatMap((e, ei) => e.shots.map((s, si) => {
    const on = (selEnd == null || e.id === selEnd) && (selShot == null || si === selShot);
    return { x: s.x, y: s.y, hit: s.hit, big: filtering && on, dim: filtering && !on, n: selEnd != null ? si + 1 : ei + 1 };
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
      <Target hand={hand} grid={hasZones} small dotRadius={5} marks={marks} label="그날의 탄착" />
      <div className="small muted">
        {filtering
          ? `${what}: ${chosen.length}발 중 ${hits}중. 원 안 숫자는 ${selEnd != null ? '몇 번째 시' : '몇 번째 순'}인지입니다.`
          : '파란 점은 관중, 회색 점은 불입니다. 아래에서 순을 누르면 그 순의 화살만 강조됩니다.'}
        {unplaced > 0 && ` 위치 없이 기록한 관중 ${unplaced}시는 과녁에 표시하지 않습니다.`}
      </div>
    </div>
  );
}

export function LogScreen() {
  const { ends, gearName, deleteEnd, settings } = useStore();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [selEnd, setSelEnd] = useState<string | null>(null);
  const [selShot, setSelShot] = useState<number | null>(null);
  /** 순 한 덩어리(첫 줄, 불 방향, 메모) 어디를 눌러도 그 순을 고른다 */
  const toggle = (id: string) => setSelEnd((cur) => (cur === id ? null : id));

  const byDate = new Map<string, typeof ends>();
  for (const e of ends) byDate.set(e.date, [...(byDate.get(e.date) ?? []), e]);
  const dates = [...byDate.keys()].sort().reverse();

  if (!dates.length) {
    return <section className="card"><div className="empty">아직 기록이 없습니다. 습사 탭에서 첫 순을 저장해 보세요.</div></section>;
  }

  return (
    <section className="card">
      {dates.map((date) => {
        const list = byDate.get(date)!.sort((a, b) => a.recordedAt - b.recordedAt);
        const h = list.reduce((a, e) => a + hitsOf(e), 0);
        const bows = [...new Set(list.map((e) => gearName(e.bowId)))].join(', ');
        const isOpen = !!open[date];
        return (
          <div className="session" key={date}>
            <button aria-expanded={isOpen} onClick={() => setOpen({ ...open, [date]: !isOpen })}>
              <span><span className="d">{formatDate(date)}</span> <span className="muted small">{bows}</span></span>
              <span className="s">{list.length}순 {h}중 · {Math.round((h / (list.length * 5)) * 100)}%</span>
            </button>
            {isOpen && (
              <div className="detail">
                {(() => {
                  const ws = [...new Set(list.map((e) => weatherLabel(e.weather)).filter(Boolean))];
                  return ws.length > 0 && <div className="weather-line">날씨 {ws.join(' → ')}</div>;
                })()}
                <DayTarget ends={list} hand={settings.hand} selEnd={list.some((e) => e.id === selEnd) ? selEnd : null} selShot={selShot} onShot={setSelShot} />
                {list.map((e, i) => {
                  const misses = e.shots.flatMap((s, k) => (s.hit ? [] : [`${k + 1}시 ${shotLabel(s, settings.grid)}`]));
                  return (
                    <div key={e.id} className={`end-block ${selEnd === e.id ? 'selected' : ''}`} role="button" tabIndex={0} aria-pressed={selEnd === e.id}
                      onClick={() => toggle(e.id)} onKeyDown={(ev) => { if (ev.target === ev.currentTarget && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); toggle(e.id); } }}>
                      <EndLine end={e} index={i}>
                        <ConfirmButton label="삭제" confirmLabel="삭제 확인" onConfirm={() => deleteEnd(e.id).then(() => toast('순을 삭제했습니다'))} />
                      </EndLine>
                      {misses.length > 0 && <div className="memo">{misses.join(', ')}</div>}
                      {e.memo && <div className="memo">{e.memo}</div>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
