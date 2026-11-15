import { describe, expect, it } from 'vitest';
import { WELCOMES, honorific, welcomeFor, welcomeWho } from './welcome';

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
  it('같은 날에는 같은 인사, 날마다 목록 안에서 고른다', () => {
    expect(welcomeFor('2026-11-15')).toEqual(welcomeFor('2026-11-15'));
    const seen = new Set(Array.from({ length: 30 }, (_, i) => welcomeFor(`2026-11-${String(i + 1).padStart(2, '0')}`).remark));
    expect(seen.size).toBeGreaterThan(2);
    for (const r of seen) expect(WELCOMES.map(([, x]) => x)).toContain(r);
    for (const [g] of WELCOMES) expect(g).toMatch(/^(반갑습니다|어서 오세요)\.$/);
  });
});
