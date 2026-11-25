import type { End, GearCategory, Hand, MissDir8, MissLevel, Shot, WindDir } from './types';
import { DIR8_VEC, MISS_DIRS8 } from './types';
import { missDir8 } from './target';
import { SKIES, WIND_DIRS, WIND_LEVELS } from './weather';

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

export type TrendUnit = 'day' | 'week' | 'month';

export interface TrendPoint extends Summary {
  /** 날짜(YYYY-MM-DD), 주의 월요일, 또는 달(YYYY-MM) */
  key: string;
  /** 습사한 날 수 */
  days: number;
  /** 이 점까지 최근 몇 개 점을 순 수로 가중해 낸 순당 평균 (흐름선) */
  smooth: number;
}

/**
 * 날짜별·주별·월별 추이. 오래된 것부터.
 * smooth는 이 점을 포함한 최근 window개 점의 중 합 ÷ 순 합이라, 순이 적은 날 하나에 크게 흔들리지 않는다.
 */
export function trendSeries(ends: End[], unit: TrendUnit, window = unit === 'day' ? 5 : 3): TrendPoint[] {
  const keyOf = (d: string) => (unit === 'day' ? d : unit === 'week' ? weekStart(d) : d.slice(0, 7));
  const m = new Map<string, End[]>();
  for (const e of ends) {
    const k = keyOf(e.date);
    m.set(k, [...(m.get(k) ?? []), e]);
  }
  const pts = [...m.keys()].sort().map((key) => {
    const list = m.get(key)!;
    return { key, days: new Set(list.map((e) => e.date)).size, ...summarize(list), smooth: 0 };
  });
  pts.forEach((p, i) => {
    const w = pts.slice(Math.max(0, i - window + 1), i + 1);
    p.smooth = w.reduce((a, x) => a + x.hits, 0) / w.reduce((a, x) => a + x.ends, 0);
  });
  return pts;
}

export interface MonthRow extends Summary {
  month: string; // YYYY-MM
  days: number; // 습사한 날 수
}

