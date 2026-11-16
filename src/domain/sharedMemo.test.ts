import { describe, expect, it } from 'vitest';
import { agoLabel, defaultShare, endNoOf, shareArgs, shareStateOf, shareTouched } from './sharedMemo';
import type { End, Shot } from './types';

const shot = (hit: boolean): Shot => ({ hit, x: null, y: null, zone: null, side: null, level: null, direction: null });
const end = (id: string, date: string, at: number, extra: Partial<End> = {}): End =>
  ({ id, date, recordedAt: at, bowId: null, ringId: null, arrowId: null, shots: [true, false, true, true, false].map(shot), tags: [], memo: '', updatedAt: 0, ...extra });

describe('메모 공개', () => {
  const ends = [end('a', '2026-11-16', 30), end('b', '2026-11-16', 10), end('c', '2026-11-15', 50)];

  it('그날 몇 번째 순인지 저장한 차례로 센다', () => {
    expect(endNoOf(ends, ends[0])).toBe(2);
    expect(endNoOf(ends, ends[1])).toBe(1);
    expect(endNoOf(ends, ends[2])).toBe(1);
  });

  it('공개한 순만, 메모나 태그가 있을 때만 올린다', () => {
    expect(shareArgs(end('x', '2026-11-16', 1, { memo: '만작' }), [])).toBeNull();
    expect(shareArgs(end('x', '2026-11-16', 1, { share: 'all' }), [])).toBeNull();
    expect(shareArgs(end('x', '2026-11-16', 1, { share: 'all', memo: '  ' }), [])).toBeNull();
    expect(shareArgs(undefined, [])).toBeNull();
    const e = end('x', '2026-11-16', 1, { share: 'club', memo: ' 줌손이 흔들림 ', tags: ['줌손'] });
    expect(shareArgs(e, [e])).toEqual({
      p_client_id: 'x', p_day: '2026-11-16', p_end_no: 1, p_hits: [true, false, true, true, false], p_tags: ['줌손'], p_memo: '줌손이 흔들림', p_scope: 'club',
    });
  });

  it('긴 메모와 많은 태그는 서버 한도에 맞춰 자른다', () => {
    const e = end('x', '2026-11-16', 1, { share: 'all', memo: '가'.repeat(600), tags: Array.from({ length: 12 }, (_, i) => `t${i}`) });
    const a = shareArgs(e, [e])!;
    expect(a.p_memo).toHaveLength(500);
    expect(a.p_tags).toHaveLength(10);
  });

  it('공개 중이었거나 공개하게 된 순만 서버에 알린다', () => {
    expect(shareTouched(end('x', 'd', 1), end('x', 'd', 1))).toBe(false);
    expect(shareTouched(end('x', 'd', 1, { share: 'all' }), end('x', 'd', 1))).toBe(true);
    expect(shareTouched(undefined, end('x', 'd', 1, { share: 'club' }))).toBe(true);
    expect(shareTouched(end('x', 'd', 1, { share: 'all' }), undefined)).toBe(true);
  });

  it('올린 때를 짧게 적는다', () => {
    const now = Date.parse('2026-11-16T12:00:00+09:00');
    expect(agoLabel('2026-11-16T11:59:40+09:00', now)).toBe('방금');
    expect(agoLabel('2026-11-16T11:30:00+09:00', now)).toBe('30분 전');
    expect(agoLabel('2026-11-16T09:00:00+09:00', now)).toBe('3시간 전');
    expect(agoLabel('2026-11-15T09:00:00+09:00', now)).toBe('어제');
    expect(agoLabel('2026-11-12T09:00:00+09:00', now)).toBe('4일 전');
    expect(agoLabel('2026-10-01T09:00:00+09:00', now)).toBe('10월 1일');
  });
});

describe('공개 여부 기억과 표시', () => {
  const e = (extra: Partial<End>) => end('x', '2026-11-16', 1, extra);
  it('메모나 태그가 있는 순만 공개·나만 보기를 가른다', () => {
    expect(shareStateOf(e({}))).toBeNull();
    expect(shareStateOf(e({ memo: '만작' }))).toBe('private');
    expect(shareStateOf(e({ tags: ['줌손'], share: 'club' }))).toBe('club');
    expect(shareStateOf(e({ memo: '만작', share: 'all' }))).toBe('all');
  });
  it('새 순은 마지막으로 고른 공개 범위로 시작한다', () => {
    expect(defaultShare({ lastShare: 'all' }, { rangeName: null })).toBe('all');
    expect(defaultShare({ lastShare: 'club' }, { rangeName: '황학정' })).toBe('club');
    expect(defaultShare({ lastShare: 'club' }, { rangeName: null })).toBeNull();
    expect(defaultShare({ lastShare: 'all' }, null)).toBeNull();
    expect(defaultShare({}, { rangeName: '황학정' })).toBeNull();
  });
});
