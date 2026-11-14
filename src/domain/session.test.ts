import { describe, expect, it } from 'vitest';
import { dayMinutes, daySegments, formatDuration, spanLabel, spanOf, totalMinutes } from './session';

const at = (h: number, m: number) => new Date(2026, 10, 14, h, m).getTime();

describe('습사 시간', () => {
  it('처음과 마지막 순 사이만 센다', () => {
    const s = spanOf([at(10, 5), at(9, 10), at(9, 40)])!;
    expect(s.first).toBe(at(9, 10));
    expect(s.minutes).toBe(55);
    expect(spanLabel(s)).toBe('09:10 ~ 10:05 · 55분');
  });
  it('한 순이면 0분', () => {
    const s = spanOf([at(9, 10)])!;
    expect(s.minutes).toBe(0);
    expect(spanLabel(s)).toBe('09:10 한 순');
    expect(spanOf([])).toBeNull();
    expect(spanLabel(spanOf([at(9, 10), at(9, 10) + 20000])!)).toBe('09:10 · 1분 안');
  });
  it('하루씩 따로 더한다', () => {
    const r = totalMinutes([
      { date: 'a', recordedAt: at(9, 0) }, { date: 'a', recordedAt: at(10, 30) },
      { date: 'b', recordedAt: at(18, 0) }, { date: 'b', recordedAt: at(18, 20) }, { date: 'c', recordedAt: at(7, 0) },
    ]);
    expect(r).toEqual({ days: 3, timedDays: 2, minutes: 110 });
  });
  it('시간 표기', () => {
    expect(formatDuration(45)).toBe('45분');
    expect(formatDuration(60)).toBe('1시간');
    expect(formatDuration(95)).toBe('1시간 35분');
  });
});

describe('두 활터를 오간 날', () => {
  const day = [
    { recordedAt: at(9, 0), rangeId: 'a' }, { recordedAt: at(10, 10), rangeId: 'a' },
    { recordedAt: at(14, 30), rangeId: 'b' }, { recordedAt: at(15, 40), rangeId: 'b' },
  ];
  it('활터가 바뀔 때마다 구간을 나누고 이동 시간은 빼고 더한다', () => {
    const g = daySegments(day);
    expect(g.map((x) => [x.rangeId, x.span.minutes])).toEqual([['a', 70], ['b', 70]]);
    expect(dayMinutes(day)).toBe(140);
    expect(totalMinutes(day.map((e) => ({ ...e, date: 'd' })))).toEqual({ days: 1, timedDays: 1, minutes: 140 });
  });
  it('다시 돌아온 활터는 새 구간, 활터 정보가 없으면 한 구간', () => {
    expect(daySegments([...day, { recordedAt: at(18, 0), rangeId: 'a' }]).map((x) => x.rangeId)).toEqual(['a', 'b', 'a']);
    expect(dayMinutes([{ recordedAt: at(9, 0) }, { recordedAt: at(10, 0) }])).toBe(60);
  });
});
