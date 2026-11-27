import type { DayNote, End, MemoShare, OnlineProfile, Settings } from './types';

/** 공개 메모 글자 수 한도 (서버도 같은 한도로 자른다) */
export const SHARED_MEMO_MAX = 500;
/** 공개 메모에 함께 올리는 태그 수 한도 */
export const SHARED_TAGS_MAX = 10;

export const SHARE_LABEL: Record<MemoShare, string> = { all: '전체 공개', club: '같은 활터 공개' };

/** 메모 공개 상태. 메모와 태그가 없으면 보일 것이 없으니 null */
export type ShareState = MemoShare | 'private';
export function shareStateOf(e: End): ShareState | null {
  if (!e.memo.trim() && !e.tags.length) return null;
  return e.share ?? 'private';
}
export const SHARE_STATE_LABEL: Record<ShareState, string> = { ...SHARE_LABEL, private: '나만 보기' };

/** 새 순의 공개 범위: 마지막으로 고른 것. 참여하지 않았거나, 같은 활터인데 소속이 없으면 나만 보기 */
export function defaultShare(settings: Pick<Settings, 'lastShare'>, online: Pick<OnlineProfile, 'rangeName'> | null | undefined): MemoShare | null {
  const s = settings.lastShare ?? null;
  if (!online || !s) return null;
  if (s === 'club' && !online.rangeName) return null;
  return s;
}

/** 그날 몇 번째 순인지 (저장한 차례, 1부터) */
export function endNoOf(ends: End[], e: End): number {
  const day = ends.filter((x) => x.date === e.date).sort((a, b) => a.recordedAt - b.recordedAt || (a.id < b.id ? -1 : 1));
  const i = day.findIndex((x) => x.id === e.id);
  return i < 0 ? day.length + 1 : i + 1;
}

export interface ShareArgs {
  p_client_id: string;
  p_day: string;
  p_end_no: number;
  p_hits: boolean[];
  p_tags: string[];
  p_memo: string;
  p_scope: MemoShare;
}

/** 서버에 올릴 공개 메모. 공개하지 않았거나 메모와 태그가 모두 비었으면 null (= 서버에서 내린다) */
export function shareArgs(e: End | undefined, ends: End[]): ShareArgs | null {
  if (!e?.share) return null;
  const memo = e.memo.trim().slice(0, SHARED_MEMO_MAX);
  const tags = e.tags.slice(0, SHARED_TAGS_MAX);
  if (!memo && !tags.length) return null;
  return { p_client_id: e.id, p_day: e.date, p_end_no: endNoOf(ends, e), p_hits: e.shots.map((s) => s.hit), p_tags: tags, p_memo: memo, p_scope: e.share };
}

/** 하루 메모를 서버에 올릴 때 쓰는 이름. 궁사마다 하루에 하나 */
export const DAY_PREFIX = 'day:';
export const dayClientId = (date: string) => `${DAY_PREFIX}${date}`;
export const isDayClientId = (id: string) => id.startsWith(DAY_PREFIX);

export interface DayShareArgs {
  p_day: string;
  p_ends: number;
  p_hits: number;
  p_memo: string;
  p_scope: MemoShare;
}

/** 서버에 올릴 공개 하루 메모 (그날 순 수와 관중 수를 함께). 공개하지 않았거나 메모가 비었으면 null (= 서버에서 내린다) */
export function dayShareArgs(d: DayNote | undefined, ends: End[]): DayShareArgs | null {
  if (!d?.share) return null;
  const memo = d.memo.trim().slice(0, SHARED_MEMO_MAX);
  if (!memo) return null;
  const day = ends.filter((e) => e.date === d.date);
  const hits = day.reduce((n, e) => n + e.shots.filter((s) => s.hit).length, 0);
  return { p_day: d.date, p_ends: day.length, p_hits: hits, p_memo: memo, p_scope: d.share };
}

/** 하루 메모 공개 상태. 메모가 없으면 null */
export const dayShareStateOf = (d: DayNote | undefined): ShareState | null => (d?.memo.trim() ? d.share ?? 'private' : null);

/**
 * 같은 활터·전체 공개로 저장하기 전에 한 번 물어봐야 하는가.
 * 공개할 내용이 있고, 새로 공개하거나 공개 범위·메모·태그가 이미 공개한 것과 다를 때 묻는다 (시만 고치면 묻지 않는다).
 */
