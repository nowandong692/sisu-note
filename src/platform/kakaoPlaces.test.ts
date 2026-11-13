import { describe, expect, it } from 'vitest';
import { looksLikeRange, rangeQueries, rankByQuery } from './kakaoPlaces';

describe('카카오 장소 중 활터 고르기', () => {
  it('카테고리나 이름에 궁도·활터·국궁이 있으면 활터', () => {
    expect(looksLikeRange({ place_name: '황학정', category_name: '스포츠,레저 > 궁도장' })).toBe(true);
    expect(looksLikeRange({ place_name: '전주 국궁장', category_name: '스포츠,레저' })).toBe(true);
    expect(looksLikeRange({ place_name: '황학정 카페', category_name: '음식점 > 카페' })).toBe(false);
  });

  it('이름이 맞는 곳 먼저, 그 안에서 가까운 순', () => {
    const geoje = { lat: 34.88, lon: 128.62 };
    const list = [
      { name: '계룡산 활터', lat: 36.3, lon: 127.2, address: '충남' },
      { name: '계룡정', lat: 36.35, lon: 127.25, address: '충남 계룡시' },
      { name: '계룡정궁도장', lat: 34.885, lon: 128.625, address: '경남 거제시' },
      { name: '계룡정궁도장', lat: 34.885, lon: 128.625, address: '경남 거제시' },
    ];
    const r = rankByQuery(list, '계룡정', geoje);
    expect(r.map((x) => x.address)).toEqual(['경남 거제시', '충남 계룡시', '충남']);
    expect(Math.round(r[0].distance! / 100)).toBe(7);
  });

  it('음식점은 이름이 비슷해도 뺀다', () => {
    expect(looksLikeRange({ place_name: '유성갈비 계룡정', category_name: '음식점 > 한식 > 육류,고기 > 갈비' })).toBe(false);
    expect(looksLikeRange({ place_name: '국궁장 앞 식당', category_name: '음식점 > 한식' })).toBe(false);
    expect(looksLikeRange({ place_name: '거제 국궁양궁장', category_name: '스포츠,레저 > 양궁장' })).toBe(false);
    expect(looksLikeRange({ place_name: '시민 양궁장', category_name: '스포츠,레저 > 궁도장' })).toBe(false);
  });

  it('"계룡정"만 쳐도 붙여 쓴 "계룡정궁도장"을 찾는다', () => {
    expect(rangeQueries('계룡정')).toContain('계룡정궁도장');
    expect(rangeQueries('계룡정궁도장')).toEqual(['계룡정궁도장']);
  });
});
