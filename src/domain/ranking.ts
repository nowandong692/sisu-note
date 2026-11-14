import { weekStart } from './stats';

/**
 * 온라인 랭킹 규칙.
 *
 * - 기간: 하루(일간), 월요일부터 일요일(주간), 달력의 한 달(월간)
 * - 대상: 그 기간에 최소 순 수(일 3순, 주 10순, 월 30순) 이상 기록하고, 15시(3순) 기준 평균 10중 이상인 궁사
 * - 순서: 15시 기준 평균이 높은 순. 같으면 순을 더 많이 쏜 궁사, 그래도 같으면 선다시수
 *   (기간의 첫 시부터 차례로 견주어 먼저 맞힌 궁사가 앞선다. 대한궁도협회 대회 요강의 동시수 처리 방식)
 * - 시상: 1위 1명, 2위 2명, 3위 3명, 그 밖의 대상자는 장려상
 */
export type RankPeriod = 'day' | 'week' | 'month';

export const MIN_ENDS: Record<RankPeriod, number> = { day: 3, week: 10, month: 30 };
/** 15시 기준 평균 이 이상이어야 순위에 든다 */
export const MIN_PER_15 = 10;
/** 1위 1명, 2위 2명, 3위 3명 */
export const PLACE_SLOTS = [1, 2, 3] as const;

/** 랭킹 계산에 쓰는 순 하나: 날짜, 기록 순서, 다섯 시의 관중 여부 */
export interface RankEnd { date: string; recordedAt: number; hits: boolean[] }
export interface Archer { id: string; name: string; ends: RankEnd[] }

export interface RankRow {
  id: string;
  name: string;
  ends: number;
  hits: number;
  /** 15시(3순) 기준 평균 중 수 */
  per15: number;
  /** 1, 2, 3위 또는 0(장려상) */
  place: 0 | 1 | 2 | 3;
  /** 대상자 안에서의 순서 (1부터) */
  order: number;
}

/** 이 날짜가 속한 기간의 열쇠: 일간 YYYY-MM-DD, 주간 그 주 월요일, 월간 YYYY-MM */
export function periodKey(date: string, p: RankPeriod): string {
  return p === 'day' ? date : p === 'week' ? weekStart(date) : date.slice(0, 7);
}

/** 선다시수: 첫 시부터 견주어 먼저 맞힌 쪽이 앞(음수). 끝까지 같으면 0. */
export function compareSeondasisu(a: boolean[], b: boolean[]): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return a[i] ? -1 : 1;
  return 0;
}

/** 한 기간의 랭킹. archers의 ends는 그 기간 것만 들어 있어야 한다. */
export function rankPeriod(archers: Archer[], p: RankPeriod): RankRow[] {
  const rows = archers.flatMap((a) => {
    const ends = [...a.ends].sort((x, y) => (x.date === y.date ? x.recordedAt - y.recordedAt : x.date < y.date ? -1 : 1));
    if (ends.length < MIN_ENDS[p]) return [];
    const seq = ends.flatMap((e) => e.hits);
    const hits = seq.filter(Boolean).length;
    const per15 = (hits / ends.length) * 3;
    if (per15 < MIN_PER_15) return [];
    return [{ id: a.id, name: a.name, ends: ends.length, hits, per15, seq }];
  });
  rows.sort((x, y) => (y.hits * x.ends - x.hits * y.ends) || (y.ends - x.ends) || compareSeondasisu(x.seq, y.seq));
  let slot = 0, left: number = PLACE_SLOTS[0];
  return rows.map((r, i) => {
    let place: RankRow['place'] = 0;
    if (slot < PLACE_SLOTS.length) {
      place = (slot + 1) as 1 | 2 | 3;
      if (--left === 0) { slot++; left = PLACE_SLOTS[slot] ?? 0; }
    }
    return { id: r.id, name: r.name, ends: r.ends, hits: r.hits, per15: r.per15, place, order: i + 1 };
  });
}

/** 습사량 랭킹에 보여 줄 인원 */
export const VOLUME_TOP = 10;

export interface VolumeRow { id: string; name: string; ends: number; hits: number; order: number }

/**
 * 습사량 랭킹: 그 기간에 순을 가장 많이 쏜 궁사 10명. 최소 순 수 조건은 없다.
 * 순 수가 같으면 관중이 많은 궁사가 앞선다.
 */
export function rankVolume(archers: Archer[]): VolumeRow[] {
  return archers
    .filter((a) => a.ends.length > 0)
    .map((a) => ({ id: a.id, name: a.name, ends: a.ends.length, hits: a.ends.reduce((n, e) => n + e.hits.filter(Boolean).length, 0) }))
    .sort((x, y) => (y.ends - x.ends) || (y.hits - x.hits))
    .slice(0, VOLUME_TOP)
    .map((r, i) => ({ ...r, order: i + 1 }));
}