export function needsShareConfirm(prev: Pick<End, 'memo' | 'tags' | 'share'> | null | undefined, next: Pick<End, 'memo' | 'tags' | 'share'>): boolean {
  const memo = next.memo.trim();
  if (!next.share || (!memo && !next.tags.length)) return false;
  if (!prev?.share) return true;
  return prev.share !== next.share || prev.memo.trim() !== memo || prev.tags.join('\u0000') !== next.tags.join('\u0000');
}

/** 확인 창에 쓰는 공개 범위 설명: "동네 활터 궁사에게", "모든 궁사에게" */
export const shareAudience = (scope: MemoShare, rangeName: string | null | undefined) => (scope === 'club' ? `${rangeName ?? '내 소속 활터'} 궁사에게` : '모든 궁사에게');

/** 이 순의 공개 상태를 서버에 다시 알려야 하는가 (공개 중이었거나 공개하게 됐으면) */
export const shareTouched = (before: End | undefined, after: End | undefined) => !!(before?.share || after?.share);

/** 서버가 돌려준 공개 메모 한 줄 */
export interface SharedMemo {
  id: number;
  nickname: string;
  range_name: string | null;
  dan: number | null;
  day: string;
  end_no: number | null;
  hits: boolean[];
  tags: string[];
  memo: string;
  scope: MemoShare;
  created_at: string;
  updated_at: string;
  mine: boolean;
  /** 댓글 수 (서버에 008이 없으면 없음) */
  comments?: number;
  /** 남이 단 가장 최근 댓글 id (서버에 009가 없으면 없음) */
  last_comment?: number | null;
  /** 'day'면 하루 메모 (서버에 010이 없으면 없음 = 순 메모) */
  kind?: 'end' | 'day';
  /** 하루 메모만: 그날 쏜 순 수와 관중 수 */
  ends?: number | null;
  hit_count?: number | null;
  /** 반응 수 (서버에 017이 없으면 없음 = 반응 버튼을 보이지 않는다) */
  reactions?: ReactionCounts;
  /** 내가 누른 반응들 (018). 017 서버는 하나만 my_reaction으로 준다 */
  my_reactions?: ReactionKind[];
  my_reaction?: ReactionKind | null;
  /** 내 메모만: 반응마다 가장 최근 번호 (새 반응 표시용) */
  reaction_last?: ReactionCounts | null;
  /** 내 메모만: 신고가 많아 다른 사람에게 숨겨졌다 (서버 019) */
  report_hidden?: boolean;
  /** 글을 올릴 때 글쓴이의 등급 1~5 (서버 020). 그 전에 올린 글이나 등급이 없던 궁사는 null */
  grade?: number | null;
}

/** 신고가 이 수를 넘은 메모·댓글은 글쓴이와 관리자만 본다 (서버 _report_hide_limit와 같은 값) */
export const REPORT_HIDE_LIMIT = 20;

/** 메모와 댓글에 남기는 반응. 한 사람이 종류마다 한 번씩 (여러 개 함께 가능) */
export const REACTIONS = [
  { kind: 'like', emoji: '👍', label: '좋아요' },
  { kind: 'sad', emoji: '😢', label: '슬퍼요' },
  { kind: 'yes', emoji: '🙆', label: '넵!' },
  { kind: 'thanks', emoji: '🙏', label: '감사해요' },
] as const;
export type ReactionKind = (typeof REACTIONS)[number]['kind'];
export type ReactionCounts = Partial<Record<ReactionKind, number>>;

/**
 * 반응을 눌렀을 때 바로 보일 상태 (서버 답을 기다리지 않고). 이미 남긴 반응이면 취소, 아니면 하나 더한다.
 * 다른 반응은 그대로 둔다. 서버(react_memo, react_comment)도 같은 규칙이다.
 */
export function toggleReaction(counts: ReactionCounts, mine: ReactionKind[], pressed: ReactionKind): { counts: ReactionCounts; mine: ReactionKind[] } {
  const next: ReactionCounts = { ...counts };
  const had = mine.includes(pressed);
  const n = Math.max(0, (next[pressed] ?? 0) + (had ? -1 : 1));
  if (n) next[pressed] = n; else delete next[pressed];
  return { counts: next, mine: had ? mine.filter((k) => k !== pressed) : [...mine, pressed] };
}

/** 서버가 준 내 반응 (018은 목록, 017은 하나) */
export const myReactionsOf = (x: { my_reactions?: ReactionKind[] | null; my_reaction?: ReactionKind | null }): ReactionKind[] =>
  x.my_reactions ?? (x.my_reaction ? [x.my_reaction] : []);

/** 보일 반응: 누른 사람이 있는 것만, 정해진 차례대로 */
export const shownReactions = (counts: ReactionCounts) => REACTIONS.filter((r) => (counts[r.kind] ?? 0) > 0);

