import { describe, expect, it } from 'vitest';
import { agoLabel, cleanComment, dayClientId, dayShareArgs, dayShareStateOf, defaultShare, hasNewComment, endNoOf, olderCommentCount, shouldReplacePage, isDayClientId, needsShareConfirm, shareAudience, shareArgs, shareStateOf, shareTouched, toggleReaction, myReactionsOf, shownReactions, newReactionKinds, lastReactionOf, newsText } from './sharedMemo';
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

describe('댓글 다듬기', () => {
  it('앞뒤 공백과 긴 빈 줄을 줄이고, 비었거나 300자를 넘으면 막는다', () => {
    expect(cleanComment('  좋네요 \n\n\n\n다음에도 ')).toEqual({ body: '좋네요 \n\n다음에도', problem: null });
    expect(cleanComment('   ').problem).toBe('댓글 내용을 적어 주세요.');
    expect(cleanComment('가'.repeat(301)).problem).toBe('댓글은 300자까지 쓸 수 있습니다.');
    expect(cleanComment('가'.repeat(300)).problem).toBeNull();
  });
});

describe('새 댓글 표시', () => {
  it('내 메모에 남이 단 댓글이 본 것보다 뒤면 새 댓글', () => {
    expect(hasNewComment({ mine: true, last_comment: 12 }, 10)).toBe(true);
    expect(hasNewComment({ mine: true, last_comment: 10 }, 10)).toBe(false);
    expect(hasNewComment({ mine: true, last_comment: null }, 0)).toBe(false);
    expect(hasNewComment({ mine: false, last_comment: 99 }, 0)).toBe(false);
  });
});

describe('하루 메모 공개', () => {
  const shots = (s: string) => [...s].map((c) => ({ hit: c === 'o', x: null, y: null, zone: null, side: null, level: null, direction: null }));
  const e = (id: string, date: string, s: string) => ({ id, date, recordedAt: 1, bowId: null, ringId: null, arrowId: null, shots: shots(s), tags: [], memo: '', updatedAt: 1 });
  const ends = [e('a', '2026-11-16', 'ooxox'), e('b', '2026-11-16', 'ooooo'), e('c', '2026-11-15', 'ooooo')];

  it('공개한 하루 메모는 그날 순 수와 관중 수를 함께 올린다', () => {
    expect(dayShareArgs({ date: '2026-11-16', memo: ' 사범님 조언 ', share: 'club', updatedAt: 1 }, ends))
      .toEqual({ p_day: '2026-11-16', p_ends: 2, p_hits: 8, p_memo: '사범님 조언', p_scope: 'club' });
    expect(dayShareArgs({ date: '2026-11-14', memo: '메모만', share: 'all', updatedAt: 1 }, ends)).toMatchObject({ p_ends: 0, p_hits: 0 });
  });

  it('나만 보기거나 메모가 비었으면 내린다', () => {
    expect(dayShareArgs({ date: '2026-11-16', memo: '혼자 보기', updatedAt: 1 }, ends)).toBeNull();
    expect(dayShareArgs({ date: '2026-11-16', memo: '  ', share: 'all', updatedAt: 1 }, ends)).toBeNull();
    expect(dayShareArgs(undefined, ends)).toBeNull();
  });

  it('서버 이름과 공개 상태', () => {
    expect(dayClientId('2026-11-16')).toBe('day:2026-11-16');
    expect(isDayClientId('day:2026-11-16')).toBe(true);
    expect(isDayClientId('k3j2-abc')).toBe(false);
    expect(dayShareStateOf({ date: 'd', memo: '글', updatedAt: 1 })).toBe('private');
    expect(dayShareStateOf({ date: 'd', memo: '글', share: 'all', updatedAt: 1 })).toBe('all');
    expect(dayShareStateOf(undefined)).toBeNull();
  });
});

