import { describe, expect, it } from 'vitest';
import { addTag, cleanTag, moveTag, myTags, removeTag, restoreDefaults, tagChoices, tagProblem, tagUseCount } from './tags';
import { DEFAULT_SETTINGS, MEMO_TAGS, type End } from './types';

const end = (tags: string[]): End => ({ id: Math.random().toString(), date: '2026-11-16', recordedAt: 0, bowId: null, ringId: null, arrowId: null, shots: [], tags, memo: '', updatedAt: 0 });

describe('메모 태그', () => {
  it('손대지 않았으면 기본 태그, 고쳤으면 내 목록', () => {
    expect(myTags(DEFAULT_SETTINGS)).toEqual(MEMO_TAGS);
    expect(myTags({ ...DEFAULT_SETTINGS, memoTags: [] })).toEqual([]);
  });
  it('#과 공백을 지우고 다듬는다', () => {
    expect(cleanTag(' #발 디딤 ')).toBe('발디딤');
  });
  it('빈 이름, 긴 이름, 겹치는 이름은 막는다', () => {
    expect(tagProblem('  ', [])).toBeTruthy();
    expect(tagProblem('가'.repeat(11), [])).toBeTruthy();
    expect(tagProblem('#줌손', MEMO_TAGS)).toBe('이미 있는 태그입니다.');
    expect(tagProblem('Grip', ['grip'])).toBe('이미 있는 태그입니다.');
    expect(tagProblem('발디딤', MEMO_TAGS)).toBeNull();
    expect(addTag(MEMO_TAGS, '줌손')).toBe(MEMO_TAGS);
    expect(addTag(['줌손'], '발 디딤')).toEqual(['줌손', '발디딤']);
  });
  it('지우기, 옮기기, 기본 되살리기', () => {
    expect(removeTag(['a', 'b'], 'a')).toEqual(['b']);
    expect(moveTag(['a', 'b', 'c'], 'c', -1)).toEqual(['a', 'c', 'b']);
    expect(moveTag(['a', 'b'], 'a', -1)).toEqual(['a', 'b']);
    expect(restoreDefaults(['발디딤', '호흡'])).toEqual(['발디딤', '호흡', '줌손', '깍지손', '만작', '시선', '바람']);
  });
  it('쓴 순을 세고, 목록에서 지운 태그도 고치는 순에는 보인다', () => {
    expect(tagUseCount([end(['줌손']), end(['줌손', '호흡']), end([])], '줌손')).toBe(2);
    expect(tagChoices(['호흡'], ['줌손', '호흡'])).toEqual(['호흡', '줌손']);
  });
});
