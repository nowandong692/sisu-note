import { describe, expect, it } from 'vitest';
import { appLinks, nowStamp, regPeriodText, regState, videosFor, dLabel, daysUntil, isMyRange, monthGrid, onDay, periodText, shiftMonth, splitTournaments } from './tournaments';

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
  it('대회와 중계 영상을 잇는다', () => {
    const tour = { id: '1', name: '제2회 용인특례시 전통 궁도대회', start: '2026-09-05', end: '2026-09-06', place: '용인 용무정', url: '' };
    const vids = [
      { id: 'a', title: '제2회 용인특례시 전통 궁도대회 - 1일차', published: '2026-09-05T07:25:46+00:00', url: '' },
      { id: 'b', title: '제2회 용인특례시 전통 궁도대회 - 2일차', published: '2026-09-06T02:54:43+00:00', url: '' },
      { id: 'c', title: '제190회 전국남녀궁도승단대회 - 1일차', published: '2026-09-05T10:00:00+00:00', url: '' },
      { id: 'd', title: '제2회 용인특례시 전통 궁도대회', published: '2027-09-05T10:00:00+00:00', url: '' },
    ];
    expect(videosFor(tour, vids).map((v) => v.id)).toEqual(['a', 'b']);
  });
});

describe('접수 상태', () => {
  const reg = { open: '2026-11-18T13:00', close: '2026-11-22T17:00', via: '15시15중 앱' };
  it('시작 전', () => {
    expect(regState(reg, '2026-11-14T20:00')).toEqual({ kind: 'soon', label: '접수 D-4' });
    expect(regState(reg, '2026-11-17T09:00').label).toBe('내일 13:00 접수 시작');
    expect(regState(reg, '2026-11-18T12:59').label).toBe('오늘 13:00 접수 시작');
  });
  it('접수 중과 마감', () => {
    expect(regState(reg, '2026-11-18T13:00')).toEqual({ kind: 'open', label: '접수 중 · 11.22(일) 17:00 마감' });
    expect(regState(reg, '2026-11-22T09:00').label).toBe('접수 중 · 오늘 17:00 마감');
    expect(regState(reg, '2026-11-22T17:00').kind).toBe('closed');
  });
  it('기간 글과 지금 시각', () => {
    expect(regPeriodText(reg)).toBe('11.18(수) 13:00 ~ 11.22(일) 17:00');
    expect(nowStamp(new Date(2026, 10, 14, 9, 5))).toBe('2026-11-14T09:05');
  });
  it('접수 앱 주소', () => {
    expect(appLinks('15시15중 앱')?.android).toContain('kr.softfarm.www.a1515');
    expect(appLinks('활로145 앱')?.ios).toContain('id6808953077');
    expect(appLinks('이메일')).toBeNull();
  });
});
