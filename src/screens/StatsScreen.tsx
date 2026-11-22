import { useState } from 'react';
import { Target } from '../components/Target';
import {
  MIN_ENDS_FOR_RANKING, byRange, byWeather, byWindDir, weatherLean, monthlyStats, byBowAndRing, byGear, hitDistribution, missBreakdown, shotPositionRates, summarize, trendSeries, zoneCounts,
  type GroupRow, type TrendPoint, type TrendUnit, type WeatherLeanRow,
} from '../domain/stats';
import { MISS_DIRECTIONS, type End, type Hand, type MissDirection } from '../domain/types';
import { BAND, TH, TW, TX, TY, VIEW_H, VIEW_W, VIEW_X, VIEW_Y } from '../domain/target';
import { dayOffset } from '../domain/util';
import { useStore } from '../state/store';
import { formatDuration, totalMinutes } from '../domain/session';

const PERIODS: [number, string][] = [[30, '최근 30일'], [90, '최근 90일'], [0, '전체']];

const UNITS: [TrendUnit, string][] = [['day', '날짜별'], ['week', '주별'], ['month', '월별']];
type Metric = 'perEnd' | 'perfect' | 'ends';
const METRICS: [Metric, string][] = [['perEnd', '순당 평균'], ['perfect', '몰기'], ['ends', '순 수']];
const UNIT_WORD: Record<TrendUnit, string> = { day: '날', week: '주', month: '달' };
const WEEKDAY = '일월화수목금토';

function pointLabel(key: string, unit: TrendUnit, short = false): string {
  const [y, m, d] = key.split('-').map(Number);
  if (unit === 'month') return short ? `${m}월` : `${String(y).slice(2)}년 ${m}월`;
  if (short) return `${m}/${d}`;
  if (unit === 'week') return `${m}/${d} 주`;
  return `${m}/${d} (${WEEKDAY[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]})`;
}

/** 위 4칸 아래 정도로 짧게 보는 값 축 눈금 (0 포함, 4~5칸) */
function niceTicks(max: number): number[] {
  const step = [1, 2, 5, 10, 20, 50, 100, 200, 500].find((s) => max / s <= 4) ?? 1000;
  const top = Math.max(step, Math.ceil(max / step) * step);
  return Array.from({ length: top / step + 1 }, (_, i) => i * step);
}

