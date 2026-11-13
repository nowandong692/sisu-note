import { useState } from 'react';
import { Target } from '../components/Target';
import { ConfirmButton, toast } from '../components/ui';
import { hitsOf } from '../domain/stats';
import { shotLabel } from '../domain/target';
import { formatDate } from '../domain/util';
import type { End, Hand } from '../domain/types';
import { useStore } from '../state/store';
import { EndLine } from './ShootScreen';

/** 그날 쏜 화살을 과녁 하나에 모두 찍는다 */
function DayTarget({ ends, hand }: { ends: End[]; hand: Hand }) {
  const shots = ends.flatMap((e) => e.shots);
  const unplaced = shots.filter((s) => s.hit && s.x == null).length;
  const hasZones = shots.some((s) => s.zone != null);
  return (
    <div className="day-target">
      <Target hand={hand} grid={hasZones} small dotRadius={5} marks={shots} label="그날의 탄착" />
      <div className="small muted">
        파란 점은 관중, 회색 점은 불입니다.{unplaced > 0 && ` 위치 없이 기록한 관중 ${unplaced}시는 점으로 표시하지 않습니다.`}
      </div>
    </div>
  );
}

export function LogScreen() {
  const { ends, gearName, deleteEnd, settings } = useStore();
  const [open, setOpen] = useState<Record<string, boolean>>({});

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
                <DayTarget ends={list} hand={settings.hand} />
                {list.map((e, i) => {
                  const misses = e.shots.flatMap((s, k) => (s.hit ? [] : [`${k + 1}시 ${shotLabel(s, settings.grid)}`]));
                  return (
                    <div key={e.id}>
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
