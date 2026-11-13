import { describe, expect, it } from 'vitest';
import { byWeather, tempBand, monthlyStats, byBowAndRing, byGear, hitDistribution, missBreakdown, shotPositionRates, summarize, weekStart, weeklyTrend } from './stats';
import { endsToCsv } from './csv';
import { sampleData } from './sample';
import type { End, Shot } from './types';

const H: Shot = { hit: true, x: null, y: null, zone: null, side: null, level: null, direction: null };
const M = (direction: Shot['direction'], level: 1 | 2 = 1): Shot => ({ hit: false, x: 0, y: 0, zone: null, side: 'right', level, direction });

function end(date: string, shots: Shot[], bowId = 'b1', ringId = 'r1'): End {
  return { id: Math.random().toString(), date, recordedAt: 0, bowId, ringId, arrowId: null, shots, tags: [], memo: '', updatedAt: 0 };
}

describe('통계', () => {
  const ends = [
    end('2026-11-02', [H, H, H, H, H]),
    end('2026-11-03', [H, M('앞남'), H, M('뒤남', 2), H]),
    end('2026-11-10', [M('넘음'), M('짧음'), H, H, M('앞남', 2)], 'b2', 'r2'),
  ];

  it('요약: 순, 중, 순당 평균, 중률, 몰기', () => {
    expect(summarize(ends)).toEqual({ ends: 3, hits: 10, perEnd: 10 / 3, rate: 10 / 15, perfect: 1 });
    expect(summarize([])).toMatchObject({ ends: 0, perEnd: 0, rate: 0 });
  });

  it('주 시작은 월요일', () => {
    expect(weekStart('2026-11-12')).toBe('2026-11-09');
    expect(weekStart('2026-11-09')).toBe('2026-11-09');
    expect(weekStart('2026-11-08')).toBe('2026-11-02');
    expect(weeklyTrend(ends).map((w) => w.week)).toEqual(['2026-11-02', '2026-11-09']);
  });

  it('월별 통계: 습사일 수와 순당 평균, 최근 달이 먼저', () => {
    const rows = monthlyStats([...ends, end('2026-10-30', [H, H, H, M('짧음'), M('짧음')])]);
    expect(rows.map((r) => r.month)).toEqual(['2026-11', '2026-10']);
    expect(rows[0]).toMatchObject({ days: 3, ends: 3, hits: 10, perfect: 1 });
    expect(rows[1]).toMatchObject({ days: 1, ends: 1, perEnd: 3 });
  });

  it('중 수 분포와 시 위치별 중률', () => {
    expect(hitDistribution(ends)).toEqual([0, 0, 1, 1, 0, 1]);
    expect(shotPositionRates(ends)).toEqual([2 / 3, 1 / 3, 1, 2 / 3, 2 / 3]);
  });

  it('불 방향은 조금·많이로 나눈다', () => {
    const m = missBreakdown(ends);
    expect(m.total).toBe(5);
    expect(m.byDir['앞남']).toEqual({ 1: 1, 2: 1 });
    expect(m.byDir['뒤남']).toEqual({ 1: 0, 2: 1 });
  });

  it('장비별 비교는 표본이 적으면 순위에서 뺀다', () => {
    const rows = byGear(ends, 'bow');
    expect(rows.every((r) => !r.enough)).toBe(true);
    expect(byBowAndRing(ends).map((r) => r.key)).toContain('b2|r2');
  });

  it('날씨별 비교는 그 항목을 남긴 순만 센다', () => {
    const w = (wind: '약함' | '강함', temp: number | null) => ({ sky: null, temp, wind, windDir: null });
    const list = [
      { ...end('2026-11-02', [H, H, H, H, H]), weather: w('약함', 12) },
      { ...end('2026-11-03', [H, M('앞남'), H, H, H]), weather: w('강함', -2) },
      end('2026-11-04', [H, H, M('짧음'), H, H]),
    ];
    expect(byWeather(list, 'wind').map((r) => [r.key, r.ends])).toEqual([['약함', 1], ['강함', 1]]);
    expect(byWeather(list, 'sky')).toEqual([]);
    expect(byWeather(list, 'temp').map((r) => r.key).sort()).toEqual(['10~19°', '영하']);
    expect(tempBand(null)).toBe('');
  });

  it('예시 데이터는 매번 같은 기록을 만든다', () => {
    const now = new Date(2026, 10, 12);
    const a = sampleData(now), b = sampleData(now);
    expect(a.ends.length).toBe(b.ends.length);
    expect(a.ends.length).toBeGreaterThan(50);
    expect(a.ends.map((e) => e.shots.map((s) => s.hit))).toEqual(b.ends.map((e) => e.shots.map((s) => s.hit)));
  });

  it('CSV는 별명과 시별 결과를 담는다', () => {
    const csv = endsToCsv(ends, [{ id: 'b1', category: 'bow', nickname: '검은 활, 45호', startedOn: '', archived: false, updatedAt: 0 }]);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('날짜,활터,활,깍지,화살,중,1시,2시,3시,4시,5시,날씨,기온,바람,태그,메모');
    expect(lines[1]).toContain('"검은 활, 45호"');
    expect(lines[2]).toContain('뒤남(많이)');
  });
});
