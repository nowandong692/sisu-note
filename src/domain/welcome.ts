/** 습사 탭 맨 위 한 줄 인사: 누구에게, 무슨 말을 */

/** 날마다 바뀌는 인사말 (같은 날에는 같은 말) */
export const WELCOMES = [
  '반갑습니다. 오늘도 몰기 하세요!',
  '어서 오세요. 오늘도 정심정기(正心正己)로.',
  '반갑습니다. 바른 자세가 좋은 시수를 만듭니다.',
  '어서 오세요. 한 순 한 순 즐겁게 쏘세요.',
  '반갑습니다. 과녁보다 내 자세를 먼저 봅시다.',
  '어서 오세요. 오늘 활이 잘 맞기를 바랍니다.',
];

/** 날짜(YYYY-MM-DD)마다 하나를 고른다 */
export function welcomeFor(date: string): string {
  const n = [...date].reduce((s, c) => (s * 31 + c.charCodeAt(0)) >>> 0, 7);
  return WELCOMES[n % WELCOMES.length];
}

/** "관덕정 홍길동 접장님"처럼 소속과 닉네임을 이어 부른다. 둘 다 없으면 "접장님" */
export function welcomeWho(club?: string | null, nickname?: string | null): string {
  const c = club?.trim();
  const n = nickname?.trim();
  return [c, n ? `${n} 접장님` : '접장님'].filter(Boolean).join(' ');
}
