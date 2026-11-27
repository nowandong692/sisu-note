import { dayOffset, today } from '../domain/util';

/** 기간: 최근 N일, 또는 시작일~종료일을 직접 지정 */
export type Period = { days: number } | { from: string; to: string };

const PRESETS: [number, string][] = [[30, '최근 30일'], [90, '최근 90일']];
const isYmd = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

/** 기간 안의 날짜인지 고르는 범위. 끝은 포함한다 */
// eslint-disable-next-line react-refresh/only-export-components
export function periodBounds(p: Period): { from: string; to: string } {
  if ('days' in p) return { from: dayOffset(-p.days), to: '9999' };
  return { from: p.from, to: p.to };
}

const short = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return `${y === new Date().getFullYear() ? '' : `${y}년 `}${m}월 ${d}일`;
};
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000) + 1;

/** 최근 30일 / 90일 / 기간 지정 칩. 기간 지정을 고르면 시작일·종료일 칸이 열린다 */
export function PeriodPicker({ value, onChange, idPrefix }: { value: Period; onChange: (p: Period) => void; idPrefix: string }) {
  const custom = 'from' in value;
  const openCustom = () => {
    if (custom) return;
    // 처음에는 1년 전 오늘부터 오늘까지
    const t = today();
    onChange({ from: `${Number(t.slice(0, 4)) - 1}${t.slice(4)}`.replace(/-02-29$/, '-02-28'), to: t });
  };
  // 시작일이 종료일을 넘으면 다른 쪽을 같이 옮겨 늘 시작일 ≤ 종료일
  const setFrom = (from: string) => custom && isYmd(from) && onChange({ from, to: from > value.to ? from : value.to });
  const setTo = (to: string) => custom && isYmd(to) && onChange({ from: to < value.from ? to : value.from, to });
  return (
    <div className="period">
      <div className="chips">
        {PRESETS.map(([p, l]) => <button key={p} className={`chip ${!custom && value.days === p ? 'on' : ''}`} aria-pressed={!custom && value.days === p} onClick={() => onChange({ days: p })}>{l}</button>)}
        <button className={`chip ${custom ? 'on' : ''}`} aria-pressed={custom} onClick={openCustom}>기간 지정</button>
      </div>
      {custom && (
        <div className="period-range">
          <div className="period-dates">
            <input id={`${idPrefix}-from`} type="date" aria-label="시작일" value={value.from} max={today()} onChange={(e) => setFrom(e.target.value)} />
            <span className="muted">~</span>
            <input id={`${idPrefix}-to`} type="date" aria-label="종료일" value={value.to} max={today()} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="small muted">{short(value.from)} ~ {short(value.to)} · {daysBetween(value.from, value.to)}일</div>
        </div>
      )}
    </div>
  );
}
