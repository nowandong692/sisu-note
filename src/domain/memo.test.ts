import { describe, expect, it } from 'vitest';
import { searchMemos, splitByTerms } from './memo';
import type { End } from './types';

const end = (id: string, date: string, at: number, memo: string, tags: string[] = []): End =>
  ({ id, date, recordedAt: at, bowId: 'b1', ringId: null, arrowId: null, shots: [], tags, memo, updatedAt: 0 });
const name = (id: string | null) => (id === 'b1' ? '검은 활' : '미지정');

describe('메모 모아보기', () => {
  const ends = [
    end('a', '2026-11-01', 1, '만작을 길게 가져가니 좋았음'),
    end('b', '2026-11-01', 2, ''),
    end('c', '2026-11-01', 3, '줌손이 흔들림', ['줌손']),
    end('d', '2026-11-05', 1, '', ['호흡']),
  ];

  it('메모나 태그가 있는 순만, 최근 것부터, 그날 몇 번째 순인지와 함께', () => {
    expect(searchMemos(ends, '', null, name).map((h) => [h.end.id, h.index])).toEqual([['d', 1], ['c', 3], ['a', 1]]);
  });

  it('검색어는 모두 들어 있어야 하고 태그·장비 별명에서도 찾는다', () => {
    expect(searchMemos(ends, '만작 좋았', null, name).map((h) => h.end.id)).toEqual(['a']);
    expect(searchMemos(ends, '#호흡', null, name).map((h) => h.end.id)).toEqual(['d']);
    expect(searchMemos(ends, '검은', null, name)).toHaveLength(3);
    expect(searchMemos(ends, '', '줌손', name).map((h) => h.end.id)).toEqual(['c']);
  });

  it('맞은 부분을 나눈다', () => {
    expect(splitByTerms('줌손이 흔들림', '흔들')).toEqual(['줌손이 ', '흔들', '림']);
  });
});
