import { describe, expect, it } from 'vitest';
import { changedRecordIds, endFromRanked, mergeRecords, recordIdsOf, restoreMessage, splitRecordQueue, type RankedEnd } from './recordBackup';
import type { DayNote, End, Shot } from './types';

const shot = (hit: boolean): Shot => ({ hit, x: 10, y: 20, zone: null, side: null, level: null, direction: null });
const end = (id: string, date: string, at: number, extra: Partial<End> = {}): End => ({
  id, date, recordedAt: at, updatedAt: at, bowId: 'g1', ringId: null, arrowId: null, shots: [shot(true), shot(false), shot(true), shot(true), shot(false)], tags: ['줌손'], memo: '메모', ...extra,
});
const day = (date: string, memo: string, at: number): DayNote => ({ date, memo, updatedAt: at });
const ranked = (id: string, d: string, hits: boolean[], extra: Partial<RankedEnd> = {}): RankedEnd => ({
  client_id: id, day: d, recorded_at: `${d}T09:00:00+09:00`, hits, tags: null, memo: null, scope: null, ...extra,
});

describe('순 기록 백업', () => {
  it('예시 기록은 올리지 않는다', () => {
    expect(recordIdsOf([end('e1', '2026-11-01', 1), end('sample-e2', '2026-11-01', 2)], [day('2026-11-01', '좋았다', 3)]))
      .toEqual(['e1', 'day:2026-11-01']);
  });

  it('새로 생기거나 고치거나 지운 것만 고른다', () => {
    const a = end('a', '2026-11-01', 1);
    const b = end('b', '2026-11-01', 2);
    const d1 = day('2026-11-01', '글', 1);
    const prev = { ends: [a, b], days: [d1] };
    const next = { ends: [a, { ...b, memo: '고침' }, end('c', '2026-11-02', 3), end('sample-x', '2026-11-02', 4)], days: [] };
    expect(changedRecordIds(prev, next).sort()).toEqual(['b', 'c', 'day:2026-11-01']);
    expect(changedRecordIds(prev, prev)).toEqual([]);
  });

  it('대기열은 이 기기에 있으면 올리고 없으면 지운다', () => {
    const e = end('a', '2026-11-01', 5);
    const r = splitRecordQueue(['a', 'gone', 'day:2026-11-01', 'day:2026-11-02'], [e], [day('2026-11-01', '글', 7)]);
    expect(r.put.map((x) => [x.id, x.u])).toEqual([['a', 5], ['day:2026-11-01', 7]]);
    expect(r.del).toEqual(['gone', 'day:2026-11-02']);
  });
});

describe('복구할 때 기록 합치기', () => {
  it('저장소가 비워진 기기에 백업을 모두 되살린다', () => {
    const e1 = end('e1', '2026-11-01', 1);
    const e2 = end('e2', '2026-11-03', 2);
    const rows = JSON.parse(JSON.stringify([
      { client_id: 'e2', data: e2 }, { client_id: 'e1', data: e1 }, { client_id: 'day:2026-11-01', data: day('2026-11-01', '좋았다', 3) },
      { client_id: 'bad', data: { id: 'other' } },
    ]));
    const r = mergeRecords({ ends: [], days: [] }, rows, []);
    expect(r.ends).toEqual([e1, e2]);
    expect(r.days).toEqual([day('2026-11-01', '좋았다', 3)]);
    expect(r.addedEnds).toHaveLength(2);
    expect(r.fromRanking).toBe(0);
  });

  it('이 기기 기록은 지우지 않고, 같은 순은 더 나중에 고친 쪽을 쓴다', () => {
    const today = end('t1', '2026-11-20', 100);
    const older = end('e1', '2026-11-01', 1, { memo: '예전' });
    const newer = { ...older, memo: '나중에 고침', updatedAt: 50 };
    const r = mergeRecords({ ends: [today, older], days: [] }, [{ client_id: 'e1', data: newer }, { client_id: 't1', data: { ...today, memo: '옛', updatedAt: 1 } }], []);
    expect(r.ends.map((e) => [e.id, e.memo])).toEqual([['t1', '메모'], ['e1', '나중에 고침']]);
    expect(r.addedEnds.map((e) => e.id)).toEqual(['e1']);
  });

  it('백업에 없는 순은 랭킹 기록에서 관중 여부만 되살린다', () => {
    const backed = end('e1', '2026-11-10', Date.parse('2026-11-10T09:00:00+09:00'));
    const r = mergeRecords({ ends: [], days: [] }, [{ client_id: 'e1', data: backed }], [
      ranked('e1', '2026-11-10', [true, true, true, true, true]),
      ranked('old1', '2026-11-05', [true, false, true, false, false], { memo: '공개 메모', tags: ['바람'], scope: 'club' }),
      ranked('bad', '2026-11-05', [true]),
    ]);
    expect(r.fromRanking).toBe(1);
    expect(r.ends.map((e) => e.id)).toEqual(['old1', 'e1']);
    const old = r.ends[0];
    expect(old.date).toBe('2026-11-05');
    expect(old.shots.map((s) => s.hit)).toEqual([true, false, true, false, false]);
    expect(old.shots[0].x).toBeNull();
    expect(old.memo).toBe('공개 메모');
    expect(old.tags).toEqual(['바람']);
    expect(old.share).toBe('club');
    expect(old.bowId).toBeNull();
  });

  it('랭킹 기록의 저장 시각이 이상하면 그날 낮으로 둔다', () => {
    const e = endFromRanked(ranked('x', '2026-11-05', [true, true, false, false, false], { recorded_at: 'nope' }))!;
    expect(new Date(e.recordedAt).toISOString()).toBe('2026-11-05T03:00:00.000Z');
  });

  it('알림 글', () => {
    expect(restoreMessage({ gear: 0, ends: 0, fromRanking: 0, days: 0 })).toBe('예전 닉네임과 랭킹 기록을 이어 씁니다');
    expect(restoreMessage({ gear: 0, ends: 3, fromRanking: 0, days: 0, nickname: '활쟁이' })).toBe("'활쟁이' 닉네임과 기록을 되살렸습니다 (순 기록 3순)");
    expect(restoreMessage({ gear: 2, ends: 18, fromRanking: 18, days: 0 }))
      .toBe('예전 닉네임과 기록을 되살렸습니다 (순 기록 18순, 장비 2개). 그중 18순은 랭킹 기록에서 되살려 관중 여부만 있습니다');
  });
});