describe('공개 저장 확인', () => {
  const m = (memo: string, share: 'all' | 'club' | null, tags: string[] = []) => ({ memo, tags, share });
  it('새로 공개하는 메모는 묻는다', () => {
    expect(needsShareConfirm(null, m('만작 길게', 'all'))).toBe(true);
    expect(needsShareConfirm(null, m('', 'club', ['줌손']))).toBe(true);
    expect(needsShareConfirm(m('만작 길게', null), m('만작 길게', 'club'))).toBe(true);
  });
  it('나만 보기거나 공개할 내용이 없으면 묻지 않는다', () => {
    expect(needsShareConfirm(null, m('만작 길게', null))).toBe(false);
    expect(needsShareConfirm(null, m('  ', 'all'))).toBe(false);
    expect(needsShareConfirm(m('a', 'all'), m('a', null))).toBe(false);
  });
  it('이미 공개한 메모는 범위·메모·태그가 바뀔 때만 묻는다', () => {
    expect(needsShareConfirm(m('a', 'all', ['줌손']), m(' a ', 'all', ['줌손']))).toBe(false);
    expect(needsShareConfirm(m('a', 'all'), m('a', 'club'))).toBe(true);
    expect(needsShareConfirm(m('a', 'all'), m('b', 'all'))).toBe(true);
    expect(needsShareConfirm(m('a', 'all', ['줌손']), m('a', 'all', ['호흡']))).toBe(true);
  });
  it('공개 범위 설명', () => {
    expect(shareAudience('club', '동네 활터')).toBe('동네 활터 궁사에게');
    expect(shareAudience('club', null)).toBe('내 소속 활터 궁사에게');
    expect(shareAudience('all', '동네 활터')).toBe('모든 궁사에게');
  });
});

describe('글이 많아질 때', () => {
  it('목록이 150개를 넘게 되면 이어 붙이지 않고 다음 묶음만 보인다', () => {
    expect(shouldReplacePage(90, 30)).toBe(false);
    expect(shouldReplacePage(120, 30)).toBe(false);
    expect(shouldReplacePage(121, 30)).toBe(true);
    expect(shouldReplacePage(150, 30)).toBe(true);
  });
  it('앞에 남은 댓글 수 (서버가 전체 수를 주지 않으면 0)', () => {
    expect(olderCommentCount(50, 120)).toBe(70);
    expect(olderCommentCount(120, 120)).toBe(0);
    expect(olderCommentCount(30, undefined)).toBe(0);
  });
});

describe('메모 반응', () => {
  it('처음 누르면 하나 늘고 내 반응에 들어간다', () => {
    expect(toggleReaction({}, [], 'like')).toEqual({ counts: { like: 1 }, mine: ['like'] });
  });
  it('다시 누르면 그 반응만 취소된다', () => {
    expect(toggleReaction({ like: 1, thanks: 2 }, ['like', 'thanks'], 'like')).toEqual({ counts: { thanks: 2 }, mine: ['thanks'] });
  });
  it('다른 반응은 함께 남길 수 있다', () => {
    expect(toggleReaction({ like: 3 }, ['like'], 'sad')).toEqual({ counts: { like: 3, sad: 1 }, mine: ['like', 'sad'] });
  });
  it('서버 수가 내 반응보다 적어도 음수가 되지 않는다', () => {
    expect(toggleReaction({}, ['yes'], 'yes')).toEqual({ counts: {}, mine: [] });
  });
  it('017 서버의 하나짜리 내 반응도 읽는다', () => {
    expect(myReactionsOf({ my_reaction: 'sad' })).toEqual(['sad']);
    expect(myReactionsOf({ my_reactions: ['like', 'yes'] })).toEqual(['like', 'yes']);
    expect(myReactionsOf({})).toEqual([]);
  });
  it('누른 사람이 있는 반응만 정해진 차례로 보인다', () => {
    expect(shownReactions({ thanks: 1, like: 2, sad: 0 }).map((r) => r.kind)).toEqual(['like', 'thanks']);
  });
});

describe('새 반응 표시', () => {
  it('내 메모에서 본 번호보다 뒤의 반응만 새 반응', () => {
    expect(newReactionKinds({ mine: true, reaction_last: { like: 5, thanks: 9 } }, 6)).toEqual(['thanks']);
    expect(newReactionKinds({ mine: false, reaction_last: { like: 5 } }, 0)).toEqual([]);
    expect(newReactionKinds({ mine: true, reaction_last: null }, 0)).toEqual([]);
  });
  it('가장 최근 반응 번호', () => {
    expect(lastReactionOf({ reaction_last: { like: 5, sad: 12 } })).toBe(12);
    expect(lastReactionOf({ reaction_last: null })).toBe(0);
  });
  it('알림 문구', () => {
    expect(newsText(2, 3)).toBe('새 댓글 2개, 새 반응 3개');
    expect(newsText(0, 3)).toBe('새 반응 3개');
    expect(newsText(1, 0)).toBe('새 댓글 1개');
  });
});
