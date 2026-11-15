import { describe, expect, it } from 'vitest';
import { achievements, earnedLine, newlyEarned } from './achievements';
import { sampleData } from './sample';
import type { End, Shot } from './types';

let seq = 0;
const end = (date: string, pattern: string, extra: Partial<End> = {}): End => {
  seq++;
  const shots = [...pattern].map((c) => ({ hit: c === 'o' }) as Shot);
  return { id: `e${seq}`, date, recordedAt: seq, updatedAt: seq, bowId: null, ringId: null, arrowId: null, shots, tags: [], memo: '', ...extra };
};
const got = (ends: End[]) => {
  const r = achievements(ends);
  return Object.fromEntries(r.list.filter((a) => a.date).map((a) => [a.id, `${a.date}#${a.endNo}`]));
};

describe('업적', () => {
  it('기록이 없으면 아무것도 없다', () => {
    expect(got([])).toEqual({});
  });

  it('집궁과 첫 k중: k중 이상을 처음 쏜 순', () => {
    const g = got([end('2026-11-01', 'xxxxx'), end('2026-11-01', 'oxxxx'), end('2026-11-02', 'oxoxo')]);
    expect(g.jipgung).toBe('2026-11-01#1');
    expect(g.hit1).toBe('2026-11-01#2');
    expect(g.hit2).toBe('2026-11-02#1');
    expect(g.hit3).toBe('2026-11-02#1');
    expect(g.hit4).toBeUndefined();
    expect(g.chomolgi).toBeUndefined();
  });

  it('연중은 순을 넘어 잇고, 날이 바뀌면 끊는다', () => {
    const r = achievements([end('2026-11-01', 'xxooo'), end('2026-11-01', 'ooxxx'), end('2026-11-02', 'oooxx')]);
    expect(r.bestStreak).toBe(5);
    const g = got([end('2026-11-01', 'xxooo'), end('2026-11-01', 'ooxxx'), end('2026-11-02', 'oooo' + 'x')]);
    expect(g.streak5).toBe('2026-11-01#2');
    expect(g.streak6).toBeUndefined();
  });

  it('초몰기와 3연몰 (15시 15중)', () => {
    const ends = [end('2026-11-03', 'ooooo'), end('2026-11-03', 'ooooo'), end('2026-11-03', 'ooooo'), end('2026-11-03', 'oxooo')];
    const r = achievements(ends);
    const g = got(ends);
    expect(g.chomolgi).toBe('2026-11-03#1');
    expect(g.molgi2).toBe('2026-11-03#2');
    expect(g.molgi3).toBe('2026-11-03#3');
    expect(g.streak15).toBe('2026-11-03#3');
    expect(g.streak16).toBe('2026-11-03#4');
    expect(g.streak17).toBeUndefined();
    expect(r.bestMolgi).toBe(3);
    expect(r.list.filter((a) => a.special).map((a) => a.name)).toEqual(['초몰기', '3연몰']);
  });

  it('예시 기록은 넣지 않는다', () => {
    const s = sampleData(new Date('2026-11-15T12:00:00'));
    expect(achievements(s.ends).counted).toBe(0);
    expect(got([...s.ends, end('2026-11-15', 'oxxxx')]).jipgung).toBe('2026-11-15#1');
  });

  it('새로 이룬 업적을 한 줄로 알린다', () => {
    const before = achievements([end('2026-11-01', 'ooooo')]);
    const after = achievements([...[end('2026-11-01', 'ooooo')], end('2026-11-02', 'ooooo'), end('2026-11-02', 'ooooo'), end('2026-11-02', 'ooooo')]);
    // before의 id가 다르므로 순서로만 비교하지 않고, 업적 id로 견준다
    const earned = newlyEarned(before, after);
    expect(earned.some((a) => a.id === 'molgi3')).toBe(true);
    expect(earnedLine(earned)).toMatch(/^업적 3연몰 외 \d+개$/);
    expect(earnedLine([])).toBe('');
  });
});
