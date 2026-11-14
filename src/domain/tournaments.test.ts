import { describe, expect, it } from 'vitest';
import { dLabel, daysUntil, isMyRange, monthGrid, onDay, periodText, shiftMonth, splitTournaments } from './tournaments';

const t = (start: string, end: string, name = 'x') => ({ id: name, name, start, end, place: '서울 황학정', url: '' });

describe('대회 일정', () => {
  it('D-day', () => {
    expect(daysUntil(t('2026-11-20', '2026-11-22'), '2026-11-14')).toBe(6);
    expect(dLabel(t('2026-11-20', '2026-11-22'), '2026-11-21')).toBe('진행 중');
    expect(dLabel(t('2026-11-01', '2026-11-03'), '2026-11-14')).toBe('끝남');
  });
  it('다가오는 대회와 지난 대회를 나눈다', () => {
    const { upcoming, past } = splitTournaments([t('2026-11-28', '2026-11-30', 'b'), t('2026-11-01', '2026-11-03', 'p'), t('2026-11-13', '2026-11-15', 'a')], '2026-11-14');
    expect(upcoming.map((x) => x.name)).toEqual(['a', 'b']);
    expect(past.map((x) => x.name)).toEqual(['p']);
  });
  it('내 활터인지', () => {
    expect(isMyRange('서울 황학정', ['황학정'])).toBe(true);
    expect(isMyRange('안성 마춤정', ['동네 활터', '황학정'])).toBe(false);
    expect(periodText(t('2026-11-20', '2026-11-22'))).toBe('11.20 ~ 11.22');
  });
  it('달력', () => {
    const g = monthGrid('2026-11');
    expect(g[0][0]).toBe('2026-11-01'); // 2026-11-01은 일요일
    expect(g.flat().filter(Boolean)).toHaveLength(30);
    expect(g.every((w) => w.length === 7)).toBe(true);
    expect(onDay([t('2026-11-20', '2026-11-22', 'a'), t('2026-11-28', '2026-11-30', 'b')], '2026-11-21').map((x) => x.name)).toEqual(['a']);
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
  });
});
