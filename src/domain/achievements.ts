/** 업적: 집궁, 처음 1중~5중(초몰기), 연중(2~50연중), 연몰기(2~10연몰). 기록에서 매번 다시 계산한다 */
import type { End } from './types';
import { sampleEndIds } from './sample';
import { hitsOf } from './stats';

export const STREAK_MAX = 50;
export const MOLGI_STREAK_MAX = 10;

export type AchievementGroup = 'first' | 'streak' | 'molgi';

export interface Achievement {
  id: string;
  group: AchievementGroup;
  name: string;
  /** 무엇을 하면 되는지 */
  desc: string;
  /** 초몰기, 3연몰처럼 따로 크게 보여 줄 것 */
  special?: boolean;
  /** 이룬 날 (아직이면 없음) */
  date?: string;
  /** 그날 몇째 순에서 이뤘는지 */
  endNo?: number;
  /** 이룬 순 id */
  endId?: string;
}

export interface AchievementReport {
  list: Achievement[];
  /** 지금까지 가장 긴 연중 */
  bestStreak: number;
  /** 지금까지 가장 긴 연몰 (몰기 순이 이어진 수) */
  bestMolgi: number;
  /** 셈에 넣은 순 수 (예시 기록 뺀 것) */
  counted: number;
}

const FIRST_NAMES = ['', '첫 1중', '첫 2중', '첫 3중', '첫 4중'];

function catalog(): Achievement[] {
  const list: Achievement[] = [
    { id: 'jipgung', group: 'first', name: '집궁', desc: '첫 순을 기록했습니다' },
  ];
  for (let k = 1; k <= 4; k++) list.push({ id: `hit${k}`, group: 'first', name: FIRST_NAMES[k], desc: `한 순에서 ${k}중 이상` });
  list.push({ id: 'chomolgi', group: 'first', name: '초몰기', desc: '처음으로 한 순 5시 5중', special: true });
  for (let n = 2; n <= STREAK_MAX; n++) list.push({ id: `streak${n}`, group: 'streak', name: `${n}연중`, desc: `${n}시를 이어서 관중` });
  for (let n = 2; n <= MOLGI_STREAK_MAX; n++) {
    list.push({
      id: `molgi${n}`, group: 'molgi', name: `${n}연몰`, desc: `${n}순 연속 몰기 (${n * 5}시 ${n * 5}중)`,
      special: n === 3 ? true : undefined,
    });
  }
  return list;
}

/**
 * 기록으로 업적을 계산한다. 예시 기록은 넣지 않는다.
 * 연중과 연몰은 같은 날 안에서만 잇는다. 그날 순서대로(저장한 순서) 시를 세고, 날이 바뀌면 처음부터 센다.
 */
export function achievements(all: End[]): AchievementReport {
  const sample = sampleEndIds(all);
  const ends = all.filter((e) => !sample.has(e.id))
    .sort((a, b) => (a.date === b.date ? a.recordedAt - b.recordedAt : a.date < b.date ? -1 : 1));
  const list = catalog();
  const byId = new Map(list.map((a) => [a.id, a]));
  const mark = (id: string, e: End, no: number) => {
    const a = byId.get(id);
    if (a && !a.date) { a.date = e.date; a.endNo = no; a.endId = e.id; }
  };

  let day = '';
  let no = 0;
  let streak = 0;
  let molgi = 0;
  let bestStreak = 0;
  let bestMolgi = 0;
  for (const e of ends) {
    if (e.date !== day) { day = e.date; no = 0; streak = 0; molgi = 0; }
    no++;
    mark('jipgung', e, no);
    const h = hitsOf(e);
    for (let k = 1; k <= Math.min(h, 4); k++) mark(`hit${k}`, e, no);
    if (h === 5) mark('chomolgi', e, no);
    for (const s of e.shots) {
      if (!s.hit) { streak = 0; continue; }
      streak++;
      bestStreak = Math.max(bestStreak, streak);
      if (streak >= 2 && streak <= STREAK_MAX) mark(`streak${streak}`, e, no);
    }
    molgi = h === 5 ? molgi + 1 : 0;
    bestMolgi = Math.max(bestMolgi, molgi);
    if (molgi >= 2 && molgi <= MOLGI_STREAK_MAX) mark(`molgi${molgi}`, e, no);
  }
  return { list, bestStreak, bestMolgi, counted: ends.length };
}

/** 이전 계산에는 없고 새 계산에서 이룬 업적 (순을 저장한 뒤 알려 줄 때) */
export function newlyEarned(before: AchievementReport, after: AchievementReport): Achievement[] {
  const had = new Set(before.list.filter((a) => a.date).map((a) => a.id));
  return after.list.filter((a) => a.date && !had.has(a.id));
}

/** 새로 이룬 업적을 한 줄로: 특기할 것 먼저, 그다음 가장 높은 것 하나와 나머지 개수 */
export function earnedLine(earned: Achievement[]): string {
  if (!earned.length) return '';
  const top = earned.filter((a) => a.special).concat(earned.filter((a) => !a.special).reverse());
  const rest = earned.length - 1;
  return `업적 ${top[0].name}${rest ? ` 외 ${rest}개` : ''}`;
}
