/** 습사 탭 맨 위 인사: 누구에게, 무슨 말을 */
import type { End } from './types';
import { hitsOf } from './stats';
import { dayOffset } from './util';

/** 첫 줄 인사 (날마다 번갈아) */
export const GREETS = ['반갑습니다.', '어서 오세요.'];

export type Trend = 'up' | 'down' | 'flat';

/** 둘째 줄 한마디: 오를 때는 겸손하게, 내릴 때는 응원, 비슷할 때는 활터 덕담 */
export const REMARKS: Record<Trend, string[]> = {
  up: [
    '요즘 시수가 오르고 있습니다. 성실겸손(誠實謙遜), 처음 마음 그대로.',
    '좋은 흐름입니다. 잘 맞을 때일수록 자세를 다시 살펴봅시다.',
    '활이 잘 맞는 요즘, 들뜨지 말고 한 시 한 시 정성껏.',
    '시수가 올랐다고 서두르지 마세요. 막만타궁(莫彎他弓), 내 활만 바르게.',
  ],
  down: [
    '요즘 시수가 조금 내려갔습니다. 누구에게나 오는 때, 기본으로 돌아가 봅시다.',
    '반구저기(反求諸己), 나를 돌아보면 시수는 다시 오릅니다.',
    '시수는 오르내리기 마련입니다. 오늘은 한 순만 바르게 쏘아 봅시다.',
    '잘 안 맞는 날도 공부입니다. 힘 빼고 편하게 당겨 보세요.',
  ],
  flat: [
    '오늘도 몰기 하세요!',
    '많이 맞히세요!',
    '오늘도 정심정기(正心正己)로.',
    '습사무언(習射無言), 오늘도 조용히 정진합시다.',
    '오늘 활이 잘 맞기를 바랍니다.',
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
