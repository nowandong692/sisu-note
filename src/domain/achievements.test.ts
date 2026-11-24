import { describe, expect, it } from 'vitest';
import { achievements, earnedLine, titleName, achievementName, myRankResult, newlyEarned, newlyRepeated, rankPeriodsToFetch } from './achievements';
import { sampleData } from './sample';
import type { End, Shot } from './types';

let seq = 0;
const end = (date: string, pattern: string, extra: Partial<End> = {}): End => {
  seq++;
  const shots = [...pattern].map((c) => ({ hit: c === 'o' }) as Shot);
  return { id: `e${seq}`, date, recordedAt: seq, updatedAt: seq, bowId: null, ringId: null, arrowId: null, shots, tags: [], memo: '', ...extra };
};
const got = (ends: End[]) => {
  const r = achievements(ends);
  return Object.fromEntries(r.list.filter((a) => a.date).map((a) => [a.id, `${a.date}#${a.endNo}`]));
};

describe('업적', () => {
  it('기록이 없으면 아무것도 없다', () => {
    expect(got([])).toEqual({});
  });

  it('집궁과 첫 k중: k중 이상을 처음 쏜 순', () => {
    const g = got([end('2026-11-01', 'xxxxx'), end('2026-11-01', 'oxxxx'), end('2026-11-02', 'oxoxo')]);
    expect(g.jipgung).toBe('2026-11-01#1');
    expect(g.hit1).toBe('2026-11-01#2');
    expect(g.hit2).toBe('2026-11-02#1');
    expect(g.hit3).toBe('2026-11-02#1');
    expect(g.hit4).toBeUndefined();
    expect(g.chomolgi).toBeUndefined();
  });

  it('연중은 순을 넘어 잇고, 날이 바뀌면 끊는다', () => {
    const r = achievements([end('2026-11-01', 'xxooo'), end('2026-11-01', 'ooxxx'), end('2026-11-02', 'oooxx')]);
    expect(r.bestStreak).toBe(5);
    const g = got([end('2026-11-01', 'xxooo'), end('2026-11-01', 'ooxxx'), end('2026-11-02', 'oooo' + 'x')]);
    expect(g.streak5).toBe('2026-11-01#2');
    expect(g.streak6).toBeUndefined();
  });

  it('접장(첫 몰기)과 3연몰 (15시 15중)', () => {
    const ends = [end('2026-11-03', 'ooooo'), end('2026-11-03', 'ooooo'), end('2026-11-03', 'ooooo'), end('2026-11-03', 'oxooo')];
    const r = achievements(ends);
    const g = got(ends);
    expect(g.chomolgi).toBe('2026-11-03#1');
    expect(g.molgi2).toBe('2026-11-03#2');
    expect(g.molgi3).toBe('2026-11-03#3');
    expect(g.streak15).toBe('2026-11-03#3');
    expect(g.streak16).toBe('2026-11-03#4');
    expect(g.streak17).toBeUndefined();
    expect(r.bestMolgi).toBe(3);
    expect(r.list.filter((a) => a.special).map((a) => a.name)).toEqual(['접장', '3연몰', '6연몰', '9연몰', '12연몰', '15연몰', '18연몰', '백발백중']);
  });

  it('예시 기록은 넣지 않는다', () => {
    const s = sampleData(new Date('2026-11-15T12:00:00'));
    expect(achievements(s.ends).counted).toBe(0);
    expect(got([...s.ends, end('2026-11-15', 'oxxxx')]).jipgung).toBe('2026-11-15#1');
  });

  it('새로 이룬 업적을 한 줄로 알린다', () => {
    const before = achievements([end('2026-11-01', 'ooooo')]);
    const after = achievements([...[end('2026-11-01', 'ooooo')], end('2026-11-02', 'ooooo'), end('2026-11-02', 'ooooo'), end('2026-11-02', 'ooooo')]);
    // before의 id가 다르므로 순서로만 비교하지 않고, 업적 id로 견준다
    const earned = newlyEarned(before, after);
    expect(earned.some((a) => a.id === 'molgi3')).toBe(true);
    expect(earnedLine(earned)).toMatch(/^업적 3연몰 외 \d+개$/);
    expect(earnedLine([])).toBe('');
  });

  it('20연몰은 백발백중', () => {
    const ends = Array.from({ length: 20 }, () => end('2026-11-05', 'ooooo'));
    const r = achievements(ends);
    const a = r.list.find((x) => x.id === 'molgi20')!;
    expect(a.name).toBe('백발백중');
    expect(a.special).toBe(true);
    expect(a.endNo).toBe(20);
    expect(r.bestStreak).toBe(100);
  });

  it('랭킹 업적: 이른 기간이 날짜가 되고 횟수를 센다', () => {
    const r = achievements([end('2026-11-01', 'oxxxx')], {
      'week:2026-11-09': { place: 1, volume: 1 },
      'week:2026-11-02': { place: 2, volume: 3 },
      'day:2026-11-03': { place: 0, volume: null },
    });
    const by = Object.fromEntries(r.list.filter((a) => a.group === 'rank').map((a) => [a.id, a]));
    expect(by['rank-in'].date).toBe('2026-11-02');
    expect(by['rank-in'].times).toBe(3);
    expect(by['rank-day-top3'].date).toBeUndefined();
    expect(by['rank-week-top3'].label).toBe('2026년 11월 2일 주');
    expect(by['rank-week-top3'].times).toBe(2);
    expect(by['rank-week-1'].date).toBe('2026-11-09');
    expect(by['rank-week-vol'].date).toBe('2026-11-09');
    expect(by['rank-month-1'].date).toBeUndefined();
  });

  it('받아 올 랭킹 기간: 참여 뒤, 끝난 기간, 아직 받지 않은 것만', () => {
    const joined = new Date('2026-10-30T09:00:00').getTime();
    const ends = [end('2026-10-29', 'ooooo'), end('2026-11-03', 'ooooo'), end('2026-11-14', 'ooooo'), end('2026-11-15', 'ooooo')];
    const todo = rankPeriodsToFetch(ends, joined, '2026-11-15', { 'day:2026-11-03': { place: null, volume: null } })
      .map((x) => `${x.period}:${x.start}`);
    expect(todo).toEqual(['week:2026-11-02', 'day:2026-11-14']);
  });

  it('서버 합계에서 내 순위', () => {
    const t = (name: string, ends: number, hits: number, me = false) => ({ name, ends, hits, seq: [], me });
    expect(myRankResult([t('a', 3, 12), t('나', 3, 14, true), t('b', 5, 5)], 'day')).toEqual({ place: 1, volume: 2 });
    expect(myRankResult([t('a', 3, 12), t('나', 1, 5, true)], 'day')).toEqual({ place: null, volume: 2 });
  });

  it('누적 습사량과 몰기 횟수', () => {
    const ends = [
      ...Array.from({ length: 60 }, () => end('2026-11-01', 'oxxxx')),
      ...Array.from({ length: 40 }, (_, i) => end('2026-11-02', i % 4 === 0 ? 'ooooo' : 'xxxxx')),
    ];
    const r = achievements(ends);
    const g = got(ends);
    expect(r.totalEnds).toBe(100);
    expect(r.totalMolgi).toBe(10);
    expect(g.ends100).toBe('2026-11-02#40');
    expect(g.ends500).toBeUndefined();
    expect(g.molgicount10).toBe('2026-11-02#37');
    expect(r.list.find((a) => a.id === 'ends1000')!.name).toBe('천순');
  });

  it('꾸준함: 연속 습사일과 한 달 20일', () => {
    const days = (from: number, n: number, month = '2026-10') => Array.from({ length: n }, (_, i) => end(`${month}-${String(from + i).padStart(2, '0')}`, 'oxxxx'));
    // 10월 1~7일 연속, 하루 쉬고 9~30일 연속(22일)
    const ends = [...days(1, 7), ...days(9, 22)];
    const r = achievements(ends, {}, '2026-10-31');
    const g = got(ends);
    expect(g.dayrun7).toBe('2026-10-07#1');
    expect(g.dayrun30).toBeUndefined();
    expect(g.month20).toBe('2026-10-21#1');
    expect(r.bestDayRun).toBe(22);
    expect(r.dayRun).toBe(22);
    expect(r.monthDays).toBe(29);
    // 이틀 지나면 지금 연속은 끊긴 것으로, 달이 바뀌면 이번 달은 0
    const later = achievements(ends, {}, '2026-11-02');
    expect(later.dayRun).toBe(0);
    expect(later.monthDays).toBe(0);
    // 달을 넘어 이어지는 연속
    expect(got([...days(25, 7, '2026-10'), ...days(1, 1, '2026-11')]).dayrun7).toBe('2026-10-31#1');
  });

  it('도전: 하루 10순, 조건 몰기, 활터 수', () => {
    const ends = [
      end('2026-11-01', 'ooooo', { weather: { sky: '맑음', temp: 10, wind: '강함', windDir: null }, rangeId: 'g1' }),
      end('2026-11-01', 'oooxx', { rangeId: 'g1' }),
      end('2026-11-01', 'ooxxx', { rangeId: 'g2' }),
      end('2026-11-02', 'ooooo', { weather: { sky: '비', temp: 10, wind: '없음', windDir: null }, bowId: 'b2', rangeId: 'g3' }),
      ...Array.from({ length: 9 }, () => end('2026-11-03', 'xxxxx')),
      end('2026-11-03', 'ooooo', { bowId: 'b1' }),
    ];
    const r = achievements(ends, {}, '2026-11-03', [{ id: 'b1', bowType: '각궁' }, { id: 'b2', bowType: '개량궁' }]);
    const g = Object.fromEntries(r.list.filter((a) => a.date).map((a) => [a.id, `${a.date}#${a.endNo}`]));
    expect(g.windmolgi).toBe('2026-11-01#1');
    expect(g.rainmolgi).toBe('2026-11-02#1');
    expect(g.gakgungmolgi).toBe('2026-11-03#10');
    expect(g.dayends10).toBe('2026-11-03#10');
    expect(g.ranges3).toBe('2026-11-02#1');
    expect(g.ranges5).toBeUndefined();
    // 15시 10중 업적은 뺐다 (15시 15중은 3연몰)
    expect(r.list.some((a) => a.id === 'fifteen10')).toBe(false);
  });

  it('우중의 궁사: 비·눈 오는 날 습사 (몰기가 아니어도)', () => {
    const g = got([end('2026-11-01', 'xxxxx', { weather: { sky: '흐림', temp: 5, wind: null, windDir: null } }),
      end('2026-11-02', 'oxxxx', { weather: { sky: '눈', temp: -1, wind: null, windDir: null } })]);
    expect(g.rainday).toBe('2026-11-02#1');
    expect(g.rainmolgi).toBeUndefined();
  });

  it('새벽을 여는 활: 그날 오전 6시 전에 저장한 순만', () => {
    const at = (date: string, h: number) => new Date(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10), h, 30).getTime();
    expect(got([end('2026-11-01', 'xxxxx', { recordedAt: at('2026-11-01', 6) })]).dawn).toBeUndefined();
    expect(got([end('2026-11-01', 'xxxxx', { recordedAt: at('2026-11-01', 5) })]).dawn).toBe('2026-11-01#1');
    // 지난 날 기록을 나중에 넣은 순은 저장 시각이 그날이 아니라서 들지 않는다
    expect(got([end('2026-11-01', 'xxxxx', { recordedAt: at('2026-11-03', 5) })]).dawn).toBeUndefined();
  });

  it('대표 칭호: 이룬 업적만 이름을 준다', () => {
    const r = achievements([end('2026-11-01', 'ooooo')]);
    expect(titleName(r.list, 'chomolgi')).toBe('접장');
    expect(titleName(r.list, 'molgi3')).toBeNull();
    expect(titleName(r.list, 'nope')).toBeNull();
    // 뺀 업적을 칭호로 달았던 사람은 칭호가 보이지 않는다
    expect(titleName(r.list, 'fifteen10')).toBeNull();
    expect(achievementName('fifteen10')).toBeNull();
    expect(titleName(r.list, null)).toBeNull();
    expect(achievementName('molgi20')).toBe('백발백중');
    expect(achievementName('<script>')).toBeNull();
  });

  it('반복 횟수: 몰기류는 순마다, 하루 단위는 날마다, 한 달 20일은 달마다', () => {
    const rain = { sky: '비', temp: 10, wind: '강함', windDir: null } as const;
    const ends = [
      end('2026-10-01', 'ooooo', { weather: rain }), end('2026-10-01', 'ooooo', { weather: rain }), end('2026-10-01', 'xxxxx', { weather: rain }),
      end('2026-10-01', 'ooooo'), end('2026-10-01', 'ooooo'),
      end('2026-10-02', 'ooooo', { weather: rain }),
      ...Array.from({ length: 12 }, () => end('2026-10-03', 'xxxxx')),
      ...Array.from({ length: 10 }, () => end('2026-10-04', 'xxxxx')),
    ];
    const r = achievements(ends);
    const t = (id: string) => r.list.find((a) => a.id === id)!;
    expect(t('chomolgi').times).toBe(5);
    expect(t('chomolgi').date).toBe('2026-10-01');
    expect(t('chomolgi').lastDate).toBe('2026-10-02');
    expect(t('windmolgi').times).toBe(3);
    expect(t('rainmolgi').times).toBe(3);
    expect(t('rainday').times).toBe(2);
    expect(t('molgi2').times).toBe(2);
    expect(t('molgi3').times).toBeUndefined();
    expect(t('dayends10').times).toBe(2);
    expect(t('dayends10').lastDate).toBe('2026-10-04');
    // 세지 않는 업적은 횟수가 없다
    expect(t('jipgung').times).toBeUndefined();
    expect(t('hit1').times).toBeUndefined();
    expect(t('streak2').times).toBeUndefined();
    expect(t('ends100').times).toBeUndefined();
  });

  it('한 달 20일은 달마다 한 번', () => {
    const days = (m: string) => Array.from({ length: 21 }, (_, i) => end(`2026-${m}-${String(i + 1).padStart(2, '0')}`, 'xxxxx'));
    const r = achievements([...days('09'), ...days('10')]);
    const a = r.list.find((x) => x.id === 'month20')!;
    expect(a.times).toBe(2);
    expect(a.lastDate).toBe('2026-10-20');
  });

  it('또 이룬 업적은 한 줄 알림에 횟수로', () => {
    const first = [end('2026-11-01', 'ooooo'), end('2026-11-01', 'xxxxx')];
    const before = achievements(first);
    const after = achievements([...first, end('2026-11-02', 'ooooo')]);
    const earned = newlyEarned(before, after);
    const repeated = newlyRepeated(before, after);
    expect(earned).toEqual([]);
    expect(repeated.map((a) => a.id)).toEqual(['chomolgi']);
    expect(earnedLine(earned, repeated)).toBe('업적 접장 ×2');
    // 새로 이룬 업적이 있으면 그것을 먼저 알린다
    const more = achievements([...first, end('2026-11-02', 'ooooo'), end('2026-11-02', 'ooooo')]);
    const after2 = achievements([...first, end('2026-11-02', 'ooooo')]);
    expect(earnedLine(newlyEarned(after2, more), newlyRepeated(after2, more))).toMatch(/^업적 2연몰( 외 \d+개)?$/);
  });
});
