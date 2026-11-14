import { weekStart } from './stats';

/**
 * 온라인 랭킹 규칙.
 *
 * - 기간: 하루(일간), 월요일부터 일요일(주간), 달력의 한 달(월간). 날짜는 한국 시간.
 * - 관중 랭킹 대상: 그 기간에 최소 순 수(일 3순, 주 10순, 월 30순) 이상 기록하고, 15시(3순) 기준 평균 10중 이상인 궁사
 * - 순서: 15시 기준 평균이 높은 순. 같으면 순을 더 많이 쏜 궁사, 그래도 같으면 선다시수
 *   (기간의 첫 시부터 차례로 견주어 먼저 맞힌 궁사가 앞선다. 대한궁도협회 대회 요강의 동시수 처리 방식)
 * - 시상: 1위 1명, 2위 2명, 3위 3명, 그 밖의 대상자는 장려상
 * - 습사량 랭킹: 그 기간에 순을 가장 많이 쏜 10명. 같으면 관중이 많은 궁사.
 */
export type RankPeriod = 'day' | 'week' | 'month';

export const MIN_ENDS: Record<RankPeriod, number> = { day: 3, week: 10, month: 30 };
/** 15시 기준 평균 이 이상이어야 순위에 든다 */
export const MIN_PER_15 = 10;
/** 1위 1명, 2위 2명, 3위 3명 */
export const PLACE_SLOTS = [1, 2, 3] as const;
/** 습사량 랭킹에 보여 줄 인원 */
export const VOLUME_TOP = 10;

/** 한 기간의 궁사 한 명 합계 (서버 period_totals 한 줄) */
export interface ArcherTotal {
  name: string;
  range?: string | null;
  ends: number;
  hits: number;
  /** 기간 안에서 쏜 차례대로 관중 여부 (선다시수용, 앞 50시) */
  seq: boolean[];
  me?: boolean;
}

export interface RankRow extends ArcherTotal {
  /** 15시(3순) 기준 평균 중 수 */
  per15: number;
  /** 1, 2, 3위 또는 0(장려상) */
  place: 0 | 1 | 2 | 3;
  /** 목록 안에서의 순서 (1부터) */
  order: number;
}

/** 이 날짜가 속한 기간의 첫날: 일간 그날, 주간 그 주 월요일, 월간 1일 */
export function periodStart(date: string, p: RankPeriod): string {
  return p === 'day' ? date : p === 'week' ? weekStart(date) : `${date.slice(0, 7)}-01`;
}

/** 기간을 n만큼 옮긴 날짜 (이전·다음 기간 보기) */
export function shiftPeriod(date: string, p: RankPeriod, n: number): string {
  const [y, m, d] = periodStart(date, p).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (p === 'day') dt.setUTCDate(dt.getUTCDate() + n);
  else if (p === 'week') dt.setUTCDate(dt.getUTCDate() + 7 * n);
  else dt.setUTCMonth(dt.getUTCMonth() + n);
  return dt.toISOString().slice(0, 10);
}

/** 선다시수: 첫 시부터 견주어 먼저 맞힌 쪽이 앞(음수). 끝까지 같으면 0. */
export function compareSeondasisu(a: boolean[], b: boolean[]): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return a[i] ? -1 : 1;
  return 0;
}

export const per15Of = (t: { ends: number; hits: number }) => (t.ends ? (t.hits / t.ends) * 3 : 0);

/** 관중 랭킹 대상인지, 아니면 왜 아닌지 */
export function eligibility(t: { ends: number; hits: number }, p: RankPeriod): 'ok' | 'ends' | 'average' {
  if (t.ends < MIN_ENDS[p]) return 'ends';
  return per15Of(t) >= MIN_PER_15 ? 'ok' : 'average';
}

/** 한 기간의 관중 랭킹 */
export function rankPeriod(totals: ArcherTotal[], p: RankPeriod): RankRow[] {
  const rows = totals.filter((t) => eligibility(t, p) === 'ok');
  rows.sort((x, y) => (y.hits * x.ends - x.hits * y.ends) || (y.ends - x.ends) || compareSeondasisu(x.seq, y.seq));
  let slot = 0, left: number = PLACE_SLOTS[0];
  return rows.map((r, i) => {
    let place: RankRow['place'] = 0;
    if (slot < PLACE_SLOTS.length) {
      place = (slot + 1) as 1 | 2 | 3;
      if (--left === 0) { slot++; left = PLACE_SLOTS[slot] ?? 0; }
    }
    return { ...r, per15: per15Of(r), place, order: i + 1 };
  });
}

/** 습사량 랭킹: 순이 많은 10명, 같으면 관중이 많은 궁사 */
export function rankVolume(totals: ArcherTotal[]): RankRow[] {
  return totals
    .filter((t) => t.ends > 0)
    .sort((x, y) => (y.ends - x.ends) || (y.hits - x.hits))
    .slice(0, VOLUME_TOP)
    .map((r, i) => ({ ...r, per15: per15Of(r), place: 0 as const, order: i + 1 }));
}
