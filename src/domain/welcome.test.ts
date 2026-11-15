import { describe, expect, it } from 'vitest';
import { WELCOMES, welcomeFor, welcomeWho } from './welcome';

describe('welcome', () => {
  it('소속과 닉네임을 함께 부른다', () => {
    expect(welcomeWho('관덕정', '홍길동')).toBe('관덕정 홍길동 접장님');
    expect(welcomeWho(null, '홍길동')).toBe('홍길동 접장님');
    expect(welcomeWho('관덕정', null)).toBe('관덕정 접장님');
    expect(welcomeWho(undefined, ' ')).toBe('접장님');
  });
  it('같은 날에는 같은 인사, 날마다 목록 안에서 고른다', () => {
    expect(welcomeFor('2026-11-15')).toBe(welcomeFor('2026-11-15'));
    const seen = new Set(Array.from({ length: 30 }, (_, i) => welcomeFor(`2026-11-${String(i + 1).padStart(2, '0')}`)));
    expect(seen.size).toBeGreaterThan(2);
    for (const w of seen) expect(WELCOMES).toContain(w);
  });
});
