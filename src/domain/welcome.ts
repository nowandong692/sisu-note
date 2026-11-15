/** 습사 탭 맨 위 인사: 누구에게, 무슨 말을 */
import type { End } from './types';
import { hitsOf } from './stats';
import { dayOffset } from './util';

/** 첫 줄 인사 (날마다 번갈아) */
export const GREETS = ['반갑습니다.', '어서 오세요.'];

export type Trend = 'up' | 'down' | 'flat';

/**
 * 둘째 줄 한마디: 오를 때는 겸손하게, 내릴 때는 응원, 비슷할 때는 활터 덕담.
 * 궁도 9계훈(인애덕행, 성실겸손, 자중절조, 예의엄수, 염직과감, 습사무언, 정심정기, 불원승자, 막만타궁)을 흐름에 맞게 나눠 쓴다.
 */
export const REMARKS: Record<Trend, string[]> = {
  up: [
    '시수가 오르는 요즘일수록 성실겸손(誠實謙遜), 처음 마음 그대로.',
    '좋은 흐름입니다. 자중절조(自重節操), 들뜨지 말고 몸가짐을 바르게.',
    '잘 맞는 때일수록 예의엄수(禮儀嚴守), 사대의 예를 먼저 지킵시다.',
    '시수가 오른 만큼 인애덕행(仁愛德行), 사우들과 기쁨을 나눕시다.',
  ],
  down: [
    '반구제기(反求諸己), 나를 돌아보면 시수는 다시 오릅니다.',
    '불원승자(不怨勝者), 남과 견주지 말고 어제의 나와 견줍시다.',
    '정심정기(正心正己), 마음과 몸을 바로 하면 다시 맞습니다.',
    '염직과감(廉直果敢), 망설이지 말고 시원하게 내보내 봅시다.',
  ],
  flat: [
    '많이 맞히세요!',
    '오늘도 몰기 하세요!',
    '습사무언(習射無言), 오늘도 조용히 정진합시다.',
    '막만타궁(莫彎他弓), 내 활로 내 시수를 쌓아 갑시다.',
    '오늘도 정심정기(正心正己)로.',
  ],
};

/** 최근 7일(오늘 포함)의 순당 평균과 그 전 28일을 견준다. 기록이 적으면 비슷한 것으로 본다 */
export const TREND_RECENT_DAYS = 7;
export const TREND_BASE_DAYS = 28;
export const TREND_MIN_RECENT = 6;
export const TREND_MIN_BASE = 10;
/** 순당 평균이 이만큼(0.3중) 넘게 차이 나야 오름·내림으로 본다 */
export const TREND_GAP = 0.3;

export function trendOf(ends: Pick<End, 'date' | 'shots'>[], todayStr: string): Trend {
  const at = new Date(`${todayStr}T12:00:00`);
  const recentFrom = dayOffset(-(TREND_RECENT_DAYS - 1), at);
  const baseFrom = dayOffset(-(TREND_RECENT_DAYS + TREND_BASE_DAYS - 1), at);
  const recent = ends.filter((e) => e.date >= recentFrom && e.date <= todayStr);
  const base = ends.filter((e) => e.date >= baseFrom && e.date < recentFrom);
  if (recent.length < TREND_MIN_RECENT || base.length < TREND_MIN_BASE) return 'flat';
  const avg = (l: typeof ends) => l.reduce((s, e) => s + hitsOf(e as End), 0) / l.length;
  const gap = avg(recent) - avg(base);
  return gap >= TREND_GAP ? 'up' : gap <= -TREND_GAP ? 'down' : 'flat';
}

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

/** 날짜와 흐름으로 인사를 고른다 (같은 날, 같은 흐름이면 같은 말) */
export function welcomeFor(date: string, trend: Trend = 'flat'): { greet: string; remark: string } {
  const n = hash(date);
  const list = REMARKS[trend];
  return { greet: GREETS[n % GREETS.length], remark: list[n % list.length] };
}

/** 한 번이라도 몰기(5시 5중)를 했으면 접장, 아직이면 사우 */
export function honorific(hasMolgi: boolean): string {
  return hasMolgi ? '접장님' : '사우님';
}

/** "관덕정 홍길동 접장님"처럼 소속과 닉네임을 이어 부른다. 닉네임이 없으면 호칭만 */
export function welcomeWho(club: string | null | undefined, nickname: string | null | undefined, title: string, dan?: string | null): string {
  const c = club?.trim();
  const n = nickname?.trim();
  const who = [c, n ? `${n} ${title}` : title].filter(Boolean).join(' ');
  return dan ? `${who} · ${dan}` : who;
}
