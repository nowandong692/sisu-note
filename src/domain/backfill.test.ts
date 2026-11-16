import { describe, expect, it } from 'vitest';
import { noonOf, pastBase } from './backfill';
import type { End } from './types';

const end = (date: string, recordedAt: number, extra: Partial<End> = {}): End => ({
  id: `${date}-${recordedAt}`, date, recordedAt, updatedAt: recordedAt, bowId: 'b1', ringId: 'r1', arrowId: 'a1', stringId: null,
  shots: [], tags: [], memo: '', rangeId: 'g1', weather: null, ...extra,
});
const fallback = { bowId: 'bNow', ringId: 'rNow', arrowId: 'aNow', stringId: 'sNow', rangeId: 'gNow' };

describe('지난 날짜에 순 추가', () => {
  it('그날 기록이 없으면 낮 12시, 지금 장비, 날씨 없음', () => {
    const b = pastBase([end('2026-11-01', 5)], '2026-11-03', fallback);
    expect(b.recordedAt).toBe(noonOf('2026-11-03'));
    expect(new Date(b.recordedAt).getHours()).toBe(12);
    expect(b).toMatchObject({ ...fallback, weather: null });
  });
  it('그날 기록이 있으면 마지막 순 바로 뒤에 붙이고 그 순의 장비·활터·날씨를 따른다', () => {
    const w = { sky: '맑음' as const, temp: 10, wind: '없음' as const, windDir: null };
    const ends = [end('2026-11-03', 100), end('2026-11-03', 300, { bowId: 'b2', rangeId: 'g2', weather: w as End['weather'] }), end('2026-11-03', 200)];
    const b = pastBase(ends, '2026-11-03', fallback);
    expect(b).toMatchObject({ recordedAt: 301, bowId: 'b2', rangeId: 'g2', weather: w });
  });
});
