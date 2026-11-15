import { describe, expect, it } from 'vitest';
import { DAN_LEVELS, danAlias, danLabel, validDan } from './dan';

describe('dan', () => {
  it('1단은 초단, 9단은 신궁, 나머지는 이름 없음', () => {
    expect(danLabel(1)).toBe('1단 (초단)');
    expect(danLabel(5)).toBe('5단');
    expect(danLabel(9)).toBe('9단 (신궁)');
    expect(DAN_LEVELS.filter((l) => danAlias(l))).toEqual([1, 9]);
  });
  it('1~9 정수만 받는다', () => {
    expect(validDan(3)).toBe(3);
    expect(validDan(0)).toBeNull();
    expect(validDan(10)).toBeNull();
    expect(validDan(2.5)).toBeNull();
    expect(validDan('3')).toBeNull();
  });
});
