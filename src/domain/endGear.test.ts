import { describe, expect, it } from 'vitest';
import { gearOfSettings, lastGearOf, sameGear } from './endGear';
import type { End } from './types';

const end = (id: string, date: string, recordedAt: number, bowId: string | null, stringId?: string | null): End =>
  ({ id, date, recordedAt, updatedAt: recordedAt, bowId, ringId: 'r', arrowId: 'a', stringId, shots: [], tags: [], memo: '' } as unknown as End);

describe('endGear', () => {
  it('현이 없던 순은 현 없음(null)과 같은 장비로 본다', () => {
    expect(sameGear(end('1', '2026-11-17', 1, 'b'), { bowId: 'b', ringId: 'r', arrowId: 'a', stringId: null })).toBe(true);
    expect(sameGear(end('1', '2026-11-17', 1, 'b'), { bowId: 'x', ringId: 'r', arrowId: 'a', stringId: null })).toBe(false);
  });
  it('그날 마지막 순의 장비를 고른다', () => {
    const ends = [end('1', '2026-11-16', 5, 'b1'), end('2', '2026-11-16', 9, 'b2'), end('3', '2026-11-17', 1, 'b3')];
    expect(lastGearOf(ends, '2026-11-16')?.bowId).toBe('b2');
    expect(lastGearOf(ends, '2026-11-15')).toBeNull();
  });
  it('설정의 오늘 장비를 순 장비 모양으로 바꾼다', () => {
    expect(gearOfSettings({ bow: 'b', ring: null, arrow: 'a' })).toEqual({ bowId: 'b', ringId: null, arrowId: 'a', stringId: null });
  });
});
