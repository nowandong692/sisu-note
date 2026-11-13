import { describe, expect, it } from 'vitest';
import { looksLikeRange } from './kakaoPlaces';

describe('카카오 장소 중 활터 고르기', () => {
  it('카테고리나 이름에 궁도·활터·국궁이 있으면 활터', () => {
    expect(looksLikeRange({ place_name: '황학정', category_name: '스포츠,레저 > 궁도장' })).toBe(true);
    expect(looksLikeRange({ place_name: '전주 국궁장', category_name: '스포츠,레저' })).toBe(true);
    expect(looksLikeRange({ place_name: '황학정 카페', category_name: '음식점 > 카페' })).toBe(false);
  });
});
