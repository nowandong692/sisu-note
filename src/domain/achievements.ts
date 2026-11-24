/** 업적: 집궁, 처음 1중~5중(접장), 연중(2~50연중), 연몰기(2~20연몰, 20연몰은 백발백중), 랭킹. 기록에서 매번 다시 계산한다 */
import type { End, Gear } from './types';
import { sampleEndIds } from './sample';
import { hitsOf } from './stats';
import { periodStart, rankPeriod, rankVolume, type ArcherTotal, type RankPeriod } from './ranking';
import { ymd } from './util';

export const STREAK_MAX = 50;
export const MOLGI_STREAK_MAX = 20;

export type AchievementGroup = 'first' | 'streak' | 'molgi' | 'total' | 'steady' | 'challenge' | 'rank';

/** 하루에 이만큼 순을 쏘면 '하루 N순' */
export const DAY_ENDS_GOAL = 10;
/** 서로 다른 활터 수 단계 */
export const RANGE_STEPS = [3, 5];

/** 누적 습사량 단계 (순) */
export const TOTAL_ENDS_STEPS = [100, 500, 1000];
/** 누적 몰기 단계 (회) */
export const TOTAL_MOLGI_STEPS = [10, 50, 100];
/** 며칠 잇따라 습사했는지 단계 (일) */
export const DAY_RUN_STEPS = [7, 30];
/** 이 시각(시) 전에 저장한 순이면 '새벽을 여는 활' */
export const DAWN_HOUR = 6;
/** 그날 그 자리에서 저장한 순인지, 저장한 시각이 오전 DAWN_HOUR시 전인지. 지난 날 기록은 정오로 저장하므로 들지 않는다 */
function atDawn(e: End): boolean {
  const t = new Date(e.recordedAt);
  return ymd(t) === e.date && t.getHours() < DAWN_HOUR;
}
/** 한 달에 습사한 날 */
export const MONTH_DAYS_GOAL = 20;

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
  /** 접장, 3연몰처럼 따로 크게 보여 줄 것 */
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
  /** 지금까지 쏜 순 (예시 기록 뺀 것) */
  totalEnds: number;
  /** 지금까지 몰기 횟수 */
  totalMolgi: number;
  /** 지금 이어지는 연속 습사일 (오늘이나 어제까지 이어진 것, 끊겼으면 0) */
  dayRun: number;
  /** 가장 길었던 연속 습사일 */
  bestDayRun: number;
  /** 이번 달 습사한 날 */
  monthDays: number;
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
    { id: 'jipgung', group: 'first', name: '집궁', desc: '첫 순을 저장' },
  ];
  for (let k = 1; k <= 4; k++) list.push({ id: `hit${k}`, group: 'first', name: FIRST_NAMES[k], desc: `한 순에서 ${k}중 이상` });
  // id는 예전 이름(초몰기) 그대로 둔다. 대표 칭호로 단 사람이 그대로 이어 쓰게
  list.push({ id: 'chomolgi', group: 'first', name: '접장', desc: '처음으로 한 순 5시 5중 (첫 몰기)', special: true });
  for (let n = 2; n <= STREAK_MAX; n++) list.push({ id: `streak${n}`, group: 'streak', name: `${n}연중`, desc: `${n}시를 이어서 관중` });
  for (let n = 2; n <= MOLGI_STREAK_MAX; n++) {
    list.push({
      id: `molgi${n}`, group: 'molgi', name: `${n}연몰`, desc: `${n}순 연속 몰기 (${n * 5}시 ${n * 5}중)`,
      ...(n === MOLGI_STREAK_MAX ? { name: '백발백중', desc: `${n}순 연속 몰기 (100시 100중)` } : {}),
      special: n % 3 === 0 || n === MOLGI_STREAK_MAX ? true : undefined,
    });
  }
  for (const n of TOTAL_ENDS_STEPS) list.push({ id: `ends${n}`, group: 'total', name: n === 1000 ? '천순' : `${n}순`, desc: `누적 ${n}순 습사` });
  for (const n of DAY_RUN_STEPS) list.push({ id: `dayrun${n}`, group: 'steady', name: `${n}일 연속`, desc: `${n}일 잇따라 습사` });
  list.push({ id: 'month20', group: 'steady', name: `한 달 ${MONTH_DAYS_GOAL}일`, desc: `한 달에 ${MONTH_DAYS_GOAL}일 습사` });
  list.push(
    { id: 'dayends10', group: 'challenge', name: `하루 ${DAY_ENDS_GOAL}순`, desc: `하루에 ${DAY_ENDS_GOAL}순(${DAY_ENDS_GOAL * 5}시) 이상 습사` },
    { id: 'windmolgi', group: 'challenge', name: '강풍 몰기', desc: '바람이 강한 날 몰기' },
    { id: 'rainday', group: 'challenge', name: '우중의 궁사', desc: '비나 눈 오는 날 습사' },
    { id: 'rainmolgi', group: 'challenge', name: '우중 몰기', desc: '비나 눈 오는 날 몰기' },
    { id: 'dawn', group: 'challenge', name: '새벽을 여는 활', desc: `오전 ${DAWN_HOUR}시 전에 쏜 순을 그 자리에서 저장` },
    { id: 'gakgungmolgi', group: 'challenge', name: '각궁 몰기', desc: '각궁으로 처음 몰기' },
    ...RANGE_STEPS.map((n) => ({ id: `ranges${n}`, group: 'challenge' as const, name: `활터 ${n}곳`, desc: `서로 다른 활터 ${n}곳에서 습사` })),
  );
  for (const n of TOTAL_MOLGI_STEPS) list.push({ id: `molgicount${n}`, group: 'total', name: `몰기 ${n}회`, desc: `누적 몰기 ${n}번` });
  for (const r of RANK_ITEMS) list.push({ id: r.id, group: 'rank', name: r.name, desc: r.desc });
  return list;
}

