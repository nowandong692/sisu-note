import { describe, expect, it } from 'vitest';
import { scopeLabel } from './adminScope';

describe('scopeLabel', () => {
  it('범위마다 읽는 말', () => {
    expect(scopeLabel('all')).toBe('모든 기록');
    expect(scopeLabel('end', '2026-11-15', 2)).toBe('11월 15일 2순');
    expect(scopeLabel('day', '2026-11-15')).toBe('11월 15일 하루');
    // 2026-11-15는 일요일: 그 주는 11월 9일(월) ~ 15일(일)
    expect(scopeLabel('week', '2026-11-15')).toBe('11월 9일 ~ 11월 15일 한 주');
    expect(scopeLabel('week', '2026-12-30')).toBe('12월 28일 ~ 1월 3일 한 주');
    expect(scopeLabel('month', '2026-11-15')).toBe('2026년 11월 한 달');
  });
});
