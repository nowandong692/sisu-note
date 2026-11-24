import { describe, expect, it } from 'vitest';
import { GRADES, grade, gradeByLevel, gradeOf, hitsToNext } from './grade';
import type { End, Shot } from './types';

let seq = 0;
const end = (date: string, hits: number): End => {
  seq++;
  const shots = Array.from({ length: 5 }, (_, i) => ({ hit: i < hits }) as Shot);
  return { id: `g${seq}`, date, recordedAt: seq, updatedAt: seq, bowId: null, ringId: null, arrowId: null, shots, tags: [], memo: '' };
};
/** 그날 n순을 모두 hits중으로 */
const day = (date: string, n: number, hits: number) => Array.from({ length: n }, () => end(date, hits));

describe('실력 등급', () => {
  it('15시 기준 평균으로 다섯 단계', () => {
    expect(gradeOf(0).id).toBe('wood');
    expect(gradeOf(3.9).id).toBe('wood');
    expect(gradeOf(4).id).toBe('iron');
    expect(gradeOf(7).id).toBe('bronze');
    expect(gradeOf(10).id).toBe('silver');
    expect(gradeOf(12).id).toBe('gold');
    expect(gradeOf(15).id).toBe('gold');
    expect(GRADES.map((g) => g.name)).toEqual(['나무', '무쇠', '청동', '백은', '황금']);
    expect(gradeByLevel(3)?.id).toBe('bronze');
    expect(gradeByLevel(0)).toBeNull();
    expect(gradeByLevel(null)).toBeNull();
  });

  it('30순 전에는 매기지 않고 남은 순을 알려 준다', () => {
    const r = grade(day('2026-11-01', 29, 5), '2026-11-02');
    expect(r.grade).toBeNull();
    expect(r.need).toBe(1);
    expect(r.counted).toBe(29);
  });

  it('최근 30순 평균: 한 순 평균 3중이면 15시 9중, 청동', () => {
    const r = grade([...day('2026-10-01', 30, 0), ...day('2026-11-01', 30, 3)], '2026-11-01');
    expect(r.per15).toBeCloseTo(9);
    expect(r.grade?.id).toBe('bronze');
    expect(r.holdUntil).toBeNull();
    expect(r.next?.id).toBe('silver');
    // 백은(10중)은 30순에 100중. 지금 90중이라 10중 더
    expect(hitsToNext(r)).toBe(10);
  });

  it('올라가는 것은 바로', () => {
    const r = grade([...day('2026-11-01', 30, 1), ...day('2026-11-02', 30, 4)], '2026-11-02');
    expect(r.grade?.id).toBe('gold');
    expect(r.next).toBeNull();
    expect(hitsToNext(r)).toBeNull();
  });

  it('내려가는 것은 30일 유예하고, 지나면 내려간다', () => {
    const ends = [...day('2026-11-01', 30, 4), ...day('2026-11-10', 30, 2)];
    const r = grade(ends, '2026-11-10');
    expect(r.now?.id).toBe('iron');
    expect(r.grade?.id).toBe('gold');
    expect(r.holdUntil).toBe('2026-11-30');
    expect(grade(ends, '2026-11-30').grade?.id).toBe('gold');
    const after = grade(ends, '2026-12-01');
    expect(after.grade?.id).toBe('iron');
    expect(after.holdUntil).toBeNull();
  });

  it('쉬었다고 내려가지 않는다: 마지막 날 등급을 둔다', () => {
    const r = grade(day('2026-01-01', 30, 4), '2026-11-24');
    expect(r.grade?.id).toBe('gold');
  });

  it('그날 중간 순이 아니라 그날 마지막 순까지로 본다', () => {
    // 같은 날 앞 30순 5중(황금) 뒤 30순 0중: 그날 끝에는 나무
    const r = grade([...day('2026-11-01', 30, 5), ...day('2026-11-01', 30, 0)], '2026-11-01');
    expect(r.grade?.id).toBe('wood');
  });

  it('예시 기록은 넣지 않는다', () => {
    const sample = day('2026-11-01', 30, 5).map((e) => ({ ...e, id: `sample-${e.id}` }));
    expect(grade(sample, '2026-11-01').grade).toBeNull();
  });
});