/**
 * 기록으로 업적을 계산한다. 예시 기록은 넣지 않는다.
 * 연중과 연몰은 같은 날 안에서만 잇는다. 그날 순서대로(저장한 순서) 시를 세고, 날이 바뀌면 처음부터 센다.
 */
const dayNo = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 864e5;

/**
 * gear: 각궁 몰기를 알아보려고 활 종류를 본다. 조건(날씨·활·활터) 업적은 그것을 남긴 순에서만 센다.
 */
export function achievements(all: End[], ranks: RankHistory = {}, todayDate = ymd(new Date()), gear: Pick<Gear, 'id' | 'bowType'>[] = []): AchievementReport {
  const gakgung = new Set(gear.filter((g) => g.bowType === '각궁').map((g) => g.id));
  const ranges = new Set<string>();
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
  let totalMolgi = 0;
  let run = 0;
  let bestDayRun = 0;
  let monthDays = 0;
  for (const [i, e] of ends.entries()) {
    if (e.date !== day) {
      // 새 날: 어제도 쐈으면 연속 습사일을 잇고, 달이 같으면 이 달 습사일을 더한다
      run = day && dayNo(e.date) - dayNo(day) === 1 ? run + 1 : 1;
      bestDayRun = Math.max(bestDayRun, run);
      monthDays = day.slice(0, 7) === e.date.slice(0, 7) ? monthDays + 1 : 1;
      day = e.date; no = 0; streak = 0; molgi = 0;
      if (run >= 2) for (const n of DAY_RUN_STEPS) if (run === n) mark(`dayrun${n}`, e, 1);
      if (monthDays === MONTH_DAYS_GOAL) mark('month20', e, 1);
    }
    no++;
    mark('jipgung', e, no);
    const h = hitsOf(e);
    for (let k = 1; k <= Math.min(h, 4); k++) mark(`hit${k}`, e, no);
    if (h === 5) mark('chomolgi', e, no);
    if (no >= DAY_ENDS_GOAL) mark('dayends10', e, no);
    if (h === 5 && e.weather?.wind === '강함') mark('windmolgi', e, no);
    if (e.weather?.sky === '비' || e.weather?.sky === '눈') mark('rainday', e, no);
    if (h === 5 && (e.weather?.sky === '비' || e.weather?.sky === '눈')) mark('rainmolgi', e, no);
    if (atDawn(e)) mark('dawn', e, no);
    if (h === 5 && e.bowId && gakgung.has(e.bowId)) mark('gakgungmolgi', e, no);
    if (e.rangeId && !ranges.has(e.rangeId)) { ranges.add(e.rangeId); mark(`ranges${ranges.size}`, e, no); }
    for (const s of e.shots) {
      if (!s.hit) { streak = 0; continue; }
      streak++;
      bestStreak = Math.max(bestStreak, streak);
      if (streak >= 2 && streak <= STREAK_MAX) mark(`streak${streak}`, e, no);
    }
    molgi = h === 5 ? molgi + 1 : 0;
    bestMolgi = Math.max(bestMolgi, molgi);
    if (h === 5) { totalMolgi++; mark(`molgicount${totalMolgi}`, e, no); }
    mark(`ends${i + 1}`, e, no);
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
  const gap = day ? dayNo(todayDate) - dayNo(day) : 99;
  return {
    list, bestStreak, bestMolgi, totalEnds: ends.length, totalMolgi, counted: ends.length,
    dayRun: gap <= 1 ? run : 0, bestDayRun, monthDays: day.slice(0, 7) === todayDate.slice(0, 7) ? monthDays : 0,
  };
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

/** 업적 id로 이름 (랭킹에서 남의 대표 칭호를 보일 때). 모르는 id면 null */
export function achievementName(id: string | null | undefined): string | null {
  return id ? catalog().find((a) => a.id === id)?.name ?? null : null;
}

/** 대표 칭호: 고른 업적을 이뤘을 때만 그 이름 (못 이뤘거나 기록을 지웠으면 null) */
export function titleName(list: Achievement[], id: string | null | undefined): string | null {
  if (!id) return null;
  const a = list.find((x) => x.id === id);
  return a?.date ? a.name : null;
}
