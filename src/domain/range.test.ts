import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from './types';
import { distanceM, migrateRanges, nearestRange, pickOffer } from './range';

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

  it('근처에 지금 활터와 다른 활터가 있을 때만 바꾸자고 한다', () => {
    expect(pickOffer([A, B], 'a', { lat: 37.57, lon: 126.99 })).toEqual({ range: B });
    expect(pickOffer([A, B], 'b', { lat: 37.57, lon: 126.99 })).toBeNull();
    // 근처에 아무 곳도 없으면 지금 활터를 그대로 둔다
    expect(pickOffer([A, B], 'a', { lat: 35, lon: 127 })).toBeNull();
  });

  it('등록하지 않은 국궁장이 근처에 있으면 그곳을 권한다', () => {
    const here = { lat: 35, lon: 127 };
    const g = { name: '계룡정궁도장', lat: 35.001, lon: 127 };
    expect(pickOffer([A], 'a', here, [{ name: '먼 곳', lat: 35.01, lon: 127 }, g])).toEqual({ place: g });
    expect(pickOffer([A], 'a', here, [{ name: '먼 곳', lat: 35.01, lon: 127 }])).toBeNull();
    // 지도 위치가 조금 달라도 이미 등록한 활터면 그 활터로
    const C = { id: 'c', name: '계룡정', lat: 35.0018, lon: 127, bearing: null };
    expect(pickOffer([A, C], 'a', here, [g])).toEqual({ range: C });
    expect(pickOffer([A, C], 'c', here, [g])).toBeNull();
  });

  it('예전에 정해 둔 활터 위치를 목록으로 옮긴다', () => {
    const m = migrateRanges({ ...DEFAULT_SETTINGS, rangePlace: { name: '종로구', lat: 1, lon: 2 }, rangeBearing: 270 });
    expect(m.ranges).toEqual([{ id: 'range-1', name: '종로구', lat: 1, lon: 2, bearing: 270 }]);
    expect(m.currentRange).toBe('range-1');
  });
});
