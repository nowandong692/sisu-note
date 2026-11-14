import { describe, expect, it } from 'vitest';
import { compareSeondasisu, periodKey, rankPeriod, rankVolume, type Archer } from './ranking';

const T = true, F = false;
/** n순을 모두 같은 다섯 시로 */
const ends = (n: number, hits: boolean[], date = '2026-11-14') => Array.from({ length: n }, (_, i) => ({ date, recordedAt: i, hits }));
const archer = (id: string, list: Archer['ends']): Archer => ({ id, name: id, ends: list });

describe('랭킹', () => {
  it('기간 열쇠: 하루, 월요일 시작 주, 달', () => {
    expect(periodKey('2026-11-14', 'day')).toBe('2026-11-14');
    expect(periodKey('2026-11-14', 'week')).toBe('2026-11-09');
    expect(periodKey('2026-11-14', 'month')).toBe('2026-11');
  });

  it('최소 순 수와 15시 평균 10중을 넘어야 대상이 된다', () => {
    const four = [T, T, T, T, F]; // 순당 4중 = 15시 12중
    const three = [T, T, T, F, F]; // 15시 9중
    const r = rankPeriod([archer('a', ends(3, four)), archer('b', ends(2, four)), archer('c', ends(3, three))], 'day');
    expect(r.map((x) => x.id)).toEqual(['a']);
    expect(r[0].per15).toBe(12);
    expect(rankPeriod([archer('a', ends(9, four))], 'week')).toEqual([]);
    expect(rankPeriod([archer('a', ends(10, four))], 'week')).toHaveLength(1);
    expect(rankPeriod([archer('a', ends(29, four))], 'month')).toEqual([]);
  });

  it('1위 1명, 2위 2명, 3위 3명, 나머지는 장려상', () => {
    const list = Array.from({ length: 8 }, (_, i) => archer(`p${i}`, ends(3 + i, [T, T, T, T, T])));
    expect(rankPeriod(list, 'day').map((x) => x.place)).toEqual([1, 2, 2, 3, 3, 3, 0, 0]);
  });

  it('평균이 같으면 순이 많은 궁사, 그래도 같으면 선다시수', () => {
    const a = archer('a', ends(3, [F, T, T, T, T]));
    const b = archer('b', ends(3, [T, F, T, T, T]));
    const c = archer('c', ends(4, [F, T, T, T, T]));
    expect(rankPeriod([a, b, c], 'day').map((x) => x.id)).toEqual(['c', 'b', 'a']);
    expect(compareSeondasisu([T, F], [F, T])).toBe(-1);
    expect(compareSeondasisu([T, T], [T, T])).toBe(0);
  });

  it('평균이 높은 궁사가 순 수와 상관없이 앞선다', () => {
    const r = rankPeriod([archer('many', ends(10, [T, T, T, T, F])), archer('few', ends(3, [T, T, T, T, T]))], 'day');
    expect(r.map((x) => x.id)).toEqual(['few', 'many']);
  });

  it('습사량 랭킹은 순이 많은 10명, 같으면 관중이 많은 궁사', () => {
    const list = Array.from({ length: 12 }, (_, i) => archer(`p${i}`, ends(i + 1, [F, F, F, F, F])));
    list.push(archer('tie', ends(12, [T, F, F, F, F])));
    const r = rankVolume(list);
    expect(r).toHaveLength(10);
    expect(r.slice(0, 2).map((x) => x.id)).toEqual(['tie', 'p11']);
    expect(rankVolume([archer('none', [])])).toEqual([]);
  });
});
