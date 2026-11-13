import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from './types';
import { detectRange, distanceM, migrateRanges, nearestRange } from './range';

const A = { id: 'a', name: '동쪽 활터', lat: 37.5700, lon: 126.9700, bearing: 0 };
const B = { id: 'b', name: '서쪽 활터', lat: 37.5700, lon: 126.9900, bearing: 90 };

describe('활터 찾기', () => {
  it('거리를 미터로 잰다', () => {
    expect(Math.round(distanceM(A, { lat: 37.5709, lon: 126.97 }))).toBe(100);
  });

  it('300m 안에서 가장 가까운 활터를 고른다', () => {
    expect(nearestRange([A, B], { lat: 37.5701, lon: 126.9701 })?.id).toBe('a');
    expect(nearestRange([A, B], { lat: 37.58, lon: 126.98 })).toBeNull();
  });

  it('등록 활터 근처가 아니면 자동으로 고른 활터는 비우고, 직접 고른 활터는 남긴다', () => {
    const s = { ...DEFAULT_SETTINGS, ranges: [A, B] };
    expect(detectRange({ ...s, currentRange: 'a' }, { lat: 37.57, lon: 126.99 })).toEqual({ currentRange: 'b', currentRangeManual: false });
    expect(detectRange({ ...s, currentRange: 'a' }, { lat: 35, lon: 127 })).toEqual({ currentRange: null, currentRangeManual: false });
    expect(detectRange({ ...s, currentRange: 'a', currentRangeManual: true }, { lat: 35, lon: 127 })).toEqual({ currentRange: 'a', currentRangeManual: true });
  });

  it('예전에 정해 둔 활터 위치를 목록으로 옮긴다', () => {
    const m = migrateRanges({ ...DEFAULT_SETTINGS, rangePlace: { name: '종로구', lat: 1, lon: 2 }, rangeBearing: 270 });
    expect(m.ranges).toEqual([{ id: 'range-1', name: '종로구', lat: 1, lon: 2, bearing: 270 }]);
    expect(m.currentRange).toBe('range-1');
  });
});