/** 추이 그래프. 단위(날짜·주·달)와 볼 값(순당 평균·몰기·순 수)을 고른다. 점을 누르면 그때 기록을 보여 준다 */
function TrendCard({ ends }: { ends: End[] }) {
  const [unit, setUnit] = useState<TrendUnit>('week');
  const [metric, setMetric] = useState<Metric>('perEnd');
  const [sel, setSel] = useState<number | null>(null);
  const data = trendSeries(ends, unit);
  const pick = <T,>(set: (v: T) => void) => (v: T) => { set(v); setSel(null); };

  const head = (
    <>
      <div className="row between">
        <h2>추이</h2>
        <div className="seg" role="group" aria-label="추이 단위">
          {UNITS.map(([u, l]) => <button key={u} className={unit === u ? 'on' : ''} aria-pressed={unit === u} onClick={() => pick(setUnit)(u)}>{l}</button>)}
        </div>
      </div>
      <div className="chips">
        {METRICS.map(([k, l]) => <button key={k} className={`chip ${metric === k ? 'on' : ''}`} onClick={() => pick(setMetric)(k)}>{l}</button>)}
      </div>
    </>
  );
  if (data.length < 2) {
    return <section className="card">{head}<div className="empty small">{UNIT_WORD[unit]}별 추이는 습사한 {UNIT_WORD[unit]}이 둘 이상이면 보입니다.{unit !== 'day' && ' 위에서 기간을 늘려 보세요.'}</div></section>;
  }

  const W = 320, H = 160, L = 28, R = 12, T = 14, B = 24;
  const n = data.length;
  const slot = (W - L - R) / n;
  const line = metric === 'perEnd';
  // 선은 처음과 끝 점을 양 끝에, 막대는 칸 가운데에 둔다
  const x = (i: number) => (line ? L + ((W - L - R) * i) / (n - 1) : L + slot * (i + 0.5));
  const value = (p: TrendPoint) => (metric === 'perEnd' ? p.perEnd : metric === 'perfect' ? p.perfect : p.ends);
  const ticks = line ? [0, 1, 2, 3, 4, 5] : niceTicks(Math.max(...data.map(value), 1));
  const top = ticks[ticks.length - 1];
  const y = (v: number) => T + (H - T - B) * (1 - v / top);
  const at = sel ?? n - 1;
  const cur = data[at];
  const step = Math.max(1, Math.ceil(n / 5));
  const dotted = unit === 'day';
  const smooth = data.map((p, i) => `${x(i)},${y(p.smooth)}`).join(' ');
  const raw = data.map((p, i) => `${x(i)},${y(p.perEnd)}`).join(' ');

  return (
    <section className="card">
      {head}
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`${UNIT_WORD[unit]}별 ${METRICS.find(([k]) => k === metric)![1]} 추이`} style={{ touchAction: 'pan-y' }}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} style={{ stroke: 'var(--line)' }} />
            <text x={L - 6} y={y(v) + 4} textAnchor="end" fontSize={10} style={{ fill: 'var(--muted)' }}>{v}</text>
          </g>
        ))}
        <line x1={x(at)} x2={x(at)} y1={T} y2={H - B} style={{ stroke: 'var(--muted)' }} strokeDasharray="2 3" />
        {line ? (
          <>
            {dotted ? (
              <>
                {data.map((p, i) => <circle key={p.key} cx={x(i)} cy={y(p.perEnd)} r={2.2} style={{ fill: 'var(--hong)' }} fillOpacity={0.3} />)}
                <polyline points={smooth} fill="none" style={{ stroke: 'var(--hong)' }} strokeWidth={2} strokeLinejoin="round" />
              </>
            ) : (
              <>
                <path d={`M${x(0)} ${y(0)} L${raw.replace(/ /g, ' L')} L${x(n - 1)} ${y(0)}Z`} style={{ fill: 'var(--hong)' }} fillOpacity={0.08} />
                <polyline points={raw} fill="none" style={{ stroke: 'var(--hong)' }} strokeWidth={2} strokeLinejoin="round" />
                {data.map((p, i) => <circle key={p.key} cx={x(i)} cy={y(p.perEnd)} r={2.5} style={{ fill: 'var(--surface)', stroke: 'var(--hong)' }} strokeWidth={1.5} />)}
              </>
            )}
            <circle cx={x(at)} cy={y(dotted ? cur.smooth : cur.perEnd)} r={4.5} style={{ fill: 'var(--hong)', stroke: 'var(--surface)' }} strokeWidth={1.5} />
          </>
        ) : (
          data.map((p, i) => {
            const w = Math.max(1.5, Math.min(18, slot * 0.7));
            return <rect key={p.key} x={x(i) - w / 2} y={y(value(p))} width={w} height={y(0) - y(value(p))} rx={Math.min(2, w / 3)}
              style={{ fill: i === at ? 'var(--hong)' : 'var(--ink)' }} fillOpacity={i === at ? 1 : 0.35} />;
          })
        )}
        {data.map((p, i) => {
          if (i % step && i !== n - 1) return null;
          if (i !== n - 1 && n - 1 - i < step / 2) return null; // 마지막 이름과 겹치지 않게
          return <text key={p.key} x={x(i)} y={H - 7} textAnchor={line && i === 0 ? 'start' : line && i === n - 1 ? 'end' : 'middle'} fontSize={10} style={{ fill: 'var(--muted)' }}>{pointLabel(p.key, unit, true)}</text>;
        })}
        {data.map((p, i) => (
          <rect key={p.key} x={x(i) - slot / 2} y={0} width={slot} height={H} fill="transparent" onClick={() => setSel(i)} style={{ cursor: 'pointer' }} />
        ))}
      </svg>
      <div className="trend-pick">
        <b>{pointLabel(cur.key, unit)}</b>
        <span>{cur.ends}순{unit !== 'day' && ` · ${cur.days}일`} · 순당 {cur.perEnd.toFixed(1)} · 중률 {Math.round(cur.rate * 100)}% · 몰기 {cur.perfect}</span>
      </div>
      <div className="small muted">
        {line && dotted ? '흐린 점은 날마다의 순당 평균, 선은 최근 5번 습사한 날을 묶은 흐름입니다. ' : ''}
        점이나 막대를 누르면 그때 기록을 봅니다. 위의 기간·활·활터 선택을 따릅니다.
      </div>
    </section>
  );
}

