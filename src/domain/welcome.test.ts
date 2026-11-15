import { describe, expect, it } from 'vitest';
import { GREETS, REMARKS, honorific, trendOf, welcomeFor, welcomeWho } from './welcome';

describe('welcome', () => {
  it('소속과 닉네임을 함께 부른다', () => {
    expect(welcomeWho('관덕정', '홍길동', '접장님')).toBe('관덕정 홍길동 접장님');
    expect(welcomeWho(null, '홍길동', '사우님')).toBe('홍길동 사우님');
    expect(welcomeWho('관덕정', null, '접장님')).toBe('관덕정 접장님');
    expect(welcomeWho(undefined, ' ', '사우님')).toBe('사우님');
    expect(welcomeWho('관덕정', '홍길동', '접장님', '3단')).toBe('관덕정 홍길동 접장님 · 3단');
  });
  it('몰기를 했으면 접장, 아니면 사우', () => {
    expect(honorific(true)).toBe('접장님');
    expect(honorific(false)).toBe('사우님');
  });
  it('같은 날에는 같은 인사, 흐름에 맞는 한마디', () => {
    expect(welcomeFor('2026-11-15', 'up')).toEqual(welcomeFor('2026-11-15', 'up'));
    for (const t of ['up', 'down', 'flat'] as const) {
      const w = welcomeFor('2026-11-15', t);
      expect(GREETS).toContain(w.greet);
      expect(REMARKS[t]).toContain(w.remark);
    }
    const seen = new Set(Array.from({ length: 30 }, (_, i) => welcomeFor(`2026-11-${String(i + 1).padStart(2, '0')}`).remark));
    expect(seen.size).toBeGreaterThan(2);
  });
  it('궁도 9계훈이 모두 들어 있다', () => {
    const all = Object.values(REMARKS).flat().join(' ');
    for (const w of ['인애덕행', '성실겸손', '자중절조', '예의엄수', '염직과감', '습사무언', '정심정기', '불원승자', '막만타궁']) expect(all).toContain(w);
  });
});

/** n중짜리 순 */
const end = (date: string, n: number) => ({ date, shots: Array.from({ length: 5 }, (_, i) => ({ hit: i < n, x: null, y: null, zone: null, side: null, level: null })) }) as never;
const days = (from: number, to: number, hits: number, perDay = 3) => {
  const out: never[] = [];
  for (let d = from; d <= to; d++) for (let k = 0; k < perDay; k++) out.push(end(`2026-11-${String(d).padStart(2, '0')}`, hits));
  return out;
};

describe('trendOf', () => {
  // 오늘 11월 30일: 최근 7일은 24~30일, 그 전 28일은 10월 27일~11월 23일
  const T = '2026-11-30';
  it('최근 평균이 0.3중 넘게 오르면 up, 내리면 down', () => {
    expect(trendOf([...days(10, 23, 2), ...days(24, 30, 3)], T)).toBe('up');
    expect(trendOf([...days(10, 23, 3), ...days(24, 30, 2)], T)).toBe('down');
  });
  it('차이가 작으면 flat', () => {
    expect(trendOf([...days(10, 23, 3), ...days(24, 30, 3)], T)).toBe('flat');
  });
  it('기록이 적으면 flat', () => {
    expect(trendOf([...days(10, 23, 1), ...days(29, 30, 5, 2)], T)).toBe('flat');
    expect(trendOf([...days(20, 23, 1, 2), ...days(24, 30, 5)], T)).toBe('flat');
  });
  it('35일보다 오래된 기록은 견주지 않는다', () => {
    const old = Array.from({ length: 20 }, () => end('2026-10-01', 0));
    expect(trendOf([...old, ...days(24, 30, 3)], T)).toBe('flat');
  });
});
