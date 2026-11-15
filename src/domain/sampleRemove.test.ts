import { describe, expect, it } from 'vitest';
import { sampleData, sampleEndIds, withoutSample } from './sample';
import type { End } from './types';

const mine = (id: string, extra: Partial<End> = {}): End => ({
  id, date: '2026-11-15', recordedAt: 1, updatedAt: Math.random(), bowId: 'my-bow', ringId: null, arrowId: null, stringId: null,
  shots: [], tags: [], memo: '', weather: null, rangeId: 'my-range', ...extra,
}) as End;

describe('예시 기록 빼기', () => {
  const s = sampleData(new Date('2026-11-15T12:00:00'));

  it('예시 순은 모두 알아보고, 직접 쓴 순은 남긴다', () => {
    const ends = [...s.ends, mine('a'), mine('b')];
    expect(sampleEndIds(ends).size).toBe(s.ends.length);
    const r = withoutSample(ends, s.gear, [...s.ranges, { id: 'my-range' }]);
    expect(r.ends.map((e) => e.id)).toEqual(['a', 'b']);
    expect(r.gear).toEqual([]);
    expect(r.ranges.map((x) => x.id)).toEqual(['my-range']);
    expect(r.removed).toEqual({ ends: s.ends.length, gear: s.gear.length, ranges: 2 });
  });

  it('예시 장비·활터로 직접 쏜 순이 있으면 그 장비와 활터는 남긴다', () => {
    const ends = [...s.ends, mine('a', { bowId: 'sample-b1', rangeId: 'sample-g1' })];
    const r = withoutSample(ends, s.gear, s.ranges);
    expect(r.ends.map((e) => e.id)).toEqual(['a']);
    expect(r.gear.map((g) => g.id)).toEqual(['sample-b1']);
    expect(r.ranges.map((x) => x.id)).toEqual(['sample-g1']);
  });

  it('예전 버전 예시(보통 id)는 같은 시각에 만든 예시 활터의 순으로 알아본다', () => {
    const legacy = s.ends.map((e, i) => ({ ...e, id: `old-${i}`, updatedAt: 42 }));
    const myOnSample = mine('a', { bowId: 'sample-b1', rangeId: 'sample-g1', updatedAt: 99 });
    const ids = sampleEndIds([...legacy, myOnSample]);
    expect(ids.size).toBe(legacy.length);
    expect(ids.has('a')).toBe(false);
  });

  it('예시가 없으면 아무것도 빼지 않는다', () => {
    const ends = [mine('a'), mine('b')];
    expect(sampleEndIds(ends).size).toBe(0);
  });
});