/** 월별 표. 위쪽 기간 선택과 상관없이 전체 기록으로 계산한다 (활 선택은 따른다). */
function MonthlyCard({ rows }: { rows: ReturnType<typeof monthlyStats> }) {
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, 12);
  const best = Math.max(...rows.filter((r) => r.ends >= 10).map((r) => r.perEnd), 0);
  return (
    <section className="card">
      <div className="row between"><h2>월별 통계</h2><span className="small muted">전체 기간</span></div>
      <div className="scroll-x">
        <table className="monthly">
          <thead><tr><th>월</th><th>습사일</th><th>순</th><th>순당</th><th>중률</th><th>몰기</th></tr></thead>
          <tbody>
            {shown.map((r) => {
              const [y, m] = r.month.split('-').map(Number);
              return (
                <tr key={r.month}>
                  <td>{String(y).slice(2)}년 {m}월{best > 0 && r.perEnd === best && <span className="pill best">최고</span>}</td>
                  <td>{r.days}일</td>
                  <td>{r.ends}</td>
                  <td>{r.perEnd.toFixed(2)}</td>
                  <td>{Math.round(r.rate * 100)}%</td>
                  <td>{r.perfect}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length > 12 && <button className="btn ghost small" style={{ alignSelf: 'center' }} onClick={() => setAll(!all)}>{all ? '최근 12개월만' : `전체 ${rows.length}개월 보기`}</button>}
    </section>
  );
}

function GroupTable({ rows, label, name, compact }: { rows: GroupRow[]; label: string; name: (key: string) => string; compact?: boolean }) {
  const ranked = rows.filter((r) => r.enough);
  return (
    <div className="scroll-x">
      <table>
        <thead>
          <tr><th>{label}</th><th>순</th><th>순당</th>{!compact && <><th>중률</th><th>몰기</th></>}</tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className={r.enough ? '' : 'thin'}>
              <td>
                {name(r.key)}
                {!r.enough ? <span className="pill">기록 더 필요</span> : ranked.length > 1 && ranked[0].key === r.key && !compact ? <span className="pill best">최고</span> : null}
              </td>
              <td>{r.ends}</td>
              <td>{r.perEnd.toFixed(2)}</td>
              {!compact && <><td>{Math.round(r.rate * 100)}%</td><td>{r.perfect}</td></>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const LEAN_KEYS: ['sky' | 'temp' | 'wind', string][] = [['sky', '날씨'], ['temp', '기온'], ['wind', '바람']];
const SHORT: Record<MissDirection, string> = { 앞남: '앞', 뒤남: '뒤', 넘음: '넘', 짧음: '짧' };

/** 작은 과녁 위에 불의 평균 방향을 화살표 하나로. 길수록 그쪽으로 많이 치우친 것 */
function LeanTarget({ row, hand }: { row: WeatherLeanRow; hand: Hand }) {
  const cx = TX + TW / 2, cy = TY + TH / 2;
  // 앞남은 줌손 쪽: 우궁이면 오른쪽, 좌궁이면 왼쪽
  const dx = row.front * (hand === 'right' ? 1 : -1);
  const dy = -row.over;
  const len = Math.hypot(dx, dy);
  const R = TW / 2 + 2 * BAND;
  const ex = cx + dx * R, ey = cy + dy * R;
  const ux = len ? dx / len : 0, uy = len ? dy / len : 0;
  const head = 18;
  const side = directionSide(hand);
  const pct = (d: MissDirection) => Math.round((row.count[d] / (row.total || 1)) * 100);
  const most = Math.max(...MISS_DIRECTIONS.map((d) => row.count[d]));
  return (
    <div className={`lean ${row.enough ? '' : 'thin'}`}>
      <div className="lean-name">{row.key}</div>
      <svg viewBox={`${VIEW_X} ${VIEW_Y} ${VIEW_W} ${VIEW_H}`} width="100%" role="img"
        aria-label={row.total ? `${row.key}: 불 ${row.total}시, ${MISS_DIRECTIONS.map((d) => `${d} ${pct(d)}%`).join(', ')}` : `${row.key}: 방향을 남긴 불 없음`}>
        <rect x={TX - 2 * BAND} y={TY - 2 * BAND} width={TW + 4 * BAND} height={TH + 4 * BAND} rx={16} style={{ fill: 'var(--band2)' }} />
        <rect x={TX - BAND} y={TY - BAND} width={TW + 2 * BAND} height={TH + 2 * BAND} rx={10} style={{ fill: 'var(--band1)' }} />
        <rect x={TX} y={TY} width={TW} height={TH} style={{ fill: 'var(--surface)', stroke: 'var(--line)' }} strokeWidth={3} />
        <g fontSize={30} fontWeight={700} textAnchor="middle" style={{ fill: 'var(--muted)' }} opacity={0.7}>
          <text x={cx} y={TY - 1.25 * BAND}>넘</text>
          <text x={cx} y={TY + TH + 1.65 * BAND}>짧</text>
          <text x={TX - BAND} y={cy + 10}>{side.left}</text>
          <text x={TX + TW + BAND} y={cy + 10}>{side.right}</text>
        </g>
        {row.total > 0 && len >= 0.08 && (
          <g style={{ stroke: 'var(--hong)', fill: 'var(--hong)' }} strokeWidth={10} strokeLinecap="round" strokeLinejoin="round">
            <line x1={cx} y1={cy} x2={ex - ux * head * 0.6} y2={ey - uy * head * 0.6} />
            <polygon points={`${ex},${ey} ${ex - ux * head - uy * head * 0.7},${ey - uy * head + ux * head * 0.7} ${ex - ux * head + uy * head * 0.7},${ey - uy * head - ux * head * 0.7}`} strokeWidth={4} />
          </g>
        )}
        {row.total > 0 && <circle cx={cx} cy={cy} r={9} style={{ fill: 'var(--hong)' }} />}
        {row.total > 0 && len < 0.08 && <text x={cx} y={cy + 42} textAnchor="middle" fontSize={26} fontWeight={700} style={{ fill: 'var(--muted)' }}>고름</text>}
      </svg>
      {row.total > 0 ? (
        <div className="lean-pct">
          {(['앞남', '뒤남', '넘음', '짧음'] as MissDirection[]).map((d) => (
            <span key={d} className={most > 0 && row.count[d] === most ? 'top' : ''}>{SHORT[d]} {pct(d)}</span>
          ))}
        </div>
      ) : <div className="lean-pct empty-pct">불 기록 없음</div>}
      <div className="lean-n">{row.ends}순 · 불 {row.total}시</div>
    </div>
  );
}

/** 과녁 왼쪽·오른쪽에 쓸 글자 (앞·뒤) */
function directionSide(hand: Hand) {
  return hand === 'right' ? { left: '뒤', right: '앞' } : { left: '앞', right: '뒤' };
}

/** 날씨·기온·바람 세기마다 불이 어느 쪽으로 치우쳤는지 작은 과녁을 나란히 */
function WeatherLeanCard({ ends, hand }: { ends: End[]; hand: Hand }) {
  const options = LEAN_KEYS.map(([k, l]) => [k, l, weatherLean(ends, k)] as const).filter(([, , rows]) => rows.length > 0);
  const [key, setKey] = useState<'sky' | 'temp' | 'wind'>('sky');
  if (!options.length) return null;
  const cur = options.find(([k]) => k === key) ?? options[0];
  const rows = cur[2];
  return (
    <section className="card">
      <div className="row between">
        <h2>날씨별 불 치우침</h2>
        {options.length > 1 && (
          <div className="seg" role="group" aria-label="날씨 항목">
            {options.map(([k, l]) => <button key={k} className={cur[0] === k ? 'on' : ''} aria-pressed={cur[0] === k} onClick={() => setKey(k)}>{l}</button>)}
          </div>
        )}
      </div>
      <div className="lean-grid">
        {rows.map((r) => <LeanTarget key={r.key} row={r} hand={hand} />)}
      </div>
      <div className="small muted">화살표는 불이 난 평균 방향입니다. 길수록 그쪽으로 많이 치우쳤고, 가운데 점만 있으면 고르게 났습니다. 숫자는 방향을 남긴 불 가운데 비율(%)이고, 가장 많은 쪽을 빨갛게 표시합니다. {MIN_ENDS_FOR_RANKING}순 미만은 흐리게 표시합니다.</div>
    </section>
  );
}

export function StatsScreen() {
  const { ends: allEnds, gear, gearName, settings, rangeName, ranges } = useStore();
  const [period, setPeriod] = useState(30);
  const [bow, setBow] = useState('all');
  /** 'all' 모든 활터, 'none' 활터를 남기지 않은 순, 그 밖에는 활터 id */
  const [range, setRange] = useState('all');

  const cutoff = period ? dayOffset(-period) : '0000';
  const pick = (e: (typeof allEnds)[number]) => (bow === 'all' || e.bowId === bow)
    && (range === 'all' || (range === 'none' ? !e.rangeId : e.rangeId === range));
  const ends = allEnds.filter((e) => e.date >= cutoff && pick(e));
  const usedRanges = ranges.filter((r) => allEnds.some((e) => e.rangeId === r.id));

  const head = (
    <>
      <div className="chips">
        {PERIODS.map(([p, l]) => <button key={p} className={`chip ${period === p ? 'on' : ''}`} onClick={() => setPeriod(p)}>{l}</button>)}
      </div>
      <div className="filters">
        <div className="field">
          <label htmlFor="bowFilter">활 선택</label>
          <select id="bowFilter" value={bow} onChange={(e) => setBow(e.target.value)}>
            <option value="all">모든 활</option>
            {gear.filter((g) => g.category === 'bow').map((g) => <option key={g.id} value={g.id}>{g.nickname}{g.archived ? ' (보관)' : ''}</option>)}
          </select>
        </div>
        {usedRanges.length > 0 && (
          <div className="field">
            <label htmlFor="rangeFilter">활터 선택</label>
            <select id="rangeFilter" value={range} onChange={(e) => setRange(e.target.value)}>
              <option value="all">모든 활터</option>
              {usedRanges.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              {allEnds.some((e) => !e.rangeId) && <option value="none">활터 미지정</option>}
            </select>
          </div>
        )}
      </div>
    </>
  );
  if (!ends.length) return <>{head}<section className="card"><div className="empty">이 기간에 기록이 없습니다.</div></section></>;

  const s = summarize(ends);
  const dist = hitDistribution(ends);
  const maxD = Math.max(...dist) || 1;
  const pos = shotPositionRates(ends);
  const weakest = pos.indexOf(Math.min(...pos));
  const miss = missBreakdown(ends);
  const shots = ends.flatMap((e) => e.shots);
  const unplacedHits = shots.filter((x) => x.hit && x.x == null).length;
  const zones = zoneCounts(ends);
  const hasZones = zones.some((z) => z > 0);
  const name = (k: string) => gearName(k || null);
  const windRows = byWindDir(ends);
  const weatherGroups = ([['sky', '날씨'], ['temp', '기온'], ['wind', '바람']] as const)
    .map(([k, label]) => [label, byWeather(ends, k)] as const).filter(([, rows]) => rows.length > 0);

  return (
    <>
      {head}
      <section className="card">
        <div className="tiles">
          <div className="tile"><b>{s.ends}</b><span>순</span></div>
          <div className="tile"><b>{s.perEnd.toFixed(1)}</b><span>순당 평균</span></div>
          <div className="tile"><b>{Math.round(s.rate * 100)}%</b><span>중률</span></div>
          <div className="tile"><b>{s.perfect}</b><span>몰기</span></div>
        </div>
        {(() => {
          const t = totalMinutes(ends);
          return t.minutes > 0 && (
            <div className="small muted">습사 {t.days}일 · 습사 시간 {formatDuration(t.minutes)} · 하루 평균 {formatDuration(Math.round(t.minutes / t.timedDays))} (그날 첫 순부터 마지막 순까지)</div>
          );
        })()}
      </section>
      <TrendCard ends={ends} />
      <MonthlyCard rows={monthlyStats(allEnds.filter(pick))} />
      <section className="card">
        <h2>순별 중 수 분포</h2>
        <div className="cols">
          {dist.map((c, i) => (
            <div className="col" key={i}>
              <span className="n">{c}</span>
              <div className={`c ${i === 5 ? 'five' : ''}`} style={{ height: Math.round((c / maxD) * 70) }} />
              <span>{i}중</span>
            </div>
          ))}
        </div>
      </section>
      <section className="card">
        <div className="row between"><h2>시 위치별 중률</h2><span className="small muted">{weakest + 1}시가 가장 약함</span></div>
        <div className="bars">
          {pos.map((p, i) => (
            <div className="bar" key={i}>
              <span>{i + 1}시</span>
              <div className="track"><div className={`fill ${i === weakest ? '' : 'ink'}`} style={{ width: `${Math.round(p * 100)}%` }} /></div>
              <span className="v">{Math.round(p * 100)}%</span>
            </div>
          ))}
        </div>
      </section>
      <section className="card">
        <h2>탄착 분포</h2>
        <div className="target-wrap">
          <Target hand={settings.hand} grid={hasZones} small marks={shots} zoneCounts={hasZones ? zones : null} />
        </div>
        <div className="small muted">
          파란 점은 관중, 회색 점은 불입니다.{hasZones && ' 과녁 칸의 숫자는 칸 위치를 남긴 관중 중 그 칸에 맞은 비율입니다.'}
          {unplacedHits > 0 && ` 위치 없이 기록한 관중 ${unplacedHits}시는 점으로 표시하지 않습니다.`}
        </div>
      </section>
      {miss.total > 0 && (
        <section className="card">
          <h2>불 방향</h2>
          <div className="bars">
            {MISS_DIRECTIONS.map((d) => {
              const a = miss.byDir[d][1], b = miss.byDir[d][2], pct = Math.round(((a + b) / miss.total) * 100);
              return (
                <div key={d}>
                  <div className="bar">
                    <span>{d}</span>
                    <div className="track"><div className="split" style={{ width: `${pct}%` }}><div className="l1" style={{ flex: a }} /><div className="l2" style={{ flex: b }} /></div></div>
                    <span className="v">{pct}%</span>
                  </div>
                  <div className="small muted" style={{ paddingLeft: 56 }}>조금 {a} · 많이 {b}</div>
                </div>
              );
            })}
          </div>
          <div className="small muted">불 {miss.total}시 기준. 연한 막대는 조금, 진한 막대는 많이 빠진 것입니다.</div>
        </section>
      )}
      {weatherGroups.length > 0 && (
        <section className="card">
          <h2>날씨별 비교</h2>
          {weatherGroups.map(([label, rows]) => <GroupTable key={label} compact rows={rows} label={label} name={(k) => k} />)}
          <div className="small muted">날씨를 남긴 순만 셉니다. {MIN_ENDS_FOR_RANKING}순 미만은 흐리게 표시합니다.</div>
        </section>
      )}
      <WeatherLeanCard ends={ends} hand={settings.hand} />
      {windRows.length > 0 && (
        <section className="card">
          <h2>바람 방향별 불 방향</h2>
          <div className="scroll-x">
            <table className="wind-table">
              <thead>
                <tr><th>바람</th><th>순</th><th>순당</th>{MISS_DIRECTIONS.map((d) => <th key={d}>{d}</th>)}</tr>
              </thead>
              <tbody>
                {windRows.map((r) => {
                  const top = Math.max(...MISS_DIRECTIONS.map((d) => r.miss[d]));
                  return (
                    <tr key={r.dir} className={r.enough ? '' : 'thin'}>
                      <td>{r.dir === '왼쪽에서' ? '왼쪽' : r.dir === '오른쪽에서' ? '오른쪽' : r.dir}</td>
                      <td>{r.ends}</td>
                      <td>{r.perEnd.toFixed(1)}</td>
                      {MISS_DIRECTIONS.map((d) => (
                        <td key={d} className={top > 0 && r.miss[d] === top ? 'top' : ''}>{r.missTotal ? `${Math.round((r.miss[d] / r.missTotal) * 100)}%` : '–'}</td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="small muted">사대에서 본 바람 방향입니다. 불 방향 칸은 그 바람에서 난 불 가운데 비율이고, 가장 많은 쪽을 굵게 표시합니다. 사대 방향을 정한 활터에서 바람을 남긴 순만 세고, {MIN_ENDS_FOR_RANKING}순 미만은 흐리게 표시합니다.</div>
        </section>
      )}
      {range === 'all' && ends.some((e) => e.rangeId) && (
        <section className="card"><h2>활터별 비교</h2><GroupTable rows={byRange(ends)} label="활터" name={(k) => rangeName(k)} /></section>
      )}
      <section className="card"><h2>활별 비교</h2><GroupTable rows={byGear(ends, 'bow')} label="활" name={name} /></section>
      <section className="card"><h2>깍지별 비교</h2><GroupTable rows={byGear(ends, 'ring')} label="깍지" name={name} /></section>
      {ends.some((e) => e.stringId) && <section className="card"><h2>현별 비교</h2><GroupTable rows={byGear(ends.filter((e) => e.stringId), 'string')} label="현" name={name} /></section>}
      <section className="card">
        <h2>활 × 깍지 조합</h2>
        <GroupTable compact rows={byBowAndRing(ends)} label="활 × 깍지" name={(k) => k.split('|').map((id) => gearName(id || null)).join(' × ')} />
        <div className="small muted">{MIN_ENDS_FOR_RANKING}순 미만은 순위에서 빼고 흐리게 표시합니다.</div>
      </section>
    </>
  );
}