/** 월별 통계, 최근 달이 위로 */
export function monthlyStats(ends: End[]): MonthRow[] {
  const m = new Map<string, End[]>();
  for (const e of ends) {
    const k = e.date.slice(0, 7);
    m.set(k, [...(m.get(k) ?? []), e]);
  }
  return [...m.keys()].sort().reverse().map((month) => {
    const list = m.get(month)!;
    return { month, days: new Set(list.map((e) => e.date)).size, ...summarize(list) };
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

/** 8방향 불 수를 조금·많이로 나눠 센다. hand는 앞이 어느 쪽인지 모르는 옛 기록에만 쓴다. */
export function missBreakdown(ends: End[], hand?: Hand): { total: number; byDir: Record<MissDir8, Record<MissLevel, number>> } {
  const byDir = Object.fromEntries(MISS_DIRS8.map((d) => [d, { 1: 0, 2: 0 }])) as Record<MissDir8, Record<MissLevel, number>>;
  let total = 0;
  for (const e of ends) {
    for (const s of e.shots) {
      const d = missDir8(s, hand);
      if (d && s.level) {
        byDir[d][s.level]++;
        total++;
      }
    }
  }
  return { total, byDir };
}

/** 관중 중 9등분 칸별 개수. at(0~4)을 주면 그 시만 센다 */
export function zoneCounts(ends: End[], at?: number | null): number[] {
  const z = new Array(9).fill(0);
  for (const s of shotsAt(ends, at)) if (s.hit && s.zone) z[s.zone - 1]++;
  return z;
}

/** 모든 순의 화살. at(0~4, 1시~5시)을 주면 각 순의 그 시만 모은다 */
export function shotsAt(ends: End[], at?: number | null): Shot[] {
  return at == null ? ends.flatMap((e) => e.shots) : ends.flatMap((e) => (e.shots[at] ? [e.shots[at]] : []));
}

export interface GroupRow extends Summary {
  key: string;
  enough: boolean;
}

function idOf(e: End, c: GearCategory): string {
  return (c === 'bow' ? e.bowId : c === 'ring' ? e.ringId : c === 'arrow' ? e.arrowId : e.stringId) ?? '';
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
export const byRange = (ends: End[]) => groupBy(ends.filter((e) => e.rangeId), (e) => e.rangeId!);
export const byBowAndRing = (ends: End[]) => groupBy(ends, (e) => `${e.bowId ?? ''}|${e.ringId ?? ''}`);

/** 기온 구간 이름. 기온을 남기지 않았으면 빈 문자열. */
export function tempBand(t: number | null | undefined): string {
  if (t == null) return '';
  if (t < 0) return '영하';
  if (t < 10) return '0~9°';
  if (t < 20) return '10~19°';
  if (t < 30) return '20~29°';
  return '30° 이상';
}

/** 날씨 항목별 성적. 그 항목을 남긴 순만 센다. */
export function byWeather(ends: End[], k: 'sky' | 'wind' | 'temp'): GroupRow[] {
  const keyOf = (e: End) => (k === 'temp' ? tempBand(e.weather?.temp) : e.weather?.[k] ?? '');
  return groupBy(ends.filter((e) => keyOf(e) !== ''), keyOf);
}

export interface WindDirRow extends Summary {
  dir: WindDir;
  enough: boolean;
  /** 불이 난 8방향별 개수와 불 합계 */
  miss: Record<MissDir8, number>;
  missTotal: number;
}

/**
 * 사대 기준 바람 방향(맞바람·뒷바람·왼쪽·오른쪽)마다 성적과 불 방향.
 * 바람 방향을 남긴 순만 세고, 바람이 없던 순은 뺀다.
 */
export function byWindDir(ends: End[], hand?: Hand): WindDirRow[] {
  return WIND_DIRS.flatMap((dir) => {
    const list = ends.filter((e) => e.weather?.windDir === dir && e.weather.wind !== '없음');
    if (!list.length) return [];
    const m = missBreakdown(list, hand);
    const miss = Object.fromEntries(MISS_DIRS8.map((d) => [d, m.byDir[d][1] + m.byDir[d][2]])) as Record<MissDir8, number>;
    return [{ dir, ...summarize(list), enough: list.length >= MIN_ENDS_FOR_RANKING, miss, missTotal: m.total }];
  });
}

export interface MissLean {
  /** 방향을 남긴 불 수 */
  total: number;
  /** 8방향별 불 수 */
  count: Record<MissDir8, number>;
  /**
   * 불의 평균 방향. 앞남 쪽이 +front, 넘음 쪽이 +over. 각각 -1~1.
   * 길이(√(front²+over²))가 1이면 모든 불이 한쪽으로만 났고, 0이면 고르게 났다.
   */
  front: number;
  over: number;
}

/** 불이 어느 쪽으로 치우쳤는지: 불 하나를 그 방향의 길이 1짜리 화살표로 보고 평균 낸다. */
export function missLean(ends: End[], hand?: Hand): MissLean {
  const count = Object.fromEntries(MISS_DIRS8.map((d) => [d, 0])) as Record<MissDir8, number>;
  for (const e of ends) for (const s of e.shots) { const d = missDir8(s, hand); if (d) count[d]++; }
  const total = MISS_DIRS8.reduce((a, d) => a + count[d], 0);
  const sum = (k: 'front' | 'over') => MISS_DIRS8.reduce((a, d) => a + count[d] * DIR8_VEC[d][k], 0);
  return { total, count, front: total ? sum('front') / total : 0, over: total ? sum('over') / total : 0 };
}

export interface WeatherLeanRow extends MissLean {
  key: string;
  ends: number;
  enough: boolean;
}

const TEMP_BANDS = ['영하', '0~9°', '10~19°', '20~29°', '30° 이상'];

/** 날씨 항목(하늘·기온·바람 세기)의 값마다 불 치우침. 맑음→눈, 추운→더운, 바람 없음→강함 순서로. */
export function weatherLean(ends: End[], k: 'sky' | 'wind' | 'temp', hand?: Hand): WeatherLeanRow[] {
  const keyOf = (e: End) => (k === 'temp' ? tempBand(e.weather?.temp) : e.weather?.[k] ?? '');
  const order: readonly string[] = k === 'sky' ? SKIES : k === 'wind' ? WIND_LEVELS : TEMP_BANDS;
  const m = new Map<string, End[]>();
  for (const e of ends) {
    const key = keyOf(e);
    if (key) m.set(key, [...(m.get(key) ?? []), e]);
  }
  return [...m.entries()]
    .map(([key, list]) => ({ key, ends: list.length, enough: list.length >= MIN_ENDS_FOR_RANKING, ...missLean(list, hand) }))
    .sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
}
