import { describe, expect, it } from 'vitest';
import { asBackup, makeBackup, mergeBackup } from './backup';
import { DEFAULT_SETTINGS } from './types';
import type { End, Gear, Settings } from './types';

const bow: Gear = { id: 'g1', category: 'bow', nickname: '검은 활', startedOn: '2026-11-01', archived: false, updatedAt: 1 };
const ring: Gear = { id: 'g2', category: 'ring', nickname: '소뿔 깍지', startedOn: '2026-11-01', archived: false, updatedAt: 1 };
const sample: Gear = { id: 'sample-b1', category: 'bow', nickname: '예시 활', startedOn: '2026-11-01', archived: false, updatedAt: 1 };
const range = { id: 'r1', name: '황학정', lat: 37.5, lon: 126.9, bearing: 90 };
const end: End = { id: 'e1', date: '2026-11-12', recordedAt: 1, bowId: 'g1', ringId: null, arrowId: null, shots: [], tags: [], memo: '', updatedAt: 1 };

const mine: Settings = {
  ...DEFAULT_SETTINGS, hand: 'left', grid: true, club: { name: '황학정' }, memoTags: ['줌손'], ranges: [range], currentRange: 'r1',
  current: { bow: 'g1', ring: 'g2', arrow: null, string: null },
  online: { key: 'k'.repeat(24), nickname: '활쏘는이', rangeName: null, joinedAt: 1, queue: [] },
  weather: { date: '2026-11-17', sky: null, temp: 3, wind: null, windDir: null },
};

describe('장비·설정 백업', () => {
  it('열쇠, 날씨, 예시 장비는 올리지 않는다', () => {
    const b = makeBackup([bow, ring, sample], { ...mine, current: { ...mine.current, bow: 'sample-b1' } });
    expect(b.gear.map((g) => g.id)).toEqual(['g1', 'g2']);
    expect(b.settings).not.toHaveProperty('online');
    expect(b.settings).not.toHaveProperty('weather');
    expect(b.settings.current).toEqual({ bow: null, ring: 'g2', arrow: null, string: null });
    expect(b.settings.club).toEqual({ name: '황학정' });
  });

  it('모르는 꼴은 무시한다', () => {
    expect(asBackup(null)).toBeNull();
    expect(asBackup({ v: 2, gear: [], settings: {} })).toBeNull();
    expect(asBackup({ v: 1, gear: [bow, { id: 3 }], settings: {} })?.gear).toEqual([bow]);
  });

  it('저장소가 비워진 기기에서는 장비와 설정을 그대로 되살린다', () => {
    const b = asBackup(JSON.parse(JSON.stringify(makeBackup([bow, ring], mine))))!;
    const r = mergeBackup({ gear: [], ends: [], settings: DEFAULT_SETTINGS }, b);
    expect(r.gear).toEqual([bow, ring]);
    expect(r.added).toHaveLength(2);
    expect(r.patch.hand).toBe('left');
    expect(r.patch.grid).toBe(true);
    expect(r.patch.club).toEqual({ name: '황학정' });
    expect(r.patch.ranges).toEqual([range]);
    expect(r.patch.currentRange).toBe('r1');
    expect(r.patch.current).toEqual({ bow: 'g1', ring: 'g2', arrow: null, string: null });
  });

  it('쓰던 기기에서는 이 기기 설정을 지키고 빈 곳만 채운다', () => {
    const b = makeBackup([bow, ring], mine);
    const other: Gear = { ...bow, id: 'g9', nickname: '새 활' };
    const local: Settings = { ...DEFAULT_SETTINGS, hand: 'right', club: { name: '석호정' }, current: { bow: 'g9', ring: null, arrow: null } };
    const r = mergeBackup({ gear: [other], ends: [end], settings: local }, b);
    expect(r.gear.map((g) => g.id)).toEqual(['g9', 'g1', 'g2']);
    expect(r.patch.hand).toBeUndefined();
    expect(r.patch.club).toBeUndefined();
    expect(r.patch.memoTags).toEqual(['줌손']);
    expect(r.patch.ranges).toEqual([range]);
    expect(r.patch.current).toEqual({ bow: 'g9', ring: 'g2', arrow: null, string: null });
  });

  it('같은 장비는 더 나중에 고친 쪽을 쓴다', () => {
    const newer = { ...bow, nickname: '고친 활', updatedAt: 5 };
    expect(mergeBackup({ gear: [bow], ends: [end], settings: DEFAULT_SETTINGS }, makeBackup([newer], DEFAULT_SETTINGS)).gear).toEqual([newer]);
    expect(mergeBackup({ gear: [newer], ends: [end], settings: DEFAULT_SETTINGS }, makeBackup([bow], DEFAULT_SETTINGS)).added).toEqual([]);
  });
});
