/** 습사 탭 맨 위 한 줄 인사: 누구에게, 무슨 말을 */

/** 날마다 바뀌는 인사말: [첫 줄 인사, 둘째 줄 한마디] (같은 날에는 같은 말) */
export const WELCOMES: [string, string][] = [
  ['반갑습니다.', '오늘도 몰기 하세요!'],
  ['어서 오세요.', '오늘도 정심정기(正心正己)로.'],
  ['반갑습니다.', '바른 자세가 좋은 시수를 만듭니다.'],
  ['어서 오세요.', '한 순 한 순 즐겁게 쏘세요.'],
  ['반갑습니다.', '과녁보다 내 자세를 먼저 봅시다.'],
  ['어서 오세요.', '오늘 활이 잘 맞기를 바랍니다.'],
];

/** 날짜(YYYY-MM-DD)마다 하나를 고른다 */
export function welcomeFor(date: string): { greet: string; remark: string } {
  const n = [...date].reduce((s, c) => (s * 31 + c.charCodeAt(0)) >>> 0, 7);
  const [greet, remark] = WELCOMES[n % WELCOMES.length];
  return { greet, remark };
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
