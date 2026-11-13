import { useState } from 'react';
import { Target } from '../components/Target';
import {
  MIN_ENDS_FOR_RANKING, byRange, byWeather, monthlyStats, byBowAndRing, byGear, hitDistribution, missBreakdown, shotPositionRates, summarize, weeklyTrend, zoneCounts,
  type GroupRow,
} from '../domain/stats';
import { MISS_DIRECTIONS } from '../domain/types';
import { dayOffset } from '../domain/util';
import { useStore } from '../state/store';

const PERIODS: [number, string][] = [[30, '최근 30일'], [90, '최근 90일'], [0, '전체']];

function TrendChart({ data }: { data: { week: string; perEnd: number }[] }) {
  if (data.length < 2) return <div className="empty small">주간 추이는 2주 이상 기록이 쌓이면 보입니다.</div>;
  const W = 320, H = 150, L = 28, R = 12, T = 12, B = 26;
  const x = (i: number) => L + ((W - L - R) * i) / (data.length - 1);
  const y = (v: number) => T + (H - T - B) * (1 - v / 5);
  const pts = data.map((d, i) => [x(i), y(d.perEnd)] as const);
  const last = pts[pts.length - 1];
  const step = Math.max(1, Math.ceil(data.length / 5));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="주별 순당 평균 중 수 추이">
      {[1, 2, 3, 4, 5].map((v) => (
        <g key={v}>
          <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} style={{ stroke: 'var(--line)' }} />
          <text x={L - 6} y={y(v) + 4} textAnchor="end" fontSize={10} style={{ fill: 'var(--muted)' }}>{v}</text>
        </g>
      ))}
      <path d={`M${pts[0][0]} ${y(0)} ${pts.map((p) => `L${p[0]} ${p[1]}`).join(' ')} L${last[0]} ${y(0)}Z`} style={{ fill: 'var(--hong)' }} fillOpacity={0.08} />
      <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" style={{ stroke: 'var(--hong)' }} strokeWidth={2} strokeLinejoin="round" />
      {pts.map((p, i) => {
        const end = i === pts.length - 1;
        return <circle key={i} cx={p[0]} cy={p[1]} r={end ? 4.5 : 2.5} style={{ fill: end ? 'var(--hong)' : 'var(--surface)', stroke: 'var(--hong)' }} strokeWidth={1.5} />;
      })}
      <text x={last[0] - 8} y={last[1] - 10} textAnchor="end" fontSize={11} fontWeight={600} style={{ fill: 'var(--ink)' }}>
        이번 주 {data[data.length - 1].perEnd.toFixed(1)}
      </text>
      {data.map((d, i) => {
        if (i % step && i !== data.length - 1) return null;
        const [, m, dd] = d.week.split('-').map(Number);
        return <text key={d.week} x={x(i)} y={H - 8} textAnchor="middle" fontSize={10} style={{ fill: 'var(--muted)' }}>{m}/{dd}</text>;
      })}
    </svg>
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

export function StatsScreen() {
  const { ends: allEnds, gear, gearName, settings, rangeName } = useStore();
  const [period, setPeriod] = useState(30);
  const [bow, setBow] = useState('all');

  const cutoff = period ? dayOffset(-period) : '0000';
  const ends = allEnds.filter((e) => e.date >= cutoff && (bow === 'all' || e.bowId === bow));

  const head = (
    <>
      <div className="chips">
        {PERIODS.map(([p, l]) => <button key={p} className={`chip ${period === p ? 'on' : ''}`} onClick={() => setPeriod(p)}>{l}</button>)}
      </div>
      <div className="field">
        <label htmlFor="bowFilter">활 선택</label>
        <select id="bowFilter" value={bow} onChange={(e) => setBow(e.target.value)}>
          <option value="all">모든 활</option>
          {gear.filter((g) => g.category === 'bow').map((g) => <option key={g.id} value={g.id}>{g.nickname}{g.archived ? ' (보관)' : ''}</option>)}
        </select>
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
      </section>
      <section className="card"><h2>주별 순당 평균</h2><TrendChart data={weeklyTrend(ends)} /></section>
      <MonthlyCard rows={monthlyStats(allEnds.filter((e) => bow === 'all' || e.bowId === bow))} />
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
      {ends.some((e) => e.rangeId) && (
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
