import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../domain/types';
import { today } from '../domain/util';
import { EMPTY_WEATHER } from '../domain/weather';
import { WEATHER_REFRESH_MS, weatherDue } from './weatherSync';

describe('날씨 자동 갱신', () => {
  const now = Date.now();
  const s = (w: object | null) => ({ ...DEFAULT_SETTINGS, weather: w as never });
  it('오늘 날씨가 없거나 어제 것이면 불러온다', () => {
    expect(weatherDue(s(null), now)).toBe(true);
    expect(weatherDue(s({ ...EMPTY_WEATHER, date: '2000-01-01', fetchedAt: now }), now)).toBe(true);
  });
  it('불러온 지 30분이 지나면 다시 불러온다', () => {
    const w = { ...EMPTY_WEATHER, date: today(), fetchedAt: now - WEATHER_REFRESH_MS + 1000 };
    expect(weatherDue(s(w), now)).toBe(false);
    expect(weatherDue(s(w), now + 2000)).toBe(true);
  });
  it('직접 고친 날씨는 덮어쓰지 않는다', () => {
    expect(weatherDue(s({ ...EMPTY_WEATHER, date: today(), fetchedAt: 0, manual: true }), now)).toBe(false);
  });
});