/** 내 메모에 새 댓글이 있는가: 남이 단 가장 최근 댓글이 내가 본 것보다 뒤 */
export const hasNewComment = (m: Pick<SharedMemo, 'mine' | 'last_comment'>, seen: number) => m.mine && (m.last_comment ?? 0) > seen;

/** 내 메모에 내가 본 뒤로 새로 온 반응 종류 */
export function newReactionKinds(m: Pick<SharedMemo, 'mine' | 'reaction_last'>, seen: number): ReactionKind[] {
  if (!m.mine || !m.reaction_last) return [];
  return REACTIONS.map((r) => r.kind).filter((k) => (m.reaction_last?.[k] ?? 0) > seen);
}

/** 이 메모에 온 가장 최근 반응 번호 (내 메모만) */
export const lastReactionOf = (m: Pick<SharedMemo, 'reaction_last'>) => Math.max(0, ...Object.values(m.reaction_last ?? {}).map((n) => n ?? 0));

/** "새 댓글 2개, 새 반응 3개", 하나만 있으면 그것만 */
export function newsText(comments: number, reactions: number): string {
  return [comments > 0 ? `새 댓글 ${comments}개` : '', reactions > 0 ? `새 반응 ${reactions}개` : ''].filter(Boolean).join(', ');
}

/** 신고 사유 (고르기 쉽게 몇 가지만) */
export const REPORT_REASONS = ['욕설·비방', '광고·도배', '기타 부적절한 내용'] as const;

/** 댓글 글자 수 한도 (서버도 같은 한도) */
export const COMMENT_MAX = 300;

/** 서버가 돌려준 댓글 한 줄 */
export interface MemoComment {
  id: number;
  nickname: string;
  range_name: string | null;
  dan: number | null;
  body: string;
  created_at: string;
  /** 내가 쓴 댓글 */
  mine: boolean;
  /** 내가 지울 수 있는 댓글 (내가 썼거나 내 메모에 달린 것) */
  can_delete: boolean;
  /** 이 메모에서 내가 볼 수 있는 댓글 전체 수 (서버에 011이 없으면 없음) */
  total?: number;
  /** 반응 수 (서버에 018이 없으면 없음 = 댓글 반응을 쓰지 않는다) */
  reactions?: ReactionCounts;
  my_reactions?: ReactionKind[];
  /** 내 댓글만: 신고가 많아 다른 사람에게 숨겨졌다 (서버 019) */
  report_hidden?: boolean;
  /** 댓글을 달 때 글쓴이의 등급 1~5 (서버 020) */
  grade?: number | null;
}

/** 댓글은 한 번에 이만큼씩 (최근 것부터) */
export const COMMENT_PAGE = 50;
/** 활쏜얘기 목록에 한 번에 쌓아 두는 글 수. 넘으면 앞의 글을 비우고 다음 묶음만 보인다 */
export const MEMO_LIST_MAX = 150;

/** 더 보기를 눌렀을 때: 지금 목록에 이어 붙일지, 비우고 다음 묶음만 보일지 */
export const shouldReplacePage = (shown: number, page: number) => shown + page > MEMO_LIST_MAX;

/** 앞에 아직 안 불러온 댓글 수 */
export const olderCommentCount = (loaded: number, total: number | undefined) => Math.max(0, (total ?? loaded) - loaded);

/** 보낼 댓글 다듬기: 앞뒤 공백, 세 줄 넘게 빈 줄은 한 줄로. 비었거나 너무 길면 까닭을 돌려준다 */
export function cleanComment(s: string): { body: string; problem: string | null } {
  const body = s.trim().replace(/\n{3,}/g, '\n\n');
  if (!body) return { body, problem: '댓글 내용을 적어 주세요.' };
  if ([...body].length > COMMENT_MAX) return { body, problem: `댓글은 ${COMMENT_MAX}자까지 쓸 수 있습니다.` };
  return { body, problem: null };
}

/** "방금", "5분 전", "3시간 전", "어제", "4일 전", 그보다 오래면 날짜 */
export function agoLabel(iso: string, now = Date.now()): string {
  const m = Math.floor((now - Date.parse(iso)) / 60000);
  if (m < 1) return '방금';
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  if (d === 1) return '어제';
  if (d < 7) return `${d}일 전`;
  const t = new Date(iso);
  return `${t.getFullYear() !== new Date(now).getFullYear() ? `${t.getFullYear()}년 ` : ''}${t.getMonth() + 1}월 ${t.getDate()}일`;
}
