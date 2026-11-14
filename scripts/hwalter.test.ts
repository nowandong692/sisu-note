import { describe, expect, it } from 'vitest';
// @ts-expect-error 빌드 스크립트(.mjs)라 타입 선언이 없다
import { parseHwalter, regionOf } from './hwalter.mjs';

const PAGE = `<table class="table-striped"><thead><tr><th>고유번호</th><th>사정명</th><th>주소</th><th>사두</th><th>연락처</th></tr></thead><tbody>
	<tr>
		<td align="right">1</td>
		<td align="center"><a href="#" data-toggle="modal" data-target="#Modal1">황학정</a></td>
		<td>서울특별시 종로구 사직로9길 15-32</td>
		<td align="center">홍길동</td>
		<td>02-000-0000</td>
	</tr>
	<tr>
		<td align="right">46</td>
		<td align="center"><a href="#">가평군 보납정</a></td>
		<td>경기도 가평군 가평읍 문화로 131</td>
		<td align="center">김아무개</td>
		<td>010-0000-0000<br>031-000-0000</td>
	</tr>
	<tr><td align="right">300</td><td>남원 관덕정</td><td>전북특별자치도 남원시 어딘가 1 &amp; 2</td><td></td><td></td></tr>
</tbody></table>`;

describe('parseHwalter', () => {
  it('이름·지역·주소만 뽑고 사두·연락처는 버린다', () => {
    const r = parseHwalter(PAGE);
    expect(r).toEqual([
      { id: '1', name: '황학정', region: '서울', address: '서울특별시 종로구 사직로9길 15-32' },
      { id: '46', name: '가평군 보납정', region: '경기', address: '경기도 가평군 가평읍 문화로 131' },
      { id: '300', name: '남원 관덕정', region: '전북', address: '전북특별자치도 남원시 어딘가 1 & 2' },
    ]);
    expect(JSON.stringify(r)).not.toMatch(/홍길동|010-|02-000/);
  });
  it('지역을 주면 그 지역으로', () => {
    expect(parseHwalter(PAGE, '경기')[0].region).toBe('경기');
  });
  it('주소로 시도 정하기', () => {
    expect(regionOf('전라남도 함평군')).toBe('전남');
    expect(regionOf('충청북도 청주시')).toBe('충북');
    expect(regionOf('경상남도 남해군')).toBe('경남');
    expect(regionOf('강원특별자치도 춘천시')).toBe('강원');
    expect(regionOf('어딘가')).toBe('');
  });
});
