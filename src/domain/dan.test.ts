import { describe, expect, it } from 'vitest';
import { DAN_LEVELS, danAlias, danFlowers, danLabel, danShort, topDan, validDan } from './dan';

describe('dan', () => {
  it('1단은 초단, 9단은 신궁, 나머지는 이름 없음', () => {
    expect(danLabel(1)).toBe('1단 (초단)');
    expect(danLabel(5)).toBe('5단');
    expect(danLabel(9)).toBe('9단 (신궁)');
    expect(DAN_LEVELS.filter((l) => danAlias(l))).toEqual([1, 9]);
  });
  it('짧은 이름과 가장 높은 단', () => {
    expect(danShort(1)).toBe('초단');
    expect(danShort(4)).toBe('4단');
    expect(danShort(9)).toBe('신궁');
    expect(topDan({ 대한궁도협회: 2, 궁도스포츠클럽: 5 })).toBe(5);
    expect(topDan({})).toBeNull();
    expect(topDan(undefined)).toBeNull();
  });
  it('1~9 정수만 받는다', () => {
    expect(validDan(3)).toBe(3);
    expect(validDan(0)).toBeNull();
    expect(validDan(10)).toBeNull();
    expect(validDan(2.5)).toBeNull();
    expect(validDan('3')).toBeNull();
  });
});

describe('danFlowers', () => {
  it('1~4단은 위에, 5~8단은 아래에 더하고, 9단은 홍심까지', () => {
    expect(danFlowers(null)).toEqual({ top: 0, bottom: 0, center: false });
    expect(danFlowers(1)).toEqual({ top: 1, bottom: 0, center: false });
    expect(danFlowers(4)).toEqual({ top: 4, bottom: 0, center: false });
    expect(danFlowers(5)).toEqual({ top: 4, bottom: 1, center: false });
    expect(danFlowers(8)).toEqual({ top: 4, bottom: 4, center: false });
    expect(danFlowers(9)).toEqual({ top: 4, bottom: 4, center: true });
  });
  it('1~9 정수가 아니면 꽃을 달지 않는다', () => {
    for (const v of [0, 10, 2.5, -1]) expect(danFlowers(v)).toEqual({ top: 0, bottom: 0, center: false });
  });
});
