import { describe, expect, it } from 'vitest';
import { cleanNickname, nicknameProblem, sameNickname } from './nickname';

describe('닉네임', () => {
  it('앞뒤 공백을 지우고 가운데 공백은 한 칸으로 줄인다', () => {
    expect(cleanNickname('  바람   타는  활 ')).toBe('바람 타는 활');
  });
  it('풀어 쓴 한글 자모를 하나로 맞춘다', () => {
    expect(cleanNickname('홍길동'.normalize('NFD'))).toBe('홍길동');
  });
  it('비었거나 12글자를 넘으면 쓸 수 없다', () => {
    expect(nicknameProblem('   ')).toBe('닉네임을 정해 주세요.');
    expect(nicknameProblem('가'.repeat(13))).toMatch(/12글자/);
    expect(nicknameProblem('가'.repeat(12))).toBeNull();
  });
  it('대소문자와 공백 차이는 같은 닉네임으로 본다', () => {
    expect(sameNickname('Arrow King', ' arrow  king')).toBe(true);
    expect(sameNickname('활쟁이', '활쟁이2')).toBe(false);
  });
});
