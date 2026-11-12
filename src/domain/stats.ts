import type { End, GearCategory, MissDirection, MissLevel } from './types';
import { MISS_DIRECTIONS } from './types';

/** 이보다 순이 적은 장비·조합은 순위에서 빼고 "기록 더 필요"로 표시한다. */
export const MIN_ENDS_FOR_RANKING = 10;

export function hitsOf(end: End): number {
  return end.shots.filter((s) => s.hit).length;
}

export interface Summary {
  ends: number;
  hits: number;
  perEnd: number;
  rate: number; // 0~1
  perfect: number; // 몰기 횟수
}

export function summarize(ends: End[]): Summary {
  const hits = ends.reduce((a, e) => a + hitsOf(e), 0);
  const n = ends.length;
  return {
    ends: n,
    hits,
    perEnd: n ? hits / n : 0,
    rate: n ? hits / (n * 5) : 0,
    perfect: ends.filter((e) => hitsOf(e) === 5).length,
  };
}

/** 날짜 문자열(YYYY-MM-DD)이 속한 주의 월요일 */
export function weekStart(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const wd = (dt.getUTCDay() + 6) % 7;
  dt.setUTCDate(dt.getUTCDate() - wd);
  return dt.toISOString().slice(0, 10);
}

export function weeklyTrend(ends: End[]): { week: string; perEnd: number; ends: number }[] {
  const m = new Map<string, End[]>();
  for (const e of ends) {
    const k = weekStart(e.date);
    m.set(k, [...(m.get(k) ?? []), e]);
  }
  return [...m.keys()].sort().map((week) => {
    const s = summarize(m.get(week)!);
    return { week, perEnd: s.perEnd, ends: s.ends };
  });
}

/** 0중~5중이 각각 몇 순인지 */
export function hitDistribution(ends: End[]): number[] {
  const d = [0, 0, 0, 0, 0, 0];
  for (const e of ends) d[hitsOf(e)]++;
  return d;
}

/** 1시~5시 각각의 중률 (0~1) */
export function shotPositionRates(ends: End[]): number[] {
  const c = [0, 0, 0, 0, 0];
  for (const e of ends) e.shots.forEach((s, i) => { if (s.hit) c[i]++; });
  return c.map((v) => (ends.length ? v / ends.length : 0));
}

export function missBreakdown(ends: End[]): { total: number; byDir: Record<MissDirection, Record<MissLevel, number>> } {
  const byDir = Object.fromEntries(MISS_DIRECTIONS.map((d) => [d, { 1: 0, 2: 0 }])) as Record<MissDirection, Record<MissLevel, number>>;
  let total = 0;
  for (const e of ends) {
    for (const s of e.shots) {
      if (!s.hit && s.direction && s.level) {
        byDir[s.direction][s.level]++;
        total++;
      }
    }
  }
  return { total, byDir };
}

/** 관중 중 9등분 칸별 개수 */
export function zoneCounts(ends: End[]): number[] {
  const z = new Array(9).fill(0);
  for (const e of ends) for (const s of e.shots) if (s.hit && s.zone) z[s.zone - 1]++;
  return z;
}

export interface GroupRow extends Summary {
  key: string;
  enough: boolean;
}

function idOf(e: End, c: GearCategory): string {
  return (c === 'bow' ? e.bowId : c === 'ring' ? e.ringId : e.arrowId) ?? '';
}

/** 장비별(또는 활 × 깍지 조합별) 성적. 표본이 충분한 것 먼저, 그 안에서 순당 평균 높은 순. */
export function groupBy(ends: End[], keyOf: (e: End) => string): GroupRow[] {
  const m = new Map<string, End[]>();
  for (const e of ends) {
    const k = keyOf(e);
    m.set(k, [...(m.get(k) ?? []), e]);
  }
  return [...m.entries()]
    .map(([key, list]) => ({ key, ...summarize(list), enough: list.length >= MIN_ENDS_FOR_RANKING }))
    .sort((a, b) => (a.enough !== b.enough ? (a.enough ? -1 : 1) : b.perEnd - a.perEnd));
}

export const byGear = (ends: End[], c: GearCategory) => groupBy(ends, (e) => idOf(e, c));
export const byBowAndRing = (ends: End[]) => groupBy(ends, (e) => `${e.bowId ?? ''}|${e.ringId ?? ''}`);
