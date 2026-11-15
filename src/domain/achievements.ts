/** 업적: 집궁, 처음 1중~5중(초몰기), 연중(2~50연중), 연몰기(2~20연몰, 20연몰은 백발백중), 랭킹. 기록에서 매번 다시 계산한다 */
import type { End } from './types';
import { sampleEndIds } from './sample';
import { hitsOf } from './stats';
import { periodStart, rankPeriod, rankVolume, type ArcherTotal, type RankPeriod } from './ranking';
import { ymd } from './util';

export const STREAK_MAX = 50;
export const MOLGI_STREAK_MAX = 20;

export type AchievementGroup = 'first' | 'streak' | 'molgi' | 'rank';

/** 끝난 랭킹 기간 하나에서 내 결과. 끝난 기간은 바뀌지 않으므로 이 기기에 모아 둔다 */
export interface RankResult {
  /** 관중 랭킹: 1~3위, 0 장려상, null 대상 아님 */
  place: 0 | 1 | 2 | 3 | null;
  /** 습사량 랭킹 순서 (TOP 10 밖이면 null) */
  volume: number | null;
}
/** 키는 `day:2026-11-08`, `week:2026-11-02`, `month:2026-11-01` */
export type RankHistory = Record<string, RankResult>;

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
  /** 랭킹 업적: 이룬 기간 이름 (예: 11월 둘째 주) */
  label?: string;
  /** 랭킹 업적: 지금까지 몇 번 이뤘는지 */
  times?: number;
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

const PERIOD_NAME: Record<RankPeriod, string> = { day: '일간', week: '주간', month: '월간' };
const RANK_ITEMS: { id: string; name: string; desc: string; test: (p: RankPeriod, r: RankResult) => boolean }[] = [
  { id: 'rank-in', name: '첫 랭킹', desc: '관중 랭킹에 처음 이름을 올림 (장려상 이상)', test: (_p, r) => r.place !== null },
  ...(['day', 'week', 'month'] as RankPeriod[]).flatMap((p) => [
    { id: `rank-${p}-top3`, name: `${PERIOD_NAME[p]} 입상`, desc: `${PERIOD_NAME[p]} 관중 랭킹 3위 안`, test: (q: RankPeriod, r: RankResult) => q === p && !!r.place },
    { id: `rank-${p}-1`, name: `${PERIOD_NAME[p]} 장원`, desc: `${PERIOD_NAME[p]} 관중 랭킹 1위`, test: (q: RankPeriod, r: RankResult) => q === p && r.place === 1 },
  ]),
  { id: 'rank-week-vol', name: '주간 습사왕', desc: '주간 습사량 1위', test: (p, r) => p === 'week' && r.volume === 1 },
  { id: 'rank-month-vol', name: '월간 습사왕', desc: '월간 습사량 1위', test: (p, r) => p === 'month' && r.volume === 1 },
];

/** 랭킹 기간 이름: 11월 8일, 11월 2일 주, 2026년 11월 */
export function periodLabel(p: RankPeriod, start: string): string {
  const [y, m, d] = start.split('-').map(Number);
  return p === 'day' ? `${y}년 ${m}월 ${d}일` : p === 'week' ? `${y}년 ${m}월 ${d}일 주` : `${y}년 ${m}월`;
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
      ...(n === MOLGI_STREAK_MAX ? { name: '백발백중', desc: `${n}순 연속 몰기 (100시 100중)` } : {}),
      special: n === 3 || n === MOLGI_STREAK_MAX ? true : undefined,
    });
  }
  for (const r of RANK_ITEMS) list.push({ id: r.id, group: 'rank', name: r.name, desc: r.desc });
  return list;
}

/**
 * 기록으로 업적을 계산한다. 예시 기록은 넣지 않는다.
 * 연중과 연몰은 같은 날 안에서만 잇는다. 그날 순서대로(저장한 순서) 시를 세고, 날이 바뀌면 처음부터 센다.
 */
export function achievements(all: End[], ranks: RankHistory = {}): AchievementReport {
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

  // 랭킹: 기간이 이른 것부터. 같은 업적을 여러 번 이뤘으면 횟수를 센다
  const keys = Object.keys(ranks).sort((a, b) => (a.split(':')[1] < b.split(':')[1] ? -1 : 1));
  for (const k of keys) {
    const [p, start] = k.split(':') as [RankPeriod, string];
    for (const item of RANK_ITEMS) {
      if (!item.test(p, ranks[k])) continue;
      const a = byId.get(item.id)!;
      a.times = (a.times ?? 0) + 1;
      if (!a.date) { a.date = start; a.label = periodLabel(p, start); }
    }
  }
  return { list, bestStreak, bestMolgi, counted: ends.length };
}

/**
 * 랭킹 결과를 받아 와야 할 끝난 기간들. 랭킹에 참여한 날부터, 이 기기에 직접 쏜 기록이 있는 기간만,
 * 이미 받아 둔 기간은 뺀다. 아직 끝나지 않은 기간(오늘, 이번 주, 이번 달)은 결과가 바뀔 수 있어 뺀다.
 */
export function rankPeriodsToFetch(all: End[], joinedAt: number, today: string, have: RankHistory): { period: RankPeriod; start: string }[] {
  const joined = ymd(new Date(joinedAt));
  const sample = sampleEndIds(all);
  const dates = new Set(all.filter((e) => !sample.has(e.id) && e.date >= joined && e.date < today).map((e) => e.date));
  const out: { period: RankPeriod; start: string }[] = [];
  for (const period of ['month', 'week', 'day'] as RankPeriod[]) {
    const current = periodStart(today, period);
    const starts = new Set([...dates].map((d) => periodStart(d, period)));
    for (const start of [...starts].sort()) {
      if (start >= current) continue;
      if (!have[`${period}:${start}`]) out.push({ period, start });
    }
  }
  return out;
}

/** 서버의 기간 합계에서 내 결과 */
export function myRankResult(totals: ArcherTotal[], period: RankPeriod): RankResult {
  const hit = rankPeriod(totals, period).find((r) => r.me);
  const vol = rankVolume(totals).find((r) => r.me);
  return { place: hit ? hit.place : null, volume: vol ? vol.order : null };
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
