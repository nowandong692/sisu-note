import { describe, expect, it } from 'vitest';
import { contactUrl, isClubPlace, isMyClub, mapLinks, mapQuery, searchHwalter, type Hwalter } from './hwalter';

const H: Hwalter[] = [
  { id: '1', name: '황학정', region: '서울', address: '서울특별시 종로구 사직로9길 15-32' },
  { id: '46', name: '가평군 보납정', region: '경기', address: '경기도 가평군 가평읍 문화로 131' },
  { id: '3', name: '살곶이정', region: '서울', address: '서울특별시 성동구 용답동 241-10(우편물 : 서울시 동대문구 천호대로97길 54)' },
];

describe('활터 검색', () => {
  it('이름, 주소, 띄어쓰기 무시, 여러 낱말', () => {
    expect(searchHwalter(H, '황학', null).map((h) => h.id)).toEqual(['1']);
    expect(searchHwalter(H, '가평 보납', null).map((h) => h.id)).toEqual(['46']);
    expect(searchHwalter(H, '가평군보납정', null).map((h) => h.id)).toEqual(['46']);
    expect(searchHwalter(H, '종로구', null).map((h) => h.id)).toEqual(['1']);
    expect(searchHwalter(H, '', '서울').map((h) => h.name)).toEqual(['살곶이정', '황학정']);
    expect(searchHwalter(H, '', null).map((h) => h.name)).toEqual(['살곶이정', '황학정', '가평군 보납정']);
    expect(searchHwalter(H, '보납', '서울')).toEqual([]);
  });
  it('연락처와 지도 연결', () => {
    expect(contactUrl({ region: '경기' })).toBe('http://kungdo.or.kr/?mcd=4030&area=9');
    expect(contactUrl({ region: '' })).toBe('http://kungdo.or.kr/?mcd=4030');
    expect(mapQuery(H[2])).toBe('서울특별시 성동구 용답동 241-10');
    expect(mapLinks(H[0]).naver).toContain(encodeURIComponent('서울특별시 종로구'));
  });
});

describe('내 소속', () => {
  it('골라 둔 소속은 번호로, 직접 적은 소속은 이름으로', () => {
    expect(isMyClub(H[1], { name: '보납정', hwalterId: '46' })).toBe(true);
    expect(isMyClub(H[0], { name: '보납정', hwalterId: '46' })).toBe(false);
    expect(isMyClub(H[1], { name: '보납정' })).toBe(true);
    expect(isMyClub(H[1], null)).toBe(false);
  });
  it('대회 장소가 내 소속인지', () => {
    expect(isClubPlace('가평 보납정', { name: '가평군 보납정' })).toBe(true);
    expect(isClubPlace('함평 관덕정', { name: '남원 관덕정' })).toBe(false);
    expect(isClubPlace('남원 관덕정', { name: '남원 관덕정' })).toBe(true);
    expect(isClubPlace('서울 황학정', { name: '황학정' })).toBe(true);
    expect(isClubPlace('서울 황학정', null)).toBe(false);
  });
});
